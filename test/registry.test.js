import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRegistry } from '../core/registry.js';

test('throws on unknown stage', () => {
  const reg = createRegistry();
  assert.throws(() => reg.register('invalid', null, () => {}, 'x'), /Unknown stage/);
});

test('global null target matches any ctx', () => {
  const reg = createRegistry();
  const hook = ctx => ctx;
  reg.register('prebid-dsp', null, hook, 'global');
  assert.deepEqual(reg.resolve('prebid-dsp', { dsp: null, ssp: null }), [hook]);
});

test('knownBidder filter matches only correct bidder', () => {
  const reg = createRegistry();
  const hook = ctx => ctx;
  reg.register('prebid-dsp', { knownBidder: 'triplelift', _side: 'dsp' }, hook, 'tl');

  const match = { dsp: { knownBidder: 'triplelift', id: '1', endpointId: null }, ssp: null };
  const noMatch = { dsp: { knownBidder: 'appnexus', id: '2', endpointId: null }, ssp: null };

  assert.equal(reg.resolve('prebid-dsp', match).length, 1);
  assert.equal(reg.resolve('prebid-dsp', noMatch).length, 0);
});

test('ordering: global hook before specific hook', () => {
  const reg = createRegistry();
  const globalHook = ctx => ctx;
  const specificHook = ctx => ctx;

  reg.register('prebid-dsp', { knownBidder: 'triplelift', _side: 'dsp' }, specificHook, 'specific');
  reg.register('prebid-dsp', null, globalHook, 'global');

  const ctx = { dsp: { knownBidder: 'triplelift', id: '1', endpointId: null }, ssp: null };
  const resolved = reg.resolve('prebid-dsp', ctx);

  assert.equal(resolved[0], globalHook);
  assert.equal(resolved[1], specificHook);
});

test('seatId filter (legacy format)', () => {
  const reg = createRegistry();
  const hook = ctx => ctx;
  reg.register('prebid-dsp', { knownBidder: 'triplelift', seatId: '333', _side: 'dsp' }, hook, 'x');

  const match = { dsp: { knownBidder: 'triplelift', id: '333', endpointId: null }, ssp: null };
  const noMatch = { dsp: { knownBidder: 'triplelift', id: '999', endpointId: null }, ssp: null };

  assert.equal(reg.resolve('prebid-dsp', match).length, 1);
  assert.equal(reg.resolve('prebid-dsp', noMatch).length, 0);
});

test('ssp side resolves against ctx.ssp (legacy)', () => {
  const reg = createRegistry();
  const hook = ctx => ctx;
  reg.register('prebid-ssp', { knownBidder: 'pubmatic', _side: 'ssp' }, hook, 'x');

  const match = { ssp: { knownBidder: 'pubmatic', id: '1' }, dsp: null };
  const noMatch = { ssp: { knownBidder: 'openx', id: '1' }, dsp: null };

  assert.equal(reg.resolve('prebid-ssp', match).length, 1);
  assert.equal(reg.resolve('prebid-ssp', noMatch).length, 0);
});

test('seat-only target (no knownBidder) matches any DSP with that seat', () => {
  const reg = createRegistry();
  const hook = ctx => ctx;
  reg.register('prebid-dsp', { seatId: '123', _side: 'dsp' }, hook, 'seat-only');

  const appnexus = { dsp: { knownBidder: 'appnexus', id: '123', endpointId: null }, ssp: null };
  const sovrn = { dsp: { knownBidder: 'sovrn', id: '123', endpointId: null }, ssp: null };
  const wrongSeat = { dsp: { knownBidder: 'appnexus', id: '999', endpointId: null }, ssp: null };

  assert.equal(reg.resolve('prebid-dsp', appnexus).length, 1);
  assert.equal(reg.resolve('prebid-dsp', sovrn).length, 1);
  assert.equal(reg.resolve('prebid-dsp', wrongSeat).length, 0);
});

