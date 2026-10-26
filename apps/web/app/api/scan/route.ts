import { NextRequest, NextResponse } from 'next/server';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
import {
  NetworkRequestLog,
  FetchDiagnosticIssue,
  PuppeteerAuditResult,
  generateRequestId,
} from '@fetch-doctor/shared';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_URL_LENGTH = 2048;
const MIN_TIMEOUT_MS = 1000;
const MAX_TIMEOUT_MS = 45000;
const DEFAULT_TIMEOUT_MS = 15000;

// Best-effort abuse controls. This state is per serverless instance; it is not
// a distributed rate limiter. Set SCAN_TOKEN to require authentication.
const RATE_WINDOW_MS = 60_000;
const RATE_MAX_SCANS_PER_WINDOW = 5;
const MAX_CONCURRENT_SCANS = 2;
const rateBuckets = new Map<string, number[]>();
let activeScans = 0;

function isBlockedIPv4(ip: string): boolean {
  const octets = ip.split('.').map(Number);
  if (octets.length !== 4 || octets.some((o) => !Number.isInteger(o) || o < 0 || o > 255)) {
    return true;
  }
  const [a, b] = octets;
  if (a === 0) return true; // 0.0.0.0/8 "this network"
  if (a === 10) return true; // 10.0.0.0/8 private
  if (a === 127) return true; // 127.0.0.0/8 loopback
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local incl. cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 private
  if (a === 192 && b === 168) return true; // 192.168.0.0/16 private
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
  if (a === 198 && (b === 18 || b === 19)) return true; // 198.18.0.0/15 benchmarking
  if (a >= 224) return true; // multicast, reserved, broadcast
  return false;
}

