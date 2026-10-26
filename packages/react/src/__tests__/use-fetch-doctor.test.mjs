import { test } from 'node:test';
import assert from 'node:assert/strict';

// Regression tests for useFetchDoctor (BUG-001): the hook used to round-trip
// its config through JSON.stringify/JSON.parse, which silently dropped
// `onIssueDetected` and corrupted RegExp ignore patterns into plain objects,
// making every subsequent fetch throw `pattern.test is not a function`.
//
// The hook runs in useEffect, so this test mounts a null-rendering component
// through react-dom/client against a minimal DOM stub (no test-only deps).

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function makeNode(nodeType) {
  const node = {
    nodeType,
    ownerDocument: null,
    parentNode: null,
    childNodes: [],
    style: {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {
      return true;
    },
    setAttribute() {},
    removeAttribute() {},
    getAttribute() {
      return null;
    },
    appendChild(c) {
      c.parentNode = node;
      node.childNodes.push(c);
      return c;
    },
    insertBefore(c) {
      c.parentNode = node;
      node.childNodes.unshift(c);
      return c;
    },
    removeChild(c) {
      const i = node.childNodes.indexOf(c);
      if (i >= 0) node.childNodes.splice(i, 1);
      c.parentNode = null;
      return c;
    },
    contains(other) {
      let n = other;
      while (n) {
        if (n === node) return true;
        n = n.parentNode;
      }
      return false;
    },
    textContent: '',
  };
  return node;
}

const fakeDocument = makeNode(9);
fakeDocument.nodeType = 9;
fakeDocument.documentElement = makeNode(1);
fakeDocument.body = makeNode(1);
fakeDocument.documentElement.appendChild(fakeDocument.body);
fakeDocument.createElement = (tag) => {
  const el = makeNode(1);
  el.tagName = String(tag).toUpperCase();
  el.ownerDocument = fakeDocument;
  return el;
};
fakeDocument.createTextNode = (t) => {
  const n = makeNode(3);
  n.textContent = t;
  return n;
};
fakeDocument.createComment = () => makeNode(8);
fakeDocument.activeElement = fakeDocument.body;
fakeDocument.getSelection = () => null;
fakeDocument.hasFocus = () => true;

for (const name of [
  'Node',
  'Element',
  'HTMLElement',
  'HTMLIFrameElement',
  'HTMLInputElement',
  'HTMLTextAreaElement',
  'HTMLSelectElement',
  'SVGElement',
  'Text',
  'Comment',
]) {
  globalThis[name] = class {};
}
fakeDocument.HTMLIFrameElement = globalThis.HTMLIFrameElement;

globalThis.document = fakeDocument;
globalThis.window = globalThis;
globalThis.window.document = fakeDocument;

// The fetch stub the engine will patch over. It delegates to a swappable
// responder so tests can change behavior without replacing the patched wrapper.
let respond = async () => ({ status: 200, statusText: 'OK', headers: { get: () => null } });
globalThis.window.fetch = (...args) => respond(...args);

const React = (await import('react')).default;
const { createRoot } = await import('react-dom/client');
const { act } = await import('react');
const { useFetchDoctor, getNetworkLogs, getDiagnostics } = await import('../../dist/index.mjs');

test('useFetchDoctor preserves onIssueDetected and RegExp ignoreUrls', async () => {
  const received = [];
  function Probe() {
    useFetchDoctor({
      enableOverlay: false,
      ignoreUrls: [/analytics/],
      onIssueDetected: (issue) => received.push(issue),
    });
    return null;
  }

  const container = fakeDocument.createElement('div');
  fakeDocument.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(React.createElement(Probe));
  });

  // RegExp pattern must survive: an ignored URL is skipped silently. Under the
  // old implementation this call rejected with
  // "TypeError: pattern.test is not a function".
  await act(async () => {
    await window.fetch('https://analytics.com/collect');
  });
  assert.equal(getNetworkLogs().length, 0, 'RegExp ignoreUrls must still work');

  // onIssueDetected must survive: a failing fetch raises an issue and the
  // caller's callback fires. Under the old implementation the callback was
  // dropped by JSON serialization.
  respond = async () => ({ status: 500, statusText: 'Err', headers: { get: () => null } });
  await act(async () => {
    await window.fetch('https://api.test/data');
  });
  assert.equal(getNetworkLogs().length, 1);
  assert.equal(received.length, 1, 'onIssueDetected must still be called');
  assert.equal(received[0].type, 'UNHANDLED_HTTP_ERROR');
  assert.equal(getDiagnostics().missingAbortSignals, 1, 'signal-less request is still flagged');

  await act(async () => {
    root.unmount();
  });
});