test('ep-only target matches any SSP with that endpoint (legacy)', () => {
  const reg = createRegistry();
  const hook = ctx => ctx;
  reg.register('postbid-ssp', { endpointId: '2788', _side: 'ssp' }, hook, 'ep-only');

  const pubmatic = { ssp: { knownBidder: 'pubmatic', id: '1', endpointId: '2788' }, dsp: null };
  const openx = { ssp: { knownBidder: 'openx', id: '2', endpointId: '2788' }, dsp: null };
  const wrongEp = { ssp: { knownBidder: 'pubmatic', id: '1', endpointId: '9999' }, dsp: null };

  assert.equal(reg.resolve('postbid-ssp', pubmatic).length, 1);
  assert.equal(reg.resolve('postbid-ssp', openx).length, 1);
  assert.equal(reg.resolve('postbid-ssp', wrongEp).length, 0);
});

test('seat-only runs before seat+bidder (lower specificity first)', () => {
  const reg = createRegistry();
  const seatOnly = ctx => ctx;
  const seatAndBidder = ctx => ctx;

  reg.register('prebid-dsp', { seatId: '123', _side: 'dsp' }, seatOnly, 'seat-only');
  reg.register('prebid-dsp', { knownBidder: 'appnexus', seatId: '123', _side: 'dsp' }, seatAndBidder, 'specific');

  const ctx = { dsp: { knownBidder: 'appnexus', id: '123', endpointId: null }, ssp: null };
  const resolved = reg.resolve('prebid-dsp', ctx);

  assert.equal(resolved[0], seatOnly);
  assert.equal(resolved[1], seatAndBidder);
});

test('empty stage returns []', () => {
  const reg = createRegistry();
  assert.deepEqual(reg.resolve('prebid-dsp', {}), []);
});

// Two-sided format: { dsp: {...}, ssp: {...} }

test('two-sided: { dsp: { seatId } } matches DSP seat', () => {
  const reg = createRegistry();
  const hook = ctx => ctx;
  reg.register('prebid-dsp', { dsp: { seatId: '333' } }, hook, 'dsp-seat');

  const match = { dsp: { id: '333', knownBidder: 'triplelift', endpointId: null }, ssp: null };
  const noMatch = { dsp: { id: '999', knownBidder: 'triplelift', endpointId: null }, ssp: null };

  assert.equal(reg.resolve('prebid-dsp', match).length, 1);
  assert.equal(reg.resolve('prebid-dsp', noMatch).length, 0);
});

test('two-sided: { ssp: { knownBidder } } matches SSP side only', () => {
  const reg = createRegistry();
  const hook = ctx => ctx;
  reg.register('prebid-dsp', { ssp: { knownBidder: 'pubmatic' } }, hook, 'ssp-bidder');

  const match = { dsp: { id: '1', knownBidder: 'triplelift', endpointId: null }, ssp: { id: '10', knownBidder: 'pubmatic', endpointId: null } };
  const noMatch = { dsp: { id: '1', knownBidder: 'triplelift', endpointId: null }, ssp: { id: '10', knownBidder: 'openx', endpointId: null } };
  const noSsp = { dsp: { id: '1', knownBidder: 'triplelift', endpointId: null }, ssp: null };

  assert.equal(reg.resolve('prebid-dsp', match).length, 1);
  assert.equal(reg.resolve('prebid-dsp', noMatch).length, 0);
  assert.equal(reg.resolve('prebid-dsp', noSsp).length, 0);
});

test('two-sided: { dsp: { seatId }, ssp: { endpointId } } — both must match (intersection)', () => {
  const reg = createRegistry();
  const hook = ctx => ctx;
  reg.register('prebid-dsp', { dsp: { seatId: '333' }, ssp: { endpointId: '2788' } }, hook, 'intersection');

  const dsp = { id: '333', knownBidder: 'triplelift', endpointId: null };
  const sspY = { id: '10', knownBidder: 'pubmatic', endpointId: '2788' };
  const sspN = { id: '10', knownBidder: 'pubmatic', endpointId: '9999' };

  assert.equal(reg.resolve('prebid-dsp', { dsp, ssp: sspY }).length, 1);
  assert.equal(reg.resolve('prebid-dsp', { dsp, ssp: sspN }).length, 0);
  assert.equal(reg.resolve('prebid-dsp', { dsp, ssp: null }).length, 0);
});

