'use client';

import { useState } from 'react';
import { PuppeteerAuditResult, formatBytes, formatDuration } from '@fetch-doctor/shared';

export default function Home() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PuppeteerAuditResult | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-6 md:p-12 font-sans">
      <div className="max-w-5xl mx-auto space-y-8">
        <header className="border-b border-slate-800 pb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-extrabold text-cyan-400 flex items-center gap-2">
              🩺 Fetch Doctor Web Scanner
            </h1>
            <p className="text-slate-400 mt-2 text-sm">
              Headless CDP network auditor for zombie fetch detection, missing AbortSignals, and latency profiling.
            </p>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <a
              href="https://github.com/mmy-lana/fetch-doctor"
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 bg-slate-900 border border-slate-700 hover:border-cyan-500 text-slate-300 hover:text-cyan-400 rounded-md transition"
            >
              🐙 GitHub Repo
            </a>
            <a
              href="https://fetch-doctor-playground.vercel.app"
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 bg-slate-900 border border-slate-700 hover:border-cyan-500 text-slate-300 hover:text-cyan-400 rounded-md transition"
            >
              🧪 Playground
            </a>
          </div>
        </header>

        <form onSubmit={handleScan} className="flex flex-col sm:flex-row gap-3">
          <input
            type="url"
            required
            placeholder="https://example.com"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="flex-1 px-4 py-3 bg-slate-900 border border-slate-700 rounded-lg focus:outline-none focus:border-cyan-500 text-sm placeholder:text-slate-600"
          />
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-3 bg-cyan-600 hover:bg-cyan-500 text-white font-semibold rounded-lg disabled:opacity-50 transition text-sm flex items-center justify-center gap-2"
          >
            {loading ? 'Auditing Network Traffic...' : 'Run Diagnostics'}
          </button>
        </form>

        {error && (
          <div className="p-4 bg-red-950/50 border border-red-800 rounded-lg text-red-300 text-sm">
            ⚠️ {error}
          </div>
        )}

        {result && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-4 bg-slate-900 border border-slate-800 rounded-lg text-center">
                <div className="text-2xl font-bold text-slate-200">{result.summary.score}/100</div>
                <div className="text-xs text-slate-400 mt-1">Health Score</div>
              </div>
              <div className="p-4 bg-slate-900 border border-slate-800 rounded-lg text-center">
                <div className="text-2xl font-bold text-cyan-400">{result.totalRequests}</div>
                <div className="text-xs text-slate-400 mt-1">Total Requests</div>
              </div>
              <div className="p-4 bg-slate-900 border border-slate-800 rounded-lg text-center">
                <div className="text-2xl font-bold text-red-400">{result.summary.zombieFetches}</div>
                <div className="text-xs text-slate-400 mt-1">Zombie Fetches</div>
              </div>
              <div className="p-4 bg-slate-900 border border-slate-800 rounded-lg text-center">
                <div className="text-2xl font-bold text-yellow-400">{formatBytes(result.totalBytes)}</div>
                <div className="text-xs text-slate-400 mt-1">Data Transferred</div>
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-lg p-6">
              <h2 className="text-lg font-bold text-slate-200 mb-4">Intercepted Requests</h2>
              <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
                {result.logs.map((log) => (
                  <div key={log.id} className="p-3 bg-slate-950 border border-slate-800 rounded-md text-xs space-y-1">
                    <div className="flex justify-between font-mono">
                      <span className="text-cyan-400 font-bold">{log.method}</span>
                      <span className={log.status && log.status < 400 ? 'text-green-400' : 'text-red-400'}>
                        {log.status || 'ABORTED'}
                      </span>
                    </div>
                    <div className="text-slate-300 truncate">{log.url}</div>
                    <div className="flex justify-between text-slate-500 pt-1 border-t border-slate-900">
                      <span>Duration: {formatDuration(log.duration || 0)}</span>
                      <span>Payload: {formatBytes(log.bytesReceived || 0)}</span>
                    </div>
                    {log.issues.map((issue) => (
                      <div key={issue.id} className="text-red-400 pt-1 font-sans">
                        ⚠️ {issue.message} — <span className="text-slate-400">{issue.recommendation}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        <footer className="pt-8 border-t border-slate-900 text-center text-xs text-slate-500 flex flex-col sm:flex-row justify-between items-center gap-2">
          <div>
            Created by <a href="https://github.com/mmy-lana" target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:underline">@mmy-lana</a>
          </div>
          <div className="flex gap-4">
            <a href="https://www.npmjs.com/package/@fetch-doctor/core" target="_blank" rel="noopener noreferrer" className="hover:text-slate-300">@fetch-doctor/core</a>
            <a href="https://www.npmjs.com/package/@fetch-doctor/react" target="_blank" rel="noopener noreferrer" className="hover:text-slate-300">@fetch-doctor/react</a>
            <a href="https://www.npmjs.com/package/@fetch-doctor/shared" target="_blank" rel="noopener noreferrer" className="hover:text-slate-300">@fetch-doctor/shared</a>
          </div>
        </footer>
      </div>
    </main>
  );
}