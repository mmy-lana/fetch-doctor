import {
  FetchDoctorConfig,
  FetchDiagnosticIssue,
  NetworkRequestLog,
  DiagnosticSummary,
  generateRequestId,
  formatBytes,
  formatDuration,
  isUrlIgnored,
} from '@fetch-doctor/shared';

type DiagnosticListener = (logs: NetworkRequestLog[], summary: DiagnosticSummary) => void;

class FetchDoctorEngine {
  private static instance: FetchDoctorEngine | null = null;
  private originalFetch: typeof window.fetch | null = null;
  private isInitialized = false;
  private config: FetchDoctorConfig = {};
  private requestLogs: NetworkRequestLog[] = [];
  private activeRequests = new Map<string, { startTime: number; url: string; method: string }>();
  private listeners: Set<DiagnosticListener> = new Set();
  private overlayElement: HTMLElement | null = null;
  private shadowRoot: ShadowRoot | null = null;

  private constructor() {}

  public static getInstance(): FetchDoctorEngine {
    if (!FetchDoctorEngine.instance) {
      FetchDoctorEngine.instance = new FetchDoctorEngine();
    }
    return FetchDoctorEngine.instance;
  }

  public init(config: FetchDoctorConfig = {}): void {
    if (typeof window === 'undefined') {
      console.warn('🩺 [fetch-doctor]: SSR environment detected. Interceptors disabled.');
      return;
    }

    if (this.isInitialized) {
      this.updateConfig(config);
      return;
    }

    this.config = {
      enableOverlay: true,
      overlayPosition: 'bottom-right',
      maxLogs: 100,
      rules: {
        zombieThresholdMs: 3000,
        slowThresholdMs: 2000,
        requireAbortSignal: true,
      },
      ...config,
    };

    this.originalFetch = window.fetch;
    this.patchFetch();
    this.isInitialized = true;

    if (this.config.enableOverlay) {
      this.mountOverlay();
    }
  }

  public updateConfig(newConfig: FetchDoctorConfig): void {
    this.config = { ...this.config, ...newConfig };
    if (this.config.enableOverlay && !this.overlayElement && typeof window !== 'undefined') {
      this.mountOverlay();
    } else if (!this.config.enableOverlay && this.overlayElement) {
      this.unmountOverlay();
    }
  }

  public restore(): void {
    if (typeof window === 'undefined' || !this.isInitialized) return;
    if (this.originalFetch) {
      window.fetch = this.originalFetch;
      this.originalFetch = null;
    }
    this.unmountOverlay();
    this.isInitialized = false;
    this.requestLogs = [];
    this.activeRequests.clear();
    this.listeners.clear();
  }

  public getDiagnostics(): DiagnosticSummary {
    const issues: FetchDiagnosticIssue[] = [];
    let zombieFetches = 0;
    let missingAbortSignals = 0;
    let slowResponses = 0;
    let httpErrors = 0;

    for (const log of this.requestLogs) {
      for (const issue of log.issues) {
        issues.push(issue);
        if (issue.type === 'ZOMBIE_FETCH') zombieFetches++;
        if (issue.type === 'MISSING_ABORT_SIGNAL') missingAbortSignals++;
        if (issue.type === 'SLOW_RESPONSE') slowResponses++;
        if (issue.type === 'UNHANDLED_HTTP_ERROR') httpErrors++;
      }
    }

    const total = this.requestLogs.length;
    const penalty = zombieFetches * 25 + missingAbortSignals * 10 + slowResponses * 5 + httpErrors * 15;
    const score = Math.max(0, 100 - penalty);

    return {
      totalRequests: total,
      zombieFetches,
      missingAbortSignals,
      slowResponses,
      httpErrors,
      score,
      issues,
    };
  }

  public getLogs(): NetworkRequestLog[] {
    return [...this.requestLogs];
  }

  public clear(): void {
    this.requestLogs = [];
    this.activeRequests.clear();
    this.notifyListeners();
    this.renderOverlayContent();
  }