test('two-sided: { dsp: { knownBidder }, ssp: { knownBidder } } — bidder intersection', () => {
  const reg = createRegistry();
  const hook = ctx => ctx;
  reg.register('prebid-dsp', { dsp: { knownBidder: 'triplelift' }, ssp: { knownBidder: 'pubmatic' } }, hook, 'bidder-x');

  const tlPub = { dsp: { id: '1', knownBidder: 'triplelift', endpointId: null }, ssp: { id: '2', knownBidder: 'pubmatic', endpointId: null } };
  const tlOx = { dsp: { id: '1', knownBidder: 'triplelift', endpointId: null }, ssp: { id: '2', knownBidder: 'openx', endpointId: null } };
  const anPub = { dsp: { id: '1', knownBidder: 'appnexus', endpointId: null }, ssp: { id: '2', knownBidder: 'pubmatic', endpointId: null } };

  assert.equal(reg.resolve('prebid-dsp', tlPub).length, 1);
  assert.equal(reg.resolve('prebid-dsp', tlOx).length, 0);
  assert.equal(reg.resolve('prebid-dsp', anPub).length, 0);
});

test('two-sided: { dsp: { knownBidder, endpointId } } — DSP bidder + endpoint', () => {
  const reg = createRegistry();
  const hook = ctx => ctx;
  reg.register('prebid-dsp', { dsp: { knownBidder: 'triplelift', endpointId: 'ep-5' } }, hook, 'dsp-ep');

  const match = { dsp: { id: '1', knownBidder: 'triplelift', endpointId: 'ep-5' }, ssp: null };
  const wrongEp = { dsp: { id: '1', knownBidder: 'triplelift', endpointId: 'ep-99' }, ssp: null };
  const wrongBid = { dsp: { id: '1', knownBidder: 'appnexus', endpointId: 'ep-5' }, ssp: null };

  assert.equal(reg.resolve('prebid-dsp', match).length, 1);
  assert.equal(reg.resolve('prebid-dsp', wrongEp).length, 0);
  assert.equal(reg.resolve('prebid-dsp', wrongBid).length, 0);
});

test('two-sided: { dsp: {} } empty criteria matches any DSP', () => {
  const reg = createRegistry();
  const hook = ctx => ctx;
  reg.register('prebid-dsp', { dsp: {} }, hook, 'any-dsp');

  const withDsp = { dsp: { id: '1', knownBidder: 'triplelift', endpointId: null }, ssp: null };
  assert.equal(reg.resolve('prebid-dsp', withDsp).length, 1);
});

test('two-sided specificity: { dsp: { seatId } } scores 1, { dsp: { seatId, knownBidder } } scores 2', () => {
  const reg = createRegistry();
  const low = ctx => ctx;
  const high = ctx => ctx;

  reg.register('prebid-dsp', { dsp: { knownBidder: 'triplelift', seatId: '333' } }, high, 'high');
  reg.register('prebid-dsp', { dsp: { seatId: '333' } }, low, 'low');

  const ctx = { dsp: { id: '333', knownBidder: 'triplelift', endpointId: null }, ssp: null };
  const resolved = reg.resolve('prebid-dsp', ctx);

  assert.equal(resolved[0], low);
  assert.equal(resolved[1], high);
});

test('two-sided: SSP+DSP intersection scores higher than DSP-only', () => {
  const reg = createRegistry();
  const dspOnly = ctx => ctx;
  const dspAndSsp = ctx => ctx;

  reg.register('prebid-dsp', { dsp: { seatId: '333' }, ssp: { endpointId: '2788' } }, dspAndSsp, 'both');
  reg.register('prebid-dsp', { dsp: { seatId: '333' } }, dspOnly, 'dsp-only');

  const ctx = {
    dsp: { id: '333', knownBidder: 'triplelift', endpointId: null },
    ssp: { id: '10', knownBidder: 'pubmatic', endpointId: '2788' },
  };
  const resolved = reg.resolve('prebid-dsp', ctx);

  assert.equal(resolved[0], dspOnly);
  assert.equal(resolved[1], dspAndSsp);
});
