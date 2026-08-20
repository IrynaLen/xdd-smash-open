import { test } from 'node:test';
import assert from 'node:assert/strict';
import handler from '../../features/injector/dsp/criteo/prebid-dsp.js';
import { makeCtx, getPatch } from './helpers.js';

test('sets imp.ext.bidder.uid from zoneId', async () => {
  const ctx = makeCtx({ dsp: { params: { zoneId: 'zone-1' } } });
  await handler(ctx);
  assert.equal(getPatch(ctx, 'imp.ext.bidder').uid, 'zone-1');
});

test('falls back to impression.inventoryCode for zoneId', async () => {
  const ctx = makeCtx({ impression: { inventoryCode: 'tagid-zone' } });
  await handler(ctx);
  assert.equal(getPatch(ctx, 'imp.ext.bidder').uid, 'tagid-zone');
});

test('sets imp.ext.bidder.networkid from networkId', async () => {
  const ctx = makeCtx({ dsp: { params: { networkId: '123' } } });
  await handler(ctx);
  assert.equal(getPatch(ctx, 'imp.ext.bidder').networkid, 123);
});

test('sets publisher.id from pubId on site and app', async () => {
  const ctx = makeCtx({ dsp: { params: { pubId: 'pub-1' } } });
  await handler(ctx);
  assert.equal(getPatch(ctx, 'site.publisher.id'), 'pub-1');
  assert.equal(getPatch(ctx, 'app.publisher.id'), 'pub-1');
});

test('normalizes android OS casing', async () => {
  const ctx = makeCtx({ device: { os: 'android' } });
  await handler(ctx);
  assert.equal(getPatch(ctx, 'device.os'), 'Android');
});

test('normalizes ios OS casing', async () => {
  const ctx = makeCtx({ device: { os: 'ios' } });
  await handler(ctx);
  assert.equal(getPatch(ctx, 'device.os'), 'iOS');
});

test('sets video durations for video impression', async () => {
  const ctx = makeCtx({
    impression: { isVideo: true, videoMinduration: 5, videoMaxduration: 30 },
  });
  await handler(ctx);
  assert.equal(getPatch(ctx, 'imp.video.minduration'), 5);
  assert.equal(getPatch(ctx, 'imp.video.maxduration'), 30);
});

test('sets video rewarded ext for rewarded video', async () => {
  const ctx = makeCtx({
    impression: { isVideo: true, isRewarded: true },
  });
  await handler(ctx);
  assert.deepEqual(getPatch(ctx, 'imp.video.ext'), { rewarded: 1 });
});

test('returns ctx', async () => {
  const ctx = makeCtx();
  const result = await handler(ctx);
  assert.equal(result, ctx);
});
