import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRouter } from '../../core/router.js';

test('exact path match wins', () => {
  const r = createRouter();
  const h = () => {};
  r.add('GET', '/metrics', h);
  assert.equal(r.resolve('GET', '/metrics').handler, h);
});

test("'*' is a per-method catch-all", () => {
  const r = createRouter();
  const bid = () => {};
  r.add('POST', '*', bid);
  assert.equal(r.resolve('POST', '/anything').handler, bid);
});

test('an exact path beats the catch-all', () => {
  const r = createRouter();
  const exact = () => {};
  const star = () => {};
  r.add('POST', '*', star);
  r.add('POST', '/special', exact);
  assert.equal(r.resolve('POST', '/special').handler, exact);
});

test('method is case-insensitive', () => {
  const r = createRouter();
  const h = () => {};
  r.add('get', '/t', h);
  assert.equal(r.resolve('GET', '/t').handler, h);
});

test('no match returns null', () => {
  const r = createRouter();
  r.add('GET', '/metrics', () => {});
  assert.equal(r.resolve('GET', '/nope'), null);
  assert.equal(r.resolve('PUT', '/metrics'), null);
});

test('a non-function handler throws', () => {
  assert.throws(() => createRouter().add('GET', '/x', null), /handler must be a function/);
});
