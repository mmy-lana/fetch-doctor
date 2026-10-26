import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  initFetchDoctor,
  restoreFetchDoctor,
  getDiagnostics,
  registerFetchScope,
  unregisterFetchScope,
} from '../../dist/index.mjs';

// Regression tests for the zombie-on-unmount false negative (BUG-003):
// Case A (untracked in-flight request + unmount) must flag 1 zombie.
// Case B (tracked + untracked in-flight + unmount) must flag exactly 1 zombie —
// the untracked request. The old scope-level `.some(s => s.aborted)` check
// suppressed zombie detection for ALL requests when any one was aborted.

function stubPendingWindow() {
  // Never-settling fetch keeps requests "in flight" at unmount time.
  globalThis.window = { fetch: () => new Promise(() => {}) };
}

test('Case A: untracked in-flight request + unmount flags exactly 1 zombie', async () => {
  restoreFetchDoctor();
  stubPendingWindow();
  const issues = [];
  initFetchDoctor({
    rules: { requireAbortSignal: false },
    onIssueDetected: (i) => issues.push(i),
  });

  const scopeId = registerFetchScope('UserProfile');
  window.fetch('https://api.test/users/1'); // untracked, no signal
  await Promise.resolve();
  unregisterFetchScope(scopeId, new Set()); // unmount: nothing aborted

  const zombies = issues.filter((i) => i.type === 'ZOMBIE_FETCH');
  assert.equal(zombies.length, 1);
  assert.equal(zombies[0].url, 'https://api.test/users/1');
  assert.equal(getDiagnostics().zombieFetches, 1);
});

test('Case B: tracked + untracked in-flight + unmount flags exactly 1 zombie (the untracked one)', async () => {
  restoreFetchDoctor();
  stubPendingWindow();
  const issues = [];
  initFetchDoctor({
    rules: { requireAbortSignal: false },
    onIssueDetected: (i) => issues.push(i),
  });

  const scopeId = registerFetchScope('UserProfile');
  const controller = new AbortController();
  window.fetch('https://api.test/tracked', { signal: controller.signal }); // cleanly aborted at unmount
  window.fetch('https://api.test/untracked'); // genuine zombie
  await Promise.resolve();

  // Mirrors useTrackFetch cleanup: abort first, then unregister.
  controller.abort('Component unmounted');
  unregisterFetchScope(scopeId, new Set([controller.signal]));

  const zombies = issues.filter((i) => i.type === 'ZOMBIE_FETCH');
  assert.equal(zombies.length, 1, 'exactly one zombie expected');
  assert.equal(zombies[0].url, 'https://api.test/untracked');
  assert.equal(getDiagnostics().zombieFetches, 1);
});

test('useTrackFetch-style AbortSignal.any signals are recognized as cleanly aborted', async () => {
  restoreFetchDoctor();
  stubPendingWindow();
  const issues = [];
  initFetchDoctor({
    rules: { requireAbortSignal: false },
    onIssueDetected: (i) => issues.push(i),
  });

  const scopeId = registerFetchScope('Child');
  const controller = new AbortController();
  const combined = AbortSignal.any([controller.signal, new AbortController().signal]);
  window.fetch('https://api.test/tracked', { signal: combined });
  await Promise.resolve();

  controller.abort('Component unmounted');
  unregisterFetchScope(scopeId, new Set([controller.signal]));

  const zombies = issues.filter((i) => i.type === 'ZOMBIE_FETCH');
  assert.equal(zombies.length, 0, 'the combined signal was aborted at unmount');
  assert.equal(getDiagnostics().zombieFetches, 0);
});
