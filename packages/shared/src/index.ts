export const SHARED_VERSION = '0.0.1';

export type DiagnosticSeverity = 'info' | 'warning' | 'error' | 'critical';

export type IssueType =
  | 'ZOMBIE_FETCH'
  | 'MISSING_ABORT_SIGNAL'
  | 'SLOW_RESPONSE'
  | 'UNHANDLED_HTTP_ERROR'
  | 'MEMORY_LEAK_RISK'
  | 'CORS_OR_NETWORK_ERROR';

export interface FetchDiagnosticIssue {
  id: string;
  type: IssueType;
  severity: DiagnosticSeverity;
  message: string;
  url: string;
  method: string;
  timestamp: number;
  stackTrace?: string;
  duration?: number;
  bytesReceived?: number;
  recommendation: string;
}

export interface NetworkRequestLog {
  id: string;
  url: string;
  method: string;
  headers?: Record<string, string>;
  startTime: number;
  endTime?: number;
  duration?: number;
  status?: number;
  statusText?: string;
  aborted: boolean;
  signalAttached: boolean;
  requestBody?: unknown;
  responseBody?: unknown;
  bytesReceived?: number;
  issues: FetchDiagnosticIssue[];
}

export interface RuleThresholds {
  zombieThresholdMs?: number;
  slowThresholdMs?: number;
  requireAbortSignal?: boolean;
}

export interface FetchDoctorConfig {
  enableOverlay?: boolean;
  overlayPosition?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
  maxLogs?: number;
  ignoreUrls?: (string | RegExp)[];
  rules?: RuleThresholds;
  onIssueDetected?: (issue: FetchDiagnosticIssue) => void;
}

export interface DiagnosticSummary {
  totalRequests: number;
  zombieFetches: number;
  missingAbortSignals: number;
  slowResponses: number;
  httpErrors: number;
  score: number;
  issues: FetchDiagnosticIssue[];
}

export interface PuppeteerAuditOptions {
  url: string;
  timeoutMs?: number;
  waitUntil?: 'load' | 'domcontentloaded' | 'networkidle0' | 'networkidle2';
  viewport?: {
    width: number;
    height: number;
  };
}

export interface PuppeteerAuditResult {
  targetUrl: string;
  timestamp: number;
  totalRequests: number;
  totalBytes: number;
  durationMs: number;
  logs: NetworkRequestLog[];
  summary: DiagnosticSummary;
}

export const ANSI = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  gray: '\x1b[90m',
} as const;

export function formatBytes(bytes: number): string {
  if (bytes <= 0 || !Number.isFinite(bytes)) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const val = bytes / Math.pow(1024, i);
  return `${val.toFixed(i === 0 ? 0 : 2)} ${units[i]}`;
}

export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '0ms';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

export function generateRequestId(): string {
  const randomPart = Math.random().toString(36).substring(2, 9);
  const timePart = Date.now().toString(36);
  return `req_${timePart}_${randomPart}`;
}

export function isUrlIgnored(url: string, ignoreList?: (string | RegExp)[]): boolean {
  if (!ignoreList || ignoreList.length === 0) return false;
  return ignoreList.some((pattern) => {
    if (typeof pattern === 'string') {
      return url.includes(pattern);
    }
    return pattern.test(url);
  });
}