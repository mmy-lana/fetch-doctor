import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  initFetchDoctor,
  restoreFetchDoctor,
  getDiagnostics,
  getNetworkLogs,
} from '../../dist/index.mjs';

function stubWindow() {
  globalThis.window = {
    fetch: async () => ({ status: 200, statusText: 'OK', headers: { get: () => null } }),
  };
}

function reset() {
  restoreFetchDoctor();
  stubWindow();
}

test('config: defaults are active when no rules are provided', async () => {
  reset();
  initFetchDoctor({});

  await window.fetch('https://api.test/users');

  const summary = getDiagnostics();
  assert.equal(summary.totalRequests, 1);
  assert.equal(summary.missingAbortSignals, 1, 'requireAbortSignal defaults to true');
  assert.ok(summary.issues.some((i) => i.type === 'MISSING_ABORT_SIGNAL'));
});

test('config: explicit rules are honored', async () => {
  reset();
  initFetchDoctor({ rules: { requireAbortSignal: false, slowThresholdMs: 60000 } });

  await window.fetch('https://api.test/users');

  const summary = getDiagnostics();
  assert.equal(summary.missingAbortSignals, 0, 'requireAbortSignal: false suppresses the issue');
  assert.equal(summary.slowResponses, 0);
});

test('config: top-level options apply (maxLogs caps stored logs)', async () => {
  reset();
  initFetchDoctor({ maxLogs: 2, rules: { requireAbortSignal: false } });

  await window.fetch('https://api.test/1');
  await window.fetch('https://api.test/2');
  await window.fetch('https://api.test/3');

  const logs = getNetworkLogs();
  assert.equal(logs.length, 2, 'log history is capped at maxLogs');
  assert.equal(logs[0].url, 'https://api.test/3', 'newest entries are kept');
});

test('config: abort signal attached suppresses the missing-signal issue', async () => {
  reset();
  initFetchDoctor({});

  const controller = new AbortController();
  await window.fetch('https://api.test/users', { signal: controller.signal });

  const summary = getDiagnostics();
  assert.equal(summary.missingAbortSignals, 0);
  assert.equal(getNetworkLogs()[0].signalAttached, true);
});
