import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initFetchDoctor, restoreFetchDoctor } from '../../dist/index.mjs';

// Minimal DOM stub: the overlay renders into shadowRoot.innerHTML, which the
// test captures so escaping can be asserted without a real browser.
let currentShadow = null;

function mountDom() {
  const shadow = {
    innerHTML: '',
    getElementById: () => null,
  };
  const body = {
    appendChild(el) {
      el.parentNode = body;
    },
    removeChild(el) {
      el.parentNode = null;
    },
  };
  globalThis.document = {
    createElement: () => ({ id: '', parentNode: null, attachShadow: () => shadow }),
    body,
  };
  currentShadow = shadow;
  return shadow;
}

function shadowHtml() {
  return currentShadow.innerHTML;
}

function reset() {
  restoreFetchDoctor();
  mountDom();
}

test('overlay escapes hostile characters in request URLs', async () => {
  reset();
  globalThis.window = {
    fetch: async () => ({ status: 200, statusText: 'OK', headers: { get: () => null } }),
  };
  initFetchDoctor({ enableOverlay: true, rules: { requireAbortSignal: false } });

  await window.fetch('https://evil.test/<img src=x onerror=window.__xss=1>/payload');

  const rendered = shadowHtml();
  assert.ok(!rendered.includes('<img'), 'raw markup must never reach innerHTML');
  assert.ok(rendered.includes('&lt;img'), 'markup must be HTML-escaped');
  assert.ok(
    rendered.includes('evil.test/&lt;img'),
    'truncated URL text must remain visible (escaped)'
  );
  restoreFetchDoctor();
});

test('overlay escapes hostile characters in issue messages', async () => {
  reset();
  globalThis.window = {
    fetch: () => Promise.reject(new Error('BADMARKER<img src=y onerror=window.__xss=2>')),
  };
  initFetchDoctor({ enableOverlay: true, rules: { requireAbortSignal: false } });

  await assert.rejects(() => window.fetch('https://evil.test/'), /BADMARKER/);

  const rendered = shadowHtml();
  assert.ok(!rendered.includes('<img'), 'issue messages must not inject markup');
  assert.ok(rendered.includes('BADMARKER&lt;img'), 'issue messages must be HTML-escaped');
  restoreFetchDoctor();
});
