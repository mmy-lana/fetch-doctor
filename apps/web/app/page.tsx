'use client';

import { useState, useEffect } from 'react';
import { PuppeteerAuditResult, formatBytes, formatDuration } from '@fetch-doctor/shared';

const SCAN_STEPS = [
  'Initializing headless browser session...',
  'Connecting Chrome DevTools Protocol (CDP)...',
  'Navigating to target and recording traffic...',
  'Analyzing zombie fetches and network leaks...',
];

export default function Home() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [scanStepIndex, setScanStepIndex] = useState(0);
  const [result, setResult] = useState<PuppeteerAuditResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading) {
      setScanStepIndex(0);
      return;
    }
    const interval = setInterval(() => {
      setScanStepIndex((prev) => (prev < SCAN_STEPS.length - 1 ? prev + 1 : prev));
    }, 2800);
    return () => clearInterval(interval);
  }, [loading]);

  const handleScan = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedUrl = url.trim();
    if (!trimmedUrl) {
      setError('Please enter a valid target URL (e.g. https://example.com)');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Scan failed');
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred during scanning.');
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (log: PuppeteerAuditResult['logs'][number]) => {
    if (log.aborted) {
      return (
        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono border text-zinc-400 bg-zinc-900 border-zinc-800">
          ABORTED
        </span>
      );
    }
    if (!log.status) {
      return (
        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono border text-rose-400 bg-rose-950/40 border-rose-900/50">
          FAILED
        </span>
      );
    }
    if (log.status < 300) {
      return (
        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono border text-emerald-400 bg-emerald-950/40 border-emerald-900/50">
          {log.status}
        </span>
      );
    }
    if (log.status < 400) {
      return (
        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono border text-amber-400 bg-amber-950/40 border-amber-900/50">
          {log.status}
        </span>
      );
    }
    return (
      <span className="px-1.5 py-0.5 rounded text-[10px] font-mono border text-rose-400 bg-rose-950/40 border-rose-900/50">
        {log.status}
      </span>
    );
  };

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 p-6 md:p-12 font-sans selection:bg-zinc-800 selection:text-zinc-100">
      <div className="max-w-4xl mx-auto space-y-8">
        <header className="border-b border-zinc-800/80 pb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <svg aria-hidden="true" focusable="false" className="w-10 h-10 shrink-0" viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect width="200" height="200" rx="44" fill="#0F172A" stroke="#00F2FE" strokeWidth="2"/>
              <path d="M 42 108 L 68 108 L 75 121 L 86 66 L 100 150 L 109 94 L 118 115 L 127 108 L 158 108" stroke="#38BDF8" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M 149 97 L 164 108 L 149 119" stroke="#00F5A0" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round"/>
              <circle cx="100" cy="150" r="6" fill="#F43F5E"/>
            </svg>
            <div>
              <h1 className="text-xl font-semibold tracking-tight text-zinc-100">
                Fetch Doctor Web Scanner
              </h1>
              <p className="text-zinc-400 text-xs mt-0.5">
                Headless CDP network auditor for zombie fetch detection, missing signals, and latency diagnostics.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <a
              href="https://github.com/mmy-lana/fetch-doctor"
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-300 hover:text-zinc-100 rounded-md transition-colors"
            >
              GitHub Repo
            </a>
            <a
              href="https://fetch-doctor-playground.vercel.app"
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-300 hover:text-zinc-100 rounded-md transition-colors"
            >
              Playground
            </a>
          </div>
        </header>

        <form onSubmit={handleScan} className="flex flex-col sm:flex-row gap-2.5">
          <input
            type="url"
            required
            autoComplete="off"
            aria-label="Target URL to audit"
            placeholder="https://example.com"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="flex-1 px-3.5 py-2.5 bg-zinc-900/70 border border-zinc-800 rounded-lg text-sm font-mono text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-zinc-500 transition-colors"
          />
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2.5 bg-zinc-100 hover:bg-white active:bg-zinc-200 text-zinc-950 font-medium rounded-lg text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0 flex items-center justify-center gap-2"
          >
            {loading ? 'Auditing Traffic...' : 'Run Diagnostics'}
          </button>
        </form>

        {loading && (
          <div className="p-3.5 bg-zinc-900/50 border border-zinc-800/80 rounded-lg flex items-center gap-3 text-xs text-zinc-300 font-mono">
            <div className="w-3.5 h-3.5 border-2 border-zinc-400 border-t-transparent rounded-full animate-spin shrink-0" />
            <span>{SCAN_STEPS[scanStepIndex]}</span>
          </div>
        )}

        {error && (
          <div className="p-3.5 bg-rose-950/30 border border-rose-900/60 rounded-lg text-rose-300 text-xs font-mono">
            [ERROR] {error}
          </div>
        )}

        {result && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 sm:grid-cols-4 border border-zinc-800 rounded-xl bg-zinc-900/30 divide-y sm:divide-y-0 sm:divide-x divide-zinc-800 overflow-hidden">
              <div className="p-4 flex flex-col justify-between">
                <div className="text-[11px] font-medium uppercase tracking-wider text-zinc-400">Health Score</div>
                <div className={`text-2xl font-semibold tracking-tight font-mono mt-1 ${
                  result.summary.score >= 80 ? 'text-emerald-400' : result.summary.score >= 50 ? 'text-amber-400' : 'text-rose-400'
                }`}>
                  {result.summary.score}<span className="text-xs text-zinc-500 font-normal">/100</span>
                </div>
              </div>
              <div className="p-4 flex flex-col justify-between">
                <div className="text-[11px] font-medium uppercase tracking-wider text-zinc-400">Total Requests</div>
                <div className="text-2xl font-semibold tracking-tight font-mono text-zinc-100 mt-1">
                  {result.totalRequests}
                </div>
              </div>
              <div className="p-4 flex flex-col justify-between">
                <div className="text-[11px] font-medium uppercase tracking-wider text-zinc-400">Zombie Fetches</div>
                <div className={`text-2xl font-semibold tracking-tight font-mono mt-1 ${
                  result.summary.zombieFetches > 0 ? 'text-rose-400' : 'text-zinc-100'
                }`}>
                  {result.summary.zombieFetches}
                </div>
              </div>
              <div className="p-4 flex flex-col justify-between">
                <div className="text-[11px] font-medium uppercase tracking-wider text-zinc-400">Data Transferred</div>
                <div className="text-2xl font-semibold tracking-tight font-mono text-zinc-100 mt-1">
                  {formatBytes(result.totalBytes)}
                </div>
              </div>
            </div>

            <div className="border border-zinc-800 rounded-xl bg-zinc-900/20 overflow-hidden">
              <div className="px-4 py-3 border-b border-zinc-800 bg-zinc-900/40 flex items-center justify-between">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-300">Intercepted Requests</h2>
                <span className="text-[11px] font-mono text-zinc-400 bg-zinc-800/70 px-2 py-0.5 rounded">
                  {result.logs.length} logged
                </span>
              </div>
              <div className="space-y-1.5 max-h-96 overflow-y-auto p-2">
                {result.logs.map((log) => (
                  <div key={log.id} className="p-3 bg-zinc-950/60 hover:bg-zinc-900/40 border border-zinc-800/60 rounded-lg text-xs space-y-2 transition-colors">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 min-w-0 font-mono text-xs">
                        <span className="font-semibold text-zinc-200 px-1.5 py-0.5 rounded bg-zinc-800/80 text-[10px] shrink-0">
                          {log.method}
                        </span>
                        <span className="text-zinc-300 truncate">{log.url}</span>
                      </div>
                      <div className="shrink-0">{getStatusBadge(log)}</div>
                    </div>
                    <div className="flex items-center justify-between text-[11px] font-mono text-zinc-500 pt-1.5 border-t border-zinc-900">
                      <span>Duration: {formatDuration(log.duration || 0)}</span>
                      <span>Payload: {formatBytes(log.bytesReceived || 0)}</span>
                    </div>
                    {log.issues.length > 0 && (
                      <div className="space-y-1 pt-1">
                        {log.issues.map((issue) => (
                          <div key={issue.id} className="p-2 bg-rose-950/20 border-l-2 border-rose-500/80 rounded-r text-[11px] text-rose-300 font-sans">
                            <span className="font-medium font-mono mr-1.5">[{issue.type}]</span>
                            {issue.message}
                            <div className="text-zinc-400 mt-0.5 text-[10px]">{issue.recommendation}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        <footer className="pt-6 border-t border-zinc-800/80 flex flex-col sm:flex-row justify-between items-center gap-3 text-xs text-zinc-500">
          <div>
            Created by <a href="https://github.com/mmy-lana" target="_blank" rel="noopener noreferrer" className="text-zinc-400 hover:text-zinc-200 transition-colors">@mmy-lana</a>
          </div>
          <div className="flex gap-4">
            <a href="https://www.npmjs.com/package/@fetch-doctor/core" target="_blank" rel="noopener noreferrer" className="hover:text-zinc-300 transition-colors">@fetch-doctor/core</a>
            <a href="https://www.npmjs.com/package/@fetch-doctor/react" target="_blank" rel="noopener noreferrer" className="hover:text-zinc-300 transition-colors">@fetch-doctor/react</a>
            <a href="https://www.npmjs.com/package/@fetch-doctor/shared" target="_blank" rel="noopener noreferrer" className="hover:text-zinc-300 transition-colors">@fetch-doctor/shared</a>
          </div>
        </footer>
      </div>
    </main>
  );
}