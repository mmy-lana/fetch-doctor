import { useState } from 'react';
import { useFetchDoctor, useTrackFetch, useFetchDoctorDiagnostics } from '@fetch-doctor/react';
import { formatDuration } from '@fetch-doctor/shared';

function ChildFetchComponent() {
  const trackedFetch = useTrackFetch();

  const triggerLeakingFetch = () => {
    fetch('https://httpbin.org/delay/5');
  };

  const triggerTrackedFetch = () => {
    trackedFetch('https://httpbin.org/delay/2').catch(() => {});
  };

  return (
    <div className="p-4 bg-slate-900 border border-slate-800 rounded-lg space-y-3">
      <h3 className="font-semibold text-cyan-400 text-sm">Active Child Component</h3>
      <div className="flex gap-2">
        <button
          onClick={triggerLeakingFetch}
          className="px-3 py-1.5 bg-red-600/80 hover:bg-red-500 text-white rounded text-xs font-medium"
        >
          Trigger Un-tracked 5s Request
        </button>
        <button
          onClick={triggerTrackedFetch}
          className="px-3 py-1.5 bg-green-600/80 hover:bg-green-500 text-white rounded text-xs font-medium"
        >
          Trigger Auto-Aborting 2s Request
        </button>
      </div>
    </div>
  );
}

export default function App() {
  useFetchDoctor({ enableOverlay: true });
  const { logs, summary } = useFetchDoctorDiagnostics();
  const [showChild, setShowChild] = useState(true);

  const triggerSlowFetch = () => {
    fetch('https://httpbin.org/delay/3');
  };

  const triggerErrorFetch = () => {
    fetch('https://httpbin.org/status/500');
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-8 font-sans">
      <div className="max-w-4xl mx-auto space-y-6">
        <header>
          <h1 className="text-2xl font-bold text-cyan-400">🩺 Fetch Doctor Playground</h1>
          <p className="text-xs text-slate-400 mt-1">
            Interactive test-bed for simulating zombie fetches, missing signals, and live overlay inspection.
          </p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-5 bg-slate-900 border border-slate-800 rounded-xl space-y-4">
            <h2 className="text-sm font-semibold text-slate-300">Simulate Network Anomalies</h2>
            <div className="flex flex-col gap-2">
              <button
                onClick={triggerSlowFetch}
                className="px-4 py-2 bg-yellow-600/80 hover:bg-yellow-500 text-white rounded text-xs font-medium text-left"
              >
                🐢 Simulate Slow Fetch (3s delay)
              </button>
              <button
                onClick={triggerErrorFetch}
                className="px-4 py-2 bg-red-600/80 hover:bg-red-500 text-white rounded text-xs font-medium text-left"
              >
                💥 Simulate HTTP 500 Error
              </button>
              <button
                onClick={() => setShowChild(!showChild)}
                className="px-4 py-2 bg-cyan-700 hover:bg-cyan-600 text-white rounded text-xs font-medium text-left"
              >
                {showChild ? '❌ Unmount Child Component (Test Zombie)' : '✅ Remount Child Component'}
              </button>
            </div>
            {showChild && <ChildFetchComponent />}
          </div>

          <div className="p-5 bg-slate-900 border border-slate-800 rounded-xl space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-sm font-semibold text-slate-300">Diagnostic Summary</h2>
              <span className="text-xs font-bold px-2 py-1 bg-slate-800 rounded text-cyan-400">
                Score: {summary.score}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2 bg-slate-950 rounded">Total: {summary.totalRequests}</div>
              <div className="p-2 bg-slate-950 rounded text-red-400">Zombies: {summary.zombieFetches}</div>
              <div className="p-2 bg-slate-950 rounded text-yellow-400">Missing Signal: {summary.missingAbortSignals}</div>
              <div className="p-2 bg-slate-950 rounded text-orange-400">Slow: {summary.slowResponses}</div>
            </div>
          </div>
        </div>

        <div className="p-5 bg-slate-900 border border-slate-800 rounded-xl space-y-3">
          <h2 className="text-sm font-semibold text-slate-300">Live Request Log Stream</h2>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {logs.length === 0 ? (
              <div className="text-xs text-slate-500">No network requests tracked yet.</div>
            ) : (
              logs.map((log) => (
                <div key={log.id} className="p-3 bg-slate-950 border border-slate-800 rounded text-xs flex justify-between">
                  <div>
                    <span className="font-bold text-cyan-400">{log.method}</span> {log.url}
                  </div>
                  <div className="text-slate-400">
                    {log.duration ? formatDuration(log.duration) : 'pending'}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}