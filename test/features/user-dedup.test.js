import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRegistry } from '../../core/registry.js';
import userDedupHook, { _dedupWith } from '../../features/user-dedup/prebid-dsp.js';
import { matchesTarget } from '../../core/registry.js';
import { register } from '../../features/user-dedup/index.js';


function makeCtx({ ifa = 'abc-ifa', dspId = '323', dspBidder = 'triplelift', dspEp = null, sspBidder = null, sspEp = null } = {}) {
  return {
    dsp: { id: dspId, knownBidder: dspBidder, endpointId: dspEp },
    ssp: sspBidder || sspEp ? { id: '10', knownBidder: sspBidder, endpointId: sspEp } : null,
    device: { ifa },
    meta: { errors: [], warnings: [] },
  };
}

function mockRedis({ exists = false, throws = false } = {}) {
  const store = new Set();
  return {
    set: async (key, _val, opts) => {
      if (throws) throw new Error('redis down');
      if (opts?.NX && (exists || store.has(key))) return null;
      store.add(key);
      return 'OK';
    },
  };
}


// matchesTarget

test('empty target matches any ctx', () => {
  assert.ok(matchesTarget({}, makeCtx()));
});

test('{ dsp: { seatId } } matches correct seat', () => {
  assert.ok(matchesTarget({ dsp: { seatId: '333' } }, makeCtx({ dspId: '333' })));
  assert.ok(!matchesTarget({ dsp: { seatId: '333' } }, makeCtx({ dspId: '999' })));
});

test('{ dsp: { knownBidder } } matches correct bidder', () => {
  assert.ok(matchesTarget({ dsp: { knownBidder: 'triplelift' } }, makeCtx({ dspBidder: 'triplelift' })));
  assert.ok(!matchesTarget({ dsp: { knownBidder: 'triplelift' } }, makeCtx({ dspBidder: 'appnexus' })));
});

test('{ dsp: { endpointId } } matches correct endpoint', () => {
  assert.ok(matchesTarget({ dsp: { endpointId: 'ep-5' } }, makeCtx({ dspEp: 'ep-5' })));
  assert.ok(!matchesTarget({ dsp: { endpointId: 'ep-5' } }, makeCtx({ dspEp: 'ep-99' })));
});

test('{ ssp: { knownBidder } } matches SSP side', () => {
  assert.ok(matchesTarget({ ssp: { knownBidder: 'pubmatic' } }, makeCtx({ sspBidder: 'pubmatic' })));
  assert.ok(!matchesTarget({ ssp: { knownBidder: 'pubmatic' } }, makeCtx({ sspBidder: 'openx' })));
});

test('{ ssp: { knownBidder } } no match when ssp is null', () => {
  assert.ok(!matchesTarget({ ssp: { knownBidder: 'pubmatic' } }, makeCtx()));
});

test('{ ssp: { endpointId } } matches SSP endpoint', () => {
  assert.ok(matchesTarget({ ssp: { endpointId: '2788' } }, makeCtx({ sspEp: '2788' })));
  assert.ok(!matchesTarget({ ssp: { endpointId: '2788' } }, makeCtx({ sspEp: '9999' })));
});

test('{ dsp: { seatId }, ssp: { endpointId } } — intersection: both must match', () => {
  const target = { dsp: { seatId: '333' }, ssp: { endpointId: '2788' } };
  assert.ok(matchesTarget(target, makeCtx({ dspId: '333', sspEp: '2788' })));
  assert.ok(!matchesTarget(target, makeCtx({ dspId: '333', sspEp: '9999' })));
  assert.ok(!matchesTarget(target, makeCtx({ dspId: '999', sspEp: '2788' })));
  assert.ok(!matchesTarget(target, makeCtx({ dspId: '333' }))); // ssp null
});

test('{ dsp: { knownBidder }, ssp: { knownBidder } } — bidder intersection', () => {
  const target = { dsp: { knownBidder: 'triplelift' }, ssp: { knownBidder: 'pubmatic' } };
  assert.ok(matchesTarget(target, makeCtx({ dspBidder: 'triplelift', sspBidder: 'pubmatic' })));
  assert.ok(!matchesTarget(target, makeCtx({ dspBidder: 'triplelift', sspBidder: 'openx' })));
  assert.ok(!matchesTarget(target, makeCtx({ dspBidder: 'appnexus', sspBidder: 'pubmatic' })));
});

test('{ dsp: { seatId, knownBidder } } — all DSP criteria must match', () => {
  const target = { dsp: { seatId: '333', knownBidder: 'triplelift' } };
  assert.ok(matchesTarget(target, makeCtx({ dspId: '333', dspBidder: 'triplelift' })));
  assert.ok(!matchesTarget(target, makeCtx({ dspId: '333', dspBidder: 'appnexus' })));
  assert.ok(!matchesTarget(target, makeCtx({ dspId: '999', dspBidder: 'triplelift' })));
});

test('targets array: OR logic — any match enables dedup', () => {
  const targets = [
    { dsp: { seatId: '333' } },
    { ssp: { knownBidder: 'pubmatic' } },
  ];
  assert.ok(targets.some(t => matchesTarget(t, makeCtx({ dspId: '333' }))));
  assert.ok(targets.some(t => matchesTarget(t, makeCtx({ sspBidder: 'pubmatic' }))));
  assert.ok(!targets.some(t => matchesTarget(t, makeCtx({ dspId: '999' }))));
});


// Hook lifecycle

test('no IFA → hook skips', async () => {
  const ctx = makeCtx({ ifa: null });
  assert.strictEqual(await userDedupHook(ctx), ctx);
});

test('enabled: false (default) → hook skips', async () => {
  const ctx = makeCtx();
  assert.strictEqual(await userDedupHook(ctx), ctx);
});


// _dedupWith

test('first IFA → bid proceeds', async () => {
  const ctx = makeCtx({ ifa: 'device-111' });
  assert.strictEqual(await _dedupWith(ctx, mockRedis(), 60_000), ctx);
});

test('duplicate IFA → no-bid', async () => {
  const ctx = makeCtx({ ifa: 'device-222' });
  assert.strictEqual(await _dedupWith(ctx, mockRedis({ exists: true }), 60_000), null);
});

test('second call same IFA → no-bid', async () => {
  const redis = mockRedis();
  const ctx = makeCtx({ ifa: 'device-333' });
  assert.strictEqual(await _dedupWith(ctx, redis, 60_000), ctx);
  assert.strictEqual(await _dedupWith(ctx, redis, 60_000), null);
});

test('same IFA, different DSP → both pass', async () => {
  const redis = mockRedis();
  const ctx1 = makeCtx({ ifa: 'shared', dspId: '323' });
  const ctx2 = makeCtx({ ifa: 'shared', dspId: '999' });
  assert.strictEqual(await _dedupWith(ctx1, redis, 60_000), ctx1);
  assert.strictEqual(await _dedupWith(ctx2, redis, 60_000), ctx2);
});

test('_dedupWith: Redis error propagates (caught by hook wrapper)', async () => {
  const ctx = makeCtx();
  await assert.rejects(() => _dedupWith(ctx, mockRedis({ throws: true }), 60_000));
});


// register

test('register() uses null target (hook handles targeting internally)', () => {
  const registry = createRegistry();
  const info = register(registry);

  assert.equal(info.label, 'user-dedup/prebid-dsp');
  assert.equal(info.stage, 'prebid-dsp');

  // null target → matches any ctx
  const handlers = registry.resolve('prebid-dsp', makeCtx({ dspId: '999' }));
  assert.equal(handlers.length, 1);
});