function isBlockedIPv6(ip: string): boolean {
  const lower = ip.toLowerCase().split('%')[0];
  if (lower === '::' || lower === '::1') return true; // unspecified + loopback
  if (/^fe[89ab]/.test(lower)) return true; // fe80::/10 link-local
  if (/^f[cd]/.test(lower)) return true; // fc00::/7 unique-local
  if (lower.startsWith('ff')) return true; // multicast
  // IPv4-mapped (::ffff:a.b.c.d) and NAT64 (64:ff9b::a.b.c.d): judge the embedded IPv4.
  const mapped = lower.match(/^(?:::ffff:|64:ff9b::)(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (mapped) return isBlockedIPv4(mapped[1]);
  return false;
}

function isBlockedAddress(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) return isBlockedIPv4(ip);
  if (version === 6) return isBlockedIPv6(ip);
  return true; // unparseable addresses are refused
}

/**
 * SSRF guard: a target is allowed only when its hostname is not a local/special
 * name and DNS resolution yields exclusively public addresses. Results are
 * cached per scan. Redirects and sub-resources are re-validated through request
 * interception so a public first hop cannot pivot to an internal address.
 */
async function isPublicHost(hostname: string, cache: Map<string, boolean>): Promise<boolean> {
  const host = hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return false;
  const cached = cache.get(host);
  if (cached !== undefined) return cached;

  let allowed = false;
  if (isIP(host) !== 0) {
    allowed = !isBlockedAddress(host);
  } else {
    try {
      const records = await lookup(host, { all: true, verbatim: true });
      allowed = records.length > 0 && records.every((r) => !isBlockedAddress(r.address));
    } catch {
      allowed = false;
    }
  }
  cache.set(host, allowed);
  return allowed;
}

function tokenMatches(provided: string, expected: string): boolean {
  const a = createHash('sha256').update(provided).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

function clientKey(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return request.headers.get('x-real-ip') || 'local';
}

function rateAllows(key: string): boolean {
  const now = Date.now();
  const bucket = (rateBuckets.get(key) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  if (bucket.length >= RATE_MAX_SCANS_PER_WINDOW) {
    rateBuckets.set(key, bucket);
    return false;
  }
  bucket.push(now);
  rateBuckets.set(key, bucket);
  return true;
}

function hostChromePath(): string {
  if (process.platform === 'darwin') {
    return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  }
  if (process.platform === 'win32') {
    return 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  }
  return '';
}

export async function POST(request: NextRequest) {
  const scanToken = process.env.SCAN_TOKEN;
  if (scanToken) {
    const provided = request.headers.get('x-scan-token') ?? '';
    if (!tokenMatches(provided, scanToken)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const key = clientKey(request);
  if (!rateAllows(key)) {
    return NextResponse.json({ error: 'Too many scan requests, please retry later' }, { status: 429 });
  }
  if (activeScans >= MAX_CONCURRENT_SCANS) {
    return NextResponse.json({ error: 'Scanner is busy, please retry later' }, { status: 503 });
  }

  let body: { url?: unknown; timeoutMs?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const { url, timeoutMs } = body;

  if (!url || typeof url !== 'string' || url.length > MAX_URL_LENGTH) {
    return NextResponse.json({ error: 'Valid URL is required' }, { status: 400 });
  }

  const trimmedUrl = url.trim();
  const formattedUrl = trimmedUrl.startsWith('http://') || trimmedUrl.startsWith('https://') ? trimmedUrl : `https://${trimmedUrl}`;

  let target: URL;
  try {
    target = new URL(formattedUrl);
  } catch {
    return NextResponse.json({ error: 'Valid URL is required' }, { status: 400 });
  }
  if (target.protocol !== 'http:' && target.protocol !== 'https:') {
    return NextResponse.json({ error: 'Only http(s) targets are supported' }, { status: 400 });
  }

  const dnsCache = new Map<string, boolean>();
  if (!(await isPublicHost(target.hostname, dnsCache))) {
    return NextResponse.json(
      { error: 'Target host is not allowed (resolves to a blocked address)' },
      { status: 400 }
    );
  }

  const parsedTimeout = Number(timeoutMs);
  const effectiveTimeoutMs = Number.isFinite(parsedTimeout)
    ? Math.min(Math.max(parsedTimeout, MIN_TIMEOUT_MS), MAX_TIMEOUT_MS)
    : DEFAULT_TIMEOUT_MS;

  activeScans++;
  let browser: Awaited<ReturnType<typeof puppeteer.launch>> | null = null;
  try {
    // Platform-aware browser selection: the sparticuz binary is Linux-only and
    // previously broke `next start` scans on macOS/Windows ("spawn ENOEXEC")
    // because the choice was keyed off NODE_ENV. CHROME_PATH wins everywhere.
    const useSparticuz = !process.env.CHROME_PATH && process.platform === 'linux';
    const executablePath = process.env.CHROME_PATH
      ? process.env.CHROME_PATH
      : useSparticuz
        ? await chromium.executablePath()
        : hostChromePath();

    if (!executablePath) {
      throw new Error(
        'No Chromium executable found for this platform; set CHROME_PATH to a local Chrome/Chromium binary'
      );
    }

    // Host Chrome needs the no-sandbox flags to launch reliably in this
    // environment (without them the browser process dies on startup).
    browser = await puppeteer.launch({
      args: useSparticuz ? chromium.args : ['--no-sandbox', '--disable-setuid-sandbox'],
      defaultViewport: { width: 1280, height: 800 },
      executablePath,
      headless: true,
    });

    const page = await browser.newPage();

    // Instrument the page's fetch() calls so AbortSignal hygiene is measured
    // instead of assumed (CDP does not expose AbortSignal usage).
    await page.evaluateOnNewDocument(() => {
      const audit: Array<{ url: string; signal: boolean }> = [];
      (window as unknown as Record<string, unknown>).__fetchDoctorSignalAudit = audit;
      const originalFetch = window.fetch.bind(window);
      window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
        try {
          const url =
            typeof input === 'string'
              ? input
              : input instanceof URL
                ? input.toString()
                : (input as Request).url;
          audit.push({ url, signal: Boolean(init && init.signal) });
        } catch {
          // Never break the page under audit.
        }
        return originalFetch(input, init);
      }) as typeof window.fetch;
    });

    // Re-validate every navigation, redirect, and sub-resource against the
    // SSRF policy while the scan is in flight.
    await page.setRequestInterception(true);
    page.on('request', async (req) => {
      try {
        const reqUrl = new URL(req.url());
        const allowed =
          (reqUrl.protocol === 'http:' || reqUrl.protocol === 'https:') &&
          (await isPublicHost(reqUrl.hostname, dnsCache));
        if (allowed) {
          await req.continue();
        } else {
          await req.abort('blockedbyclient');
        }
      } catch {
        await req.abort('failed').catch(() => undefined);
      }
    });

    const client = await page.createCDPSession();

    await client.send('Network.enable');

    const rawRequests = new Map<
      string,
      {
        url: string;
        method: string;
        startTime: number;
        endTime?: number;
        status?: number;
        statusText?: string;
        bytes?: number;
        errorText?: string;
      }
    >();

    client.on('Network.requestWillBeSent', (params) => {
      if (params.request.url.startsWith('data:')) return;
      rawRequests.set(params.requestId, {
        url: params.request.url,
        method: params.request.method,
        startTime: params.timestamp * 1000,
      });
    });

    client.on('Network.responseReceived', (params) => {
      const req = rawRequests.get(params.requestId);
      if (req) {
        req.status = params.response.status;
        req.statusText = params.response.statusText;
        if (params.response.headers['content-length']) {
          req.bytes = parseInt(params.response.headers['content-length'], 10);
        }
      }
    });

    client.on('Network.loadingFinished', (params) => {
      const req = rawRequests.get(params.requestId);
      if (req) {
        req.endTime = params.timestamp * 1000;
        if (params.encodedDataLength) {
          req.bytes = params.encodedDataLength;
        }
      }
    });

    client.on('Network.loadingFailed', (params) => {
      const req = rawRequests.get(params.requestId);
      if (req) {
        req.endTime = params.timestamp * 1000;
        req.errorText = params.errorText;
      }
    });

    const scanStartTime = Date.now();

    try {
      await page.goto(formattedUrl, {
        waitUntil: 'networkidle2',
        timeout: effectiveTimeoutMs,
      });
    } catch {
      // Continue analyzing partial logs if page load hits execution timeout
    }

    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Read the fetch() instrumentation and correlate entries to intercepted
    // requests by URL (in call order) so signalAttached reflects reality
    // instead of a hardcoded value.
    let fetchSignalAudit: Array<{ url: string; signal: boolean }> = [];
    try {
      fetchSignalAudit = await page.evaluate(() => {
        const w = window as unknown as Record<string, unknown>;
        return (w.__fetchDoctorSignalAudit as Array<{ url: string; signal: boolean }>) ?? [];
      });
    } catch {
      // Page context may be unavailable; leave the audit empty.
    }
    const signalByUrl = new Map<string, boolean[]>();
    for (const entry of fetchSignalAudit) {
      const queue = signalByUrl.get(entry.url) ?? [];
      queue.push(entry.signal);
      signalByUrl.set(entry.url, queue);
    }

    const logs: NetworkRequestLog[] = [];
    let zombieCount = 0;
    let slowCount = 0;
    let httpErrCount = 0;
    let totalBytes = 0;
    let missingSignalCount = 0;

    rawRequests.forEach((req) => {
      const duration = req.endTime ? Math.max(0, req.endTime - req.startTime) : 0;
      const issues: FetchDiagnosticIssue[] = [];

      if (req.bytes) {
        totalBytes += req.bytes;
      }

      if (duration > 2000) {
        slowCount++;
        const isDocument = req.url === formattedUrl || req.url === `${formattedUrl}/`;
        issues.push({
          id: generateRequestId(),
          type: 'SLOW_RESPONSE',
          severity: 'warning',
          message: `Slow response duration (${Math.round(duration)}ms) from ${req.url}`,
          url: req.url,
          method: req.method,
          timestamp: Date.now(),
          duration,
          recommendation: isDocument
            ? 'High TTFB detected on initial HTML document. Optimize DNS lookup, SSL negotiation, static hosting provider latency, or CDN edge distribution.'
            : 'Optimize asset compression, backend query execution, or utilize CDN edge caching.',
        });
      }

      if (req.status && req.status >= 400) {
        httpErrCount++;
        issues.push({
          id: generateRequestId(),
          type: 'UNHANDLED_HTTP_ERROR',
          severity: 'error',
          message: `HTTP ${req.status} ${req.statusText || ''} returned for ${req.url}`,
          url: req.url,
          method: req.method,
          timestamp: Date.now(),
          recommendation: 'Verify endpoint configuration, authentication headers, and server logs.',
        });
      }

      if (req.errorText) {
        // Ordinary cancellations (ERR_ABORTED) are normal browser behavior —
        // speculative/preload loads, media range requests, navigation races —
        // NOT zombie fetches. They are recorded via the `aborted` flag only and
        // create neither issues nor score penalties.
        const isAborted = req.errorText.includes('ERR_ABORTED');
        if (!isAborted) {
          httpErrCount++;
          issues.push({
            id: generateRequestId(),
            type: 'CORS_OR_NETWORK_ERROR',
            severity: 'error',
            message: `Network failure (${req.errorText}): ${req.url}`,
            url: req.url,
            method: req.method,
            timestamp: Date.now(),
            recommendation: 'Check server status, CORS policies, and network connectivity.',
          });
        }
      }

      const fetchSignal = signalByUrl.get(req.url)?.shift();
      if (fetchSignal === false) missingSignalCount++;

      logs.push({
        id: generateRequestId(),
        url: req.url,
        method: req.method,
        startTime: req.startTime,
        endTime: req.endTime,
        duration,
        status: req.status,
        statusText: req.statusText,
        aborted: Boolean(req.errorText && req.errorText.includes('ERR_ABORTED')),
        // Non-fetch sub-resources never carry an AbortSignal; only instrumented
        // fetch() calls can report a real value here.
        signalAttached: fetchSignal ?? false,
        bytesReceived: req.bytes,
        issues,
      });
    });

    const totalRequests = logs.length;
    const penalty = zombieCount * 25 + slowCount * 5 + httpErrCount * 15;
    const score = Math.max(0, 100 - penalty);

    const result: PuppeteerAuditResult = {
      targetUrl: formattedUrl,
      timestamp: Date.now(),
      totalRequests,
      totalBytes,
      durationMs: Date.now() - scanStartTime,
      logs,
      summary: {
        totalRequests,
        zombieFetches: zombieCount,
        missingAbortSignals: missingSignalCount,
        slowResponses: slowCount,
        httpErrors: httpErrCount,
        score,
        issues: logs.flatMap((l) => l.issues),
      },
    };

    return NextResponse.json(result);
  } catch (error) {
    // Do not leak internal error details (paths, spawn failures, stack hints)
    // to the client; log them server-side with a correlating incident id.
    const incidentId = randomUUID();
    console.error('[api/scan] scan failed', incidentId, error);
    return NextResponse.json(
      { error: 'Failed to scan target URL', incidentId },
      { status: 500 }
    );
  } finally {
    activeScans--;
    if (browser) {
      await browser.close().catch(() => undefined);
    }
  }
}
