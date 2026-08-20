import { test } from 'node:test';
import assert from 'node:assert/strict';
import handler from '../../features/injector/dsp/appnexus/prebid-dsp.js';
import { makeCtx, getPatch } from './helpers.js';

test('sets imp.ext.appnexus.placement_id', async () => {
  const ctx = makeCtx({ dsp: { params: { placementId: '12345' } } });
  await handler(ctx);
  assert.equal(getPatch(ctx, 'imp.ext.appnexus').placement_id, 12345);
});

test('falls back to impression.inventoryCode for placementId', async () => {
  const ctx = makeCtx({ impression: { inventoryCode: '99999' } });
  await handler(ctx);
  assert.equal(getPatch(ctx, 'imp.ext.appnexus').placement_id, 99999);
});

test('returns null if no placementId', async () => {
  const ctx = makeCtx();
  const result = await handler(ctx);
  assert.equal(result, null);
});

test('includes memberId in imp.ext.appnexus when provided', async () => {
  const ctx = makeCtx({ dsp: { params: { placementId: '1', memberId: '456' } } });
  await handler(ctx);
  assert.equal(getPatch(ctx, 'imp.ext.appnexus').member, '456');
});

test('omits member when memberId not provided', async () => {
  const ctx = makeCtx({ dsp: { params: { placementId: '1' } } });
  await handler(ctx);
  assert.equal(getPatch(ctx, 'imp.ext.appnexus').member, undefined);
});

test('sets ext.appnexus.hb_source = 5', async () => {
  const ctx = makeCtx({ dsp: { params: { placementId: '1' } } });
  await handler(ctx);
  assert.equal(getPatch(ctx, 'ext').appnexus.hb_source, 5);
});

test('moves schain from source.ext.schain to ext.schain', async () => {
  const schain = { ver: '1.0', nodes: [] };
  const ctx = makeCtx({
    dsp: { params: { placementId: '1' } },
    _raw: { imp: [{}], source: { ext: { schain } } },
  });
  await handler(ctx);
  assert.deepEqual(getPatch(ctx, 'ext.schain'), schain);
  assert.equal(getPatch(ctx, 'source.ext.schain'), undefined);
});

test('sets imp.secure = 1', async () => {
  const ctx = makeCtx({ dsp: { params: { placementId: '1' } } });
  await handler(ctx);
  assert.equal(getPatch(ctx, 'imp.secure'), 1);
});
