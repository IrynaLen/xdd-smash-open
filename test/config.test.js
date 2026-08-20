import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { loadConfig, resolveConfig } from '../core/config.js';


function tmp() {
  const dir = resolve(tmpdir(), `xdd-config-test-${process.pid}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return {
    dir,
    write(name, obj) { writeFileSync(resolve(dir, name), JSON.stringify(obj)); },
    path(name) { return resolve(dir, name); },
    cleanup() { rmSync(dir, { recursive: true, force: true }); },
  };
}


test('returns built-in config when no global path given', () => {
  const t = tmp();
  t.write('builtin.json', { endpoint: 'https://example.com', params: {} });
  const cfg = loadConfig(t.path('builtin.json'));
  assert.equal(cfg.endpoint, 'https://example.com');
  t.cleanup();
});

test('returns empty object when built-in file missing', () => {
  const cfg = loadConfig('/nonexistent/path/config.json');
  assert.deepEqual(cfg, {});
});


test('global namespace section overrides built-in', () => {
  const t = tmp();
  t.write('builtin.json', { params: {} });
  t.write('global.json', { adapters: { magnite: { params: { accountId: '42' } } } });
  const cfg = loadConfig(t.path('builtin.json'), t.path('global.json'), 'adapters.magnite');
  assert.equal(cfg.params.accountId, '42');
  t.cleanup();
});

test('built-in keys not in global are preserved', () => {
  const t = tmp();
  t.write('builtin.json', { endpoint: 'https://default.com', params: {} });
  t.write('global.json', { adapters: { magnite: { params: { accountId: '1' } } } });
  const cfg = loadConfig(t.path('builtin.json'), t.path('global.json'), 'adapters.magnite');
  assert.equal(cfg.endpoint, 'https://default.com');
  t.cleanup();
});

test('global key overwrites matching built-in key', () => {
  const t = tmp();
  t.write('builtin.json', { enabled: false, key: '' });
  t.write('global.json', { geoedge: { enabled: true, key: 'abc-123' } });
  const cfg = loadConfig(t.path('builtin.json'), t.path('global.json'), 'geoedge');
  assert.equal(cfg.enabled, true);
  assert.equal(cfg.key, 'abc-123');
  t.cleanup();
});

test('missing namespace section falls back to built-in only', () => {
  const t = tmp();
  t.write('builtin.json', { enabled: false });
  t.write('global.json', { port: 3001 });
  const cfg = loadConfig(t.path('builtin.json'), t.path('global.json'), 'geoedge');
  assert.equal(cfg.enabled, false);
  t.cleanup();
});

test('missing global file falls back to built-in only', () => {
  const t = tmp();
  t.write('builtin.json', { endpoint: 'https://x.com' });
  const cfg = loadConfig(t.path('builtin.json'), '/nonexistent/global.json', 'adapters.foo');
  assert.equal(cfg.endpoint, 'https://x.com');
  t.cleanup();
});


test('dot-path namespace resolves nested keys', () => {
  const t = tmp();
  t.write('builtin.json', {});
  t.write('global.json', { adapters: { triplelift: { params: { inventoryCode: 'xe-slot' } } } });
  const cfg = loadConfig(t.path('builtin.json'), t.path('global.json'), 'adapters.triplelift');
  assert.equal(cfg.params.inventoryCode, 'xe-slot');
  t.cleanup();
});

test('wrong namespace returns built-in only', () => {
  const t = tmp();
  t.write('builtin.json', { key: 'default' });
  t.write('global.json', { adapters: { foo: { key: 'global' } } });
  const cfg = loadConfig(t.path('builtin.json'), t.path('global.json'), 'adapters.bar');
  assert.equal(cfg.key, 'default');
  t.cleanup();
});


test('no namespace returns built-in config as-is', () => {
  const t = tmp();
  t.write('builtin.json', { port: 3001 });
  const cfg = loadConfig(t.path('builtin.json'));
  assert.equal(cfg.port, 3001);
  t.cleanup();
});


// resolveConfig — per-request A/B overlay

test('resolveConfig returns cfg unchanged when no overrides', () => {
  const cfg = { enabled: true, ttlMs: 60000 };
  assert.equal(resolveConfig({}, cfg, 'userDedup'), cfg);
  assert.equal(resolveConfig({ configOverrides: {} }, cfg, 'userDedup'), cfg);
  assert.equal(resolveConfig(undefined, cfg, 'userDedup'), cfg);
});

test('resolveConfig overlays the namespace overrides on top of cfg', () => {
  const cfg = { enabled: true, ttlMs: 60000, redisUrl: 'redis://x' };
  const ctx = { configOverrides: { userDedup: { ttlMs: 10000 } } };
  const out = resolveConfig(ctx, cfg, 'userDedup');
  assert.equal(out.ttlMs, 10000);
  assert.equal(out.enabled, true);
  assert.equal(out.redisUrl, 'redis://x');
  assert.equal(cfg.ttlMs, 60000); // original untouched
});

test('resolveConfig only overlays the matching namespace', () => {
  const cfg = { ttlMs: 60000 };
  const ctx = { configOverrides: { impFeedback: { creativeTypes: {} } } };
  assert.equal(resolveConfig(ctx, cfg, 'userDedup'), cfg);
});