  public subscribe(listener: DiagnosticListener): () => void {
    this.listeners.add(listener);
    listener(this.getLogs(), this.getDiagnostics());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private patchFetch(): void {
    const self = this;
    const nativeFetch = this.originalFetch || window.fetch;

    window.fetch = async function (
      input: RequestInfo | URL,
      init?: RequestInit
    ): Promise<Response> {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const method = (init?.method || (typeof input === 'object' && 'method' in input ? input.method : 'GET')).toUpperCase();

      if (isUrlIgnored(url, self.config.ignoreUrls)) {
        return nativeFetch.apply(this, [input, init]);
      }

      const id = generateRequestId();
      const startTime = performance.now();
      const signalAttached = Boolean(init?.signal);
      const issues: FetchDiagnosticIssue[] = [];

      self.activeRequests.set(id, { startTime, url, method });

      if (!signalAttached && self.config.rules?.requireAbortSignal) {
        issues.push({
          id: `${id}_no_signal`,
          type: 'MISSING_ABORT_SIGNAL',
          severity: 'warning',
          message: `Request to ${method} ${url} is missing an AbortSignal.`,
          url,
          method,
          timestamp: Date.now(),
          recommendation: 'Pass an AbortSignal via fetch options to allow cancellation upon unmount or timeout.',
        });
      }

      let wasAborted = false;
      if (init?.signal) {
        if (init.signal.aborted) {
          wasAborted = true;
        } else {
          init.signal.addEventListener(
            'abort',
            () => {
              wasAborted = true;
            },
            { once: true }
          );
        }
      }

      const logEntry: NetworkRequestLog = {
        id,
        url,
        method,
        startTime,
        aborted: wasAborted,
        signalAttached,
        issues,
      };

      try {
        const response = await nativeFetch.apply(this, [input, init]);
        const endTime = performance.now();
        const duration = endTime - startTime;

        self.activeRequests.delete(id);

        logEntry.endTime = endTime;
        logEntry.duration = duration;
        logEntry.status = response.status;
        logEntry.statusText = response.statusText;
        logEntry.aborted = wasAborted;

        const contentLength = response.headers.get('content-length');
        if (contentLength) {
          logEntry.bytesReceived = parseInt(contentLength, 10);
        }

        if (wasAborted) {
          const issue: FetchDiagnosticIssue = {
            id: `${id}_zombie`,
            type: 'ZOMBIE_FETCH',
            severity: 'critical',
            message: `Zombie Fetch detected: Request to ${url} resolved after AbortSignal triggered.`,
            url,
            method,
            timestamp: Date.now(),
            duration,
            recommendation: 'Ensure component state updates are guarded or stream responses cancel immediately when aborted.',
          };
          logEntry.issues.push(issue);
          self.config.onIssueDetected?.(issue);
        }

        if (self.config.rules?.slowThresholdMs && duration > self.config.rules.slowThresholdMs) {
          const issue: FetchDiagnosticIssue = {
            id: `${id}_slow`,
            type: 'SLOW_RESPONSE',
            severity: 'warning',
            message: `Slow Network Response (${formatDuration(duration)}) from ${url}.`,
            url,
            method,
            timestamp: Date.now(),
            duration,
            recommendation: 'Consider caching, payload optimization, or background fetching.',
          };
          logEntry.issues.push(issue);
          self.config.onIssueDetected?.(issue);
        }

        if (response.status >= 400) {
          const issue: FetchDiagnosticIssue = {
            id: `${id}_http_err`,
            type: 'UNHANDLED_HTTP_ERROR',
            severity: 'error',
            message: `HTTP ${response.status} ${response.statusText} response for ${url}.`,
            url,
            method,
            timestamp: Date.now(),
            recommendation: 'Check response status code and add fallback error boundary handling.',
          };
          logEntry.issues.push(issue);
          self.config.onIssueDetected?.(issue);
        }

        self.addLog(logEntry);
        return response;
      } catch (error) {
        const endTime = performance.now();
        const duration = endTime - startTime;
        self.activeRequests.delete(id);

        logEntry.endTime = endTime;
        logEntry.duration = duration;
        logEntry.aborted = wasAborted || (error instanceof Error && error.name === 'AbortError');

        if (!logEntry.aborted) {
          const issue: FetchDiagnosticIssue = {
            id: `${id}_net_err`,
            type: 'CORS_OR_NETWORK_ERROR',
            severity: 'error',
            message: error instanceof Error ? error.message : 'Network request failed.',
            url,
            method,
            timestamp: Date.now(),
            duration,
            recommendation: 'Verify CORS headers, server connectivity, and internet access.',
          };
          logEntry.issues.push(issue);
          self.config.onIssueDetected?.(issue);
        }

        self.addLog(logEntry);
        throw error;
      }
    };
  }

  private addLog(log: NetworkRequestLog): void {
    const maxLogs = this.config.maxLogs || 100;
    this.requestLogs.unshift(log);
    if (this.requestLogs.length > maxLogs) {
      this.requestLogs.pop();
    }
    this.notifyListeners();
    this.renderOverlayContent();
  }

  private notifyListeners(): void {
    const summary = this.getDiagnostics();
    const logs = this.getLogs();
    this.listeners.forEach((listener) => listener(logs, summary));
  }

  private mountOverlay(): void {
    if (typeof document === 'undefined' || this.overlayElement) return;

    this.overlayElement = document.createElement('div');
    this.overlayElement.id = 'fetch-doctor-root';
    this.shadowRoot = this.overlayElement.attachShadow({ mode: 'open' });

    document.body.appendChild(this.overlayElement);
    this.renderOverlayContent();
  }

  private unmountOverlay(): void {
    if (this.overlayElement && this.overlayElement.parentNode) {
      this.overlayElement.parentNode.removeChild(this.overlayElement);
      this.overlayElement = null;
      this.shadowRoot = null;
    }
  }

  private renderOverlayContent(): void {
    if (!this.shadowRoot) return;

    const summary = this.getDiagnostics();
    const logs = this.getLogs().slice(0, 10);
    const pos = this.config.overlayPosition || 'bottom-right';

    let posStyle = 'bottom: 16px; right: 16px;';
    if (pos === 'bottom-left') posStyle = 'bottom: 16px; left: 16px;';
    if (pos === 'top-right') posStyle = 'top: 16px; right: 16px;';
    if (pos === 'top-left') posStyle = 'top: 16px; left: 16px;';

    const html = `
      <style>
        :host {
          all: initial;
          font-family: system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
          z-index: 999999;
          position: fixed;
          ${posStyle}
        }
        .container {
          background: #0d1117;
          color: #c9d1d9;
          border: 1px solid #30363d;
          border-radius: 8px;
          box-shadow: 0 8px 24px rgba(0,0,0,0.5);
          width: 320px;
          max-height: 420px;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          font-size: 12px;
        }
        .header {
          background: #161b22;
          padding: 8px 12px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 1px solid #30363d;
          font-weight: 600;
        }
        .score {
          padding: 2px 8px;
          border-radius: 12px;
          font-weight: bold;
          color: #fff;
          background: ${summary.score > 80 ? '#238636' : summary.score > 50 ? '#d29922' : '#da3633'};
        }
        .content {
          padding: 8px;
          overflow-y: auto;
          max-height: 340px;
        }
        .metric-row {
          display: flex;
          justify-content: space-between;
          margin-bottom: 6px;
          padding-bottom: 4px;
          border-bottom: 1px dashed #21262d;
        }
        .log-item {
          padding: 6px;
          border-radius: 4px;
          background: #161b22;
          margin-bottom: 4px;
        }
        .method {
          font-weight: bold;
          color: #58a6ff;
        }
        .badge-zombie { color: #f85149; font-weight: bold; }
        .badge-warn { color: #d29922; }
      </style>
      <div class="container">
        <div class="header">
          <span>🩺 Fetch Doctor</span>
          <span class="score">Score: ${summary.score}</span>
        </div>
        <div class="content">
          <div class="metric-row">
            <span>Total Requests: ${summary.totalRequests}</span>
            <span class="badge-zombie">Zombies: ${summary.zombieFetches}</span>
          </div>
          <div class="metric-row">
            <span class="badge-warn">Missing AbortSignal: ${summary.missingAbortSignals}</span>
            <span>Errors: ${summary.httpErrors}</span>
          </div>
          <div style="margin-top: 8px; font-weight: bold; margin-bottom: 4px;">Recent Logs:</div>
          ${
            logs.length === 0
              ? '<div style="color:#8b949e">No requests monitored yet.</div>'
              : logs
                  .map(
                    (l) => `
            <div class="log-item">
              <div><span class="method">${l.method}</span> ${l.url.substring(0, 35)}...</div>
              <div style="color: #8b949e; display: flex; justify-content: space-between; margin-top: 2px;">
                <span>${l.duration ? formatDuration(l.duration) : 'pending'}</span>
                <span>${l.bytesReceived ? formatBytes(l.bytesReceived) : ''}</span>
                <span style="color: ${l.status && l.status < 400 ? '#3fb950' : '#f85149'}">${l.status || 'ERR'}</span>
              </div>
              ${l.issues.map((i: FetchDiagnosticIssue) => `<div style="color: #f85149; font-size: 10px; margin-top:2px;">⚠️ ${i.message}</div>`).join('')}
            </div>
          `
                  )
                  .join('')
          }
        </div>
      </div>
    `;

    this.shadowRoot.innerHTML = html;
  }
}

export function initFetchDoctor(config?: FetchDoctorConfig): void {
  FetchDoctorEngine.getInstance().init(config);
}

export function restoreFetchDoctor(): void {
  FetchDoctorEngine.getInstance().restore();
}

export function getDiagnostics(): DiagnosticSummary {
  return FetchDoctorEngine.getInstance().getDiagnostics();
}

export function getNetworkLogs(): NetworkRequestLog[] {
  return FetchDoctorEngine.getInstance().getLogs();
}

export function clearDiagnostics(): void {
  FetchDoctorEngine.getInstance().clear();
}

export function subscribeDiagnostics(
  listener: (logs: NetworkRequestLog[], summary: DiagnosticSummary) => void
): () => void {
  return FetchDoctorEngine.getInstance().subscribe(listener);
}

export { FetchDoctorEngine };