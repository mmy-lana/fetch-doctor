import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  initFetchDoctor,
  FetchDoctorEngine,
  restoreFetchDoctor,
  allowProductionOverlay,
} from '../../dist/index.mjs';

// SEC-004 regression tests: the diagnostic overlay exposes request URLs in the
// DOM and must not mount in production builds unless explicitly forced via
// allowProductionOverlay().

function mountDom() {
  const calls = { created: 0 };
  const shadow = { innerHTML: '', getElementById: () => null };
  const body = {
    appendChild(el) {
      el.parentNode = body;
    },
    removeChild(el) {
      el.parentNode = null;
    },
  };
  globalThis.window = {
    fetch: async () => ({ status: 200, statusText: 'OK', headers: { get: () => null } }),
  };
  globalThis.document = {
    createElement: () => {
      calls.created += 1;
      return { id: '', parentNode: null, attachShadow: () => shadow };
    },
    body,
  };
  return calls;
}

function withNodeEnv(value, fn) {
  const previous = process.env.NODE_ENV;
  if (value === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = value;
  try {
    return fn();
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
  }
}

test('production: enableOverlay true does NOT mount the overlay', () => {
  withNodeEnv('production', () => {
    restoreFetchDoctor();
    const calls = mountDom();
    const warnings = [];
    const originalWarn = console.warn;
    console.warn = (...args) => warnings.push(args.join(' '));
    try {
      initFetchDoctor({ enableOverlay: true });
    } finally {
      console.warn = originalWarn;
    }
    assert.equal(calls.created, 0, 'overlay must not mount in production');
    assert.ok(
      warnings.some((w) => w.includes('disabled in production')),
      'a warning must explain the refusal'
    );
  });
});

test('production: updateConfig cannot re-enable the overlay', () => {
  withNodeEnv('production', () => {
    restoreFetchDoctor();
    const calls = mountDom();
    initFetchDoctor({ enableOverlay: false });
    FetchDoctorEngine.getInstance().updateConfig({ enableOverlay: true });
    assert.equal(calls.created, 0, 'updateConfig must not mount the overlay in production');
  });
});

test('production: allowProductionOverlay() explicitly opts in', () => {
  withNodeEnv('production', () => {
    restoreFetchDoctor();
    const calls = mountDom();
    allowProductionOverlay();
    initFetchDoctor({ enableOverlay: true });
    assert.equal(calls.created, 1, 'explicit opt-in mounts the overlay');
    restoreFetchDoctor();
  });
});

test('non-production: enableOverlay true still mounts (playground/dev behavior)', () => {
  withNodeEnv('development', () => {
    restoreFetchDoctor();
    const calls = mountDom();
    initFetchDoctor({ enableOverlay: true });
    assert.equal(calls.created, 1, 'dev overlay behavior must be unchanged');
    restoreFetchDoctor();
  });
});
