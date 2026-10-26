import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isUrlIgnored } from '../../dist/index.mjs';

test('isUrlIgnored: no ignore list never filters', () => {
  assert.equal(isUrlIgnored('https://api.test/users', undefined), false);
  assert.equal(isUrlIgnored('https://api.test/users', []), false);
});

test('isUrlIgnored: string patterns match substrings', () => {
  const list = ['beacon'];
  assert.equal(isUrlIgnored('https://a.test/beacon', list), true);
  assert.equal(isUrlIgnored('https://a.test/beacon?x=1', list), true);
  assert.equal(isUrlIgnored('https://a.test/users', list), false);
});

test('isUrlIgnored: RegExp patterns are applied with .test()', () => {
  const list = [/analytics\.com/, /^https:\/\/a\.test\/health$/];
  assert.equal(isUrlIgnored('https://analytics.com/collect', list), true);
  assert.equal(isUrlIgnored('https://a.test/health', list), true);
  assert.equal(isUrlIgnored('https://a.test/healthz', list), false);
  assert.equal(isUrlIgnored('https://api.test/users', list), false);
});

test('isUrlIgnored: mixed string/RegExp lists evaluate every entry', () => {
  const list = ['beacon', /metrics/];
  assert.equal(isUrlIgnored('https://a.test/beacon', list), true);
  assert.equal(isUrlIgnored('https://a.test/metrics', list), true);
  assert.equal(isUrlIgnored('https://a.test/users', list), false);
});
