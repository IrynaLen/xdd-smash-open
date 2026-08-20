import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from '../core/protocol/openrtb25/builder.js';

function makeCtx(overrides = {}) {
  return {
    _raw: {
      id: 'r1',
      imp: [{ id: 'i1', ext: { smash: { dsp: { id: 1 } } } }],
      ext: { smash: {} },
    },
    _patches: [],
    _headers: {},
    _endpoint: null,
    destination: { url: 'https://default.dsp.com' },
    ...overrides,
  };
}

test('does not mutate raw body', () => {
  const ctx = makeCtx();
  const req = build(ctx);
  req.body.id = 'changed';
  assert.equal(ctx._raw.id, 'r1');
});

test('imp.X patch broadcasts to all imps', () => {
  const ctx = makeCtx({
    _raw: { id: 'r1', imp: [{ id: 'i1' }, { id: 'i2' }] },
    _patches: [{ path: 'imp.ext.bidder', value: { code: 'slot' } }],
  });
  const req = build(ctx);
  assert.deepEqual(req.body.imp[0].ext.bidder, { code: 'slot' });
  assert.deepEqual(req.body.imp[1].ext.bidder, { code: 'slot' });
});

test('non-imp patch applies to root', () => {
  const ctx = makeCtx({
    _patches: [{ path: 'ext.appnexus', value: { hb_source: 5 } }],
  });
  const req = build(ctx);
  assert.equal(req.body.ext.appnexus.hb_source, 5);
});

test('nested patch creates missing objects', () => {
  const ctx = makeCtx({
    _raw: { id: 'r1', imp: [{ id: 'i1' }] },
    _patches: [{ path: 'site.ext.rp', value: { site_id: 123 } }],
  });
  const req = build(ctx);
  assert.equal(req.body.site.ext.rp.site_id, 123);
});

test('strips ext.smash from imp', () => {
  const ctx = makeCtx();
  const req = build(ctx);
  assert.equal(req.body.imp[0].ext.smash, undefined);
});

test('strips ext.smash from root', () => {
  const ctx = makeCtx();
  const req = build(ctx);
  assert.equal(req.body.ext?.smash, undefined);
});

test('uses ctx._endpoint over destination.url', () => {
  const ctx = makeCtx({ _endpoint: 'https://override.com' });
  assert.equal(build(ctx).url, 'https://override.com');
});

test('falls back to destination.url', () => {
  const ctx = makeCtx();
  assert.equal(build(ctx).url, 'https://default.dsp.com');
});

test('includes headers from ctx._headers', () => {
  const ctx = makeCtx({ _headers: { Authorization: 'Basic xyz' } });
  assert.equal(build(ctx).headers.Authorization, 'Basic xyz');
});
