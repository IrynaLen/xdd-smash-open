import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServices } from '../../core/services.js';

test('register / get / has / all', () => {
  const s = createServices();
  const inst = { name: 'tracking' };
  assert.equal(s.register('tracking', inst), inst);
  assert.equal(s.get('tracking'), inst);
  assert.equal(s.has('tracking'), true);
  assert.deepEqual(s.all(), [inst]);
});

test('get returns null for an unknown service', () => {
  assert.equal(createServices().get('nope'), null);
});

test('registering the same name twice throws', () => {
  const s = createServices();
  s.register('tracking', {});
  assert.throws(() => s.register('tracking', {}), /already registered/);
});
