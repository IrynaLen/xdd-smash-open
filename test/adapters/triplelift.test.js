import { test } from 'node:test';
import assert from 'node:assert/strict';
import handler from '../../features/injector/dsp/triplelift/prebid-dsp.js';
import { makeCtx, getPatch } from './helpers.js';

test('sets imp.ext.bidder.inventoryCode from dsp.params', async () => {
  const ctx = makeCtx({ dsp: { params: { inventoryCode: 'my-slot' } } });
  const result = await handler(ctx);
  assert.equal(result, ctx);
  assert.equal(getPatch(ctx, 'imp.ext.bidder').inventoryCode, 'my-slot');
});

test('falls back to impression.inventoryCode', async () => {
  const ctx = makeCtx({ impression: { inventoryCode: 'tagid-slot' } });
  await handler(ctx);
  assert.equal(getPatch(ctx, 'imp.ext.bidder').inventoryCode, 'tagid-slot');
});

test('returns null if no inventoryCode', async () => {
  const ctx = makeCtx();
  const result = await handler(ctx);
  assert.equal(result, null);
});

test('sets imp.tagid', async () => {
  const ctx = makeCtx({ dsp: { params: { inventoryCode: 'slot-1' } } });
  await handler(ctx);
  assert.equal(getPatch(ctx, 'imp.tagid'), 'slot-1');
});

test('sets imp.secure = 1', async () => {
  const ctx = makeCtx({ dsp: { params: { inventoryCode: 'slot-1' } } });
  await handler(ctx);
  assert.equal(getPatch(ctx, 'imp.secure'), 1);
});

test('sets Accept header', async () => {
  const ctx = makeCtx({ dsp: { params: { inventoryCode: 'slot-1' } } });
  await handler(ctx);
  assert.equal(ctx._headers['Accept'], 'application/json');
});

test('includes floor in imp.ext.bidder when set', async () => {
  const ctx = makeCtx({ dsp: { params: { inventoryCode: 'slot-1' } }, impression: { floor: 0.5 } });
  await handler(ctx);
  assert.equal(getPatch(ctx, 'imp.ext.bidder').floor, 0.5);
});
