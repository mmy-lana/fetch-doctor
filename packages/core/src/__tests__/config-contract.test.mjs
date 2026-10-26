import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  initFetchDoctor,
  restoreFetchDoctor,
  getDiagnostics,
  getNetworkLogs,
  isUrlIgnored,
} from '../../dist/index.mjs';

let respond = async () => ({ status: 200, statusText: 'OK', headers: { get: () => null } });

function stubWindow() {
  respond = async () => ({ status: 200, statusText: 'OK', headers: { get: () => null } });
  // The engine patches window.fetch and captures this stub underneath; keep
  // the stub delegating to a swappable responder so tests can change behavior
  // without replacing the patched wrapper.
  globalThis.window = {
    fetch: (...args) => respond(...args),
  };
}

test('config contract: onIssueDetected + RegExp ignoreUrls work end-to-end', async () => {
  restoreFetchDoctor();
  stubWindow();
  const issues = [];
  initFetchDoctor({
    onIssueDetected: (i) => issues.push(i),
    ignoreUrls: [/analytics/],
    rules: { requireAbortSignal: true },
  });

  // Ignored URL: must not throw (the old JSON round-trip corrupted the RegExp
  // into {} and made every fetch reject) and must not be logged.
  await window.fetch('https://analytics.com/collect');
  assert.equal(getNetworkLogs().length, 0, 'ignored URL is not logged');

  // Non-ignored URL that fails: the callback must fire (it used to be silently
  // dropped by JSON serialization in useFetchDoctor).
  respond = async () => ({ status: 500, statusText: 'Err', headers: { get: () => null } });
  await window.fetch('https://api.test/data');
  assert.equal(getNetworkLogs().length, 1);
  assert.equal(issues.length, 1, 'onIssueDetected must fire');
  assert.equal(issues[0].type, 'UNHANDLED_HTTP_ERROR');
  assert.equal(getDiagnostics().missingAbortSignals, 1, 'signal-less request is still flagged');
});

test('config merge: partial rules keep defaults for unspecified thresholds', async () => {
  restoreFetchDoctor();
  stubWindow();
  initFetchDoctor({ rules: { slowThresholdMs: 5000 } });

  await window.fetch('https://api.test/data');

  assert.equal(
    getDiagnostics().missingAbortSignals,
    1,
    'requireAbortSignal default must survive a partial rules object'
  );
});

test('isUrlIgnored tolerates malformed pattern entries', () => {
  assert.equal(isUrlIgnored('https://api.test/x', [{}]), false, 'corrupt entry must not throw');
  assert.equal(isUrlIgnored('https://api.test/x', [null]), false);
  assert.equal(isUrlIgnored('https://api.test/beacon', ['beacon']), true);
  assert.equal(isUrlIgnored('https://api.test/x', [/api\.test/]), true);
});
