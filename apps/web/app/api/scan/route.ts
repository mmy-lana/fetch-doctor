import { NextRequest, NextResponse } from 'next/server';
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
import {
  NetworkRequestLog,
  FetchDiagnosticIssue,
  PuppeteerAuditResult,
  generateRequestId,
} from '@fetch-doctor/shared';

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { url, timeoutMs = 15000 } = body;

    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: 'Valid URL is required' }, { status: 400 });
    }

    const formattedUrl = url.startsWith('http://') || url.startsWith('https://') ? url : `https://${url}`;

    const isLocal = process.env.NODE_ENV === 'development';
    const executablePath = isLocal
      ? process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
      : await chromium.executablePath();

    const browser = await puppeteer.launch({
      args: isLocal ? ['--no-sandbox', '--disable-setuid-sandbox'] : chromium.args,
      defaultViewport: { width: 1280, height: 800 },
      executablePath,
      headless: true,
    });

    const page = await browser.newPage();
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
        timeout: timeoutMs,
      });
    } catch {
      // Continue analyzing partial logs if page load hits execution timeout
    }

    await new Promise((resolve) => setTimeout(resolve, 2000));
    await browser.close();

    const logs: NetworkRequestLog[] = [];
    let zombieCount = 0;
    let slowCount = 0;
    let httpErrCount = 0;
    let totalBytes = 0;

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
        const isAborted = req.errorText.includes('ERR_ABORTED');
        if (isAborted) {
          zombieCount++;
        } else {
          httpErrCount++;
        }
        issues.push({
          id: generateRequestId(),
          type: isAborted ? 'ZOMBIE_FETCH' : 'CORS_OR_NETWORK_ERROR',
          severity: isAborted ? 'critical' : 'error',
          message: `${isAborted ? 'Aborted network request' : 'Network failure (' + req.errorText + ')'}: ${req.url}`,
          url: req.url,
          method: req.method,
          timestamp: Date.now(),
          recommendation: isAborted
            ? 'Attach AbortController signals to component lifecycle hooks to avoid memory leaks.'
            : 'Check server status, CORS policies, and network connectivity.',
        });
      }

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
        signalAttached: true,
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
        missingAbortSignals: 0,
        slowResponses: slowCount,
        httpErrors: httpErrCount,
        score,
        issues: logs.flatMap((l) => l.issues),
      },
    };

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to scan target URL' },
      { status: 500 }
    );
  }
}