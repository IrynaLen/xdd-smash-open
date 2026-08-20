import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSelectorHook, register, buildStageRecorder } from '../../features/ab-testing/index.js';
import { createRegistry } from '../../core/registry.js';
import { resolveConfig, variantFor } from '../../core/config.js';
import { registry as metricsRegistry } from '../../core/metrics.js';

function makeCtx({ requestId = 'req-1', ifa = 'ifa-1', ua = 'ua-1', dspId = '317', sspId = '3131' } = {}) {
  return {
    dsp: { id: dspId, knownBidder: null, endpointId: null },
    ssp: { id: sspId, knownBidder: null, endpointId: null },
    device: { ifa, ua },
    meta: { requestId, errors: [], pipeline: [] },
    experiment: {},
    configOverrides: {},
    experimentByNs: {},
  };
}

const EXP = {
  id: 'dedup-ttl',
  salt: 's1',
  variants: [
    { name: 'control', weight: 50, config: { userDedup: { ttlMs: 60000 } } },
    { name: 'treatment', weight: 50, config: { userDedup: { ttlMs: 10000 } } },
  ],
};

test('assigns a variant and merges its config override', () => {
  const ctx = makeCtx();
  createSelectorHook([EXP])(ctx);
  const v = ctx.experiment['dedup-ttl'];
  assert.ok(v === 'control' || v === 'treatment');
  assert.equal(ctx.configOverrides.userDedup.ttlMs, v === 'treatment' ? 10000 : 60000);
  assert.equal(ctx.experimentByNs.userDedup, v);
  assert.equal(variantFor(ctx, 'userDedup'), v);
});

test('deterministic: same requestId + salt → same variant', () => {
  const hook = createSelectorHook([EXP]);
  const a = makeCtx({ requestId: 'same' }); hook(a);
  const b = makeCtx({ requestId: 'same' }); hook(b);
  assert.equal(a.experiment['dedup-ttl'], b.experiment['dedup-ttl']);
});

test('distribution ~ weights over many requests', () => {
  const hook = createSelectorHook([EXP]);
  const n = 10000;
  let treatment = 0;
  for (let i = 0; i < n; i++) {
    const ctx = makeCtx({ requestId: `r-${i}` }); hook(ctx);
    if (ctx.experiment['dedup-ttl'] === 'treatment') treatment++;
  }
  const share = treatment / n;
  assert.ok(share > 0.45 && share < 0.55, `treatment share ${share}`);
});

test('changing the salt reshuffles assignments', () => {
  const h1 = createSelectorHook([{ ...EXP, salt: 'A' }]);
  const h2 = createSelectorHook([{ ...EXP, salt: 'B' }]);
  const n = 300;
  let diff = 0;
  for (let i = 0; i < n; i++) {
    const c1 = makeCtx({ requestId: `r-${i}` }); h1(c1);
    const c2 = makeCtx({ requestId: `r-${i}` }); h2(c2);
    if (c1.experiment['dedup-ttl'] !== c2.experiment['dedup-ttl']) diff++;
  }
  assert.ok(diff > n * 0.3, `expected many reshuffled, got ${diff}`);
});

test('bucketBy device.ifa is sticky per user across requests', () => {
  const hook = createSelectorHook([{ ...EXP, bucketBy: 'device.ifa' }]);
  const a = makeCtx({ requestId: 'r1', ifa: 'user-X' }); hook(a);
  const b = makeCtx({ requestId: 'r2', ifa: 'user-X' }); hook(b);
  assert.equal(a.experiment['dedup-ttl'], b.experiment['dedup-ttl']);
});

const V = ctx => ctx.experiment['dedup-ttl'];

test('bucketBy as an array is sticky per the combination of values', () => {
  const hook = createSelectorHook([{ ...EXP, bucketBy: ['device.ifa', 'device.ua'] }]);
  const a = makeCtx({ requestId: 'r1', ifa: 'user-X', ua: 'Chrome/1' }); hook(a);
  const b = makeCtx({ requestId: 'r2', ifa: 'user-X', ua: 'Chrome/1' }); hook(b);
  assert.equal(V(a), V(b), 'same ifa+ua → same variant regardless of requestId');
});

test('bucketBy array: every component actually contributes to the seed', () => {
  const hook = createSelectorHook([{ ...EXP, bucketBy: ['device.ifa', 'device.ua'] }]);
  // Hold one component fixed, vary the other; over many users the assignment
  // must reshuffle, otherwise that component is being ignored.
  const varyUa = new Set(), varyIfa = new Set();
  for (let i = 0; i < 200; i++) {
    const c1 = makeCtx({ ifa: 'fixed', ua: `ua-${i}` }); hook(c1); varyUa.add(V(c1));
    const c2 = makeCtx({ ifa: `ifa-${i}`, ua: 'fixed' }); hook(c2); varyIfa.add(V(c2));
  }
  assert.equal(varyUa.size, 2, 'varying ua alone must reshuffle');
  assert.equal(varyIfa.size, 2, 'varying ifa alone must reshuffle');
});

test('bucketBy array: the separator prevents ambiguous concatenations', () => {
  const hook = createSelectorHook([{ ...EXP, bucketBy: ['device.ifa', 'device.ua'] }]);
  // ('ab','c') and ('a','bc') both concatenate to "abc" without a separator.
  // They are different devices and must be free to land in different buckets.
  const seeds = new Set();
  for (const [ifa, ua] of [['ab', 'c'], ['a', 'bc']]) {
    const c = makeCtx({ ifa, ua }); hook(c);
    seeds.add(`${ifa}|${ua}|${V(c)}`);
  }
  assert.equal(seeds.size, 2);
  // Exhaustive check that no split of a shared string collides.
  const hook2 = createSelectorHook([{ ...EXP, bucketBy: ['device.ifa', 'device.ua'], salt: 'sep' }]);
  const s = 'abcdefgh';
  const variants = [];
  for (let i = 1; i < s.length; i++) {
    const c = makeCtx({ ifa: s.slice(0, i), ua: s.slice(i) }); hook2(c);
    variants.push(V(c));
  }
  assert.ok(new Set(variants).size > 1, 'splits of one string must not all share a bucket');
});

test('bucketBy array: a missing component contributes empty, the rest still decide', () => {
  const hook = createSelectorHook([{ ...EXP, bucketBy: ['device.ifa', 'device.ua'] }]);

  // No ifa: bucketing must still spread by ua, and stay sticky per ua.
  const seen = new Set();
  for (let i = 0; i < 200; i++) {
    const c = makeCtx({ requestId: `r-${i}`, ifa: null, ua: `ua-${i}` }); hook(c);
    seen.add(V(c));
  }
  assert.equal(seen.size, 2, 'ifa-less traffic spreads across variants by ua');

  const a = makeCtx({ requestId: 'r1', ifa: null, ua: 'Chrome/1' }); hook(a);
  const b = makeCtx({ requestId: 'r2', ifa: null, ua: 'Chrome/1' }); hook(b);
  assert.equal(V(a), V(b), 'still sticky on the part that did resolve');
});

test('bucketBy array: null and empty string are the same missing part', () => {
  const hook = createSelectorHook([{ ...EXP, bucketBy: ['device.ifa', 'device.ua'] }]);
  const withNull = makeCtx({ requestId: 'r1', ifa: null, ua: 'Chrome/1' }); hook(withNull);
  const withEmpty = makeCtx({ requestId: 'r2', ifa: '', ua: 'Chrome/1' }); hook(withEmpty);
  assert.equal(V(withNull), V(withEmpty));
});

test('bucketBy array: when NO part resolves every request shares one bucket', () => {
  // Documented consequence of contributing empty strings rather than falling
  // back to the request id. Pick at least one near-universal path.
  const hook = createSelectorHook([{ ...EXP, bucketBy: ['device.ifa', 'device.ua'] }]);
  const seen = new Set();
  for (let i = 0; i < 200; i++) {
    const c = makeCtx({ requestId: `r-${i}`, ifa: null, ua: null }); hook(c);
    seen.add(V(c));
  }
  assert.equal(seen.size, 1, 'all identity-less traffic lands in a single variant');
});

test('bucketBy array: weights are still respected', () => {
  const exp = { ...EXP, bucketBy: ['device.ifa', 'device.ua'],
    variants: [{ ...EXP.variants[0], weight: 90 }, { ...EXP.variants[1], weight: 10 }] };
  const hook = createSelectorHook([exp]);
  let treatment = 0;
  const n = 4000;
  for (let i = 0; i < n; i++) {
    const c = makeCtx({ ifa: `ifa-${i}`, ua: `ua-${i}` }); hook(c);
    if (V(c) === 'treatment') treatment++;
  }
  const share = treatment / n;
  assert.ok(share > 0.07 && share < 0.13, `expected ~10% treatment, got ${(share * 100).toFixed(1)}%`);
});

test('bucketBy: an empty array falls back to per-request bucketing', () => {
  const hook = createSelectorHook([{ ...EXP, bucketBy: [] }]);
  const seen = new Set();
  for (let i = 0; i < 200; i++) {
    const c = makeCtx({ requestId: `r-${i}` }); hook(c);
    seen.add(V(c));
  }
  assert.equal(seen.size, 2);
});

test('bucketBy: a single-element array matches the plain string form', () => {
  const asString = createSelectorHook([{ ...EXP, bucketBy: 'device.ifa' }]);
  const asArray = createSelectorHook([{ ...EXP, bucketBy: ['device.ifa'] }]);
  for (let i = 0; i < 50; i++) {
    const a = makeCtx({ ifa: `u-${i}` }); asString(a);
    const b = makeCtx({ ifa: `u-${i}` }); asArray(b);
    assert.equal(V(a), V(b));
  }
});

test('experiment target scopes eligibility', () => {
  const hook = createSelectorHook([{ ...EXP, target: { ssp: { seatId: '3131' } } }]);
  const match = makeCtx({ sspId: '3131' }); hook(match);
  assert.ok(match.experiment['dedup-ttl']);
  const miss = makeCtx({ sspId: '9999' }); hook(miss);
  assert.equal(miss.experiment['dedup-ttl'], undefined);
  assert.deepEqual(miss.configOverrides, {});
});

test('integration: resolveConfig reads the assigned variant override', () => {
  const ctx = makeCtx();
  createSelectorHook([EXP])(ctx);
  const eff = resolveConfig(ctx, { enabled: true, ttlMs: 60000 }, 'userDedup');
  assert.equal(eff.ttlMs, ctx.experiment['dedup-ttl'] === 'treatment' ? 10000 : 60000);
});

test('a broken experiment does not throw the hook', () => {
  const ctx = makeCtx();
  assert.equal(createSelectorHook([{ id: 'bad', variants: null }])(ctx), ctx);
  assert.deepEqual(ctx.experiment, {});
});

test('register wires the selector only when enabled with experiments', () => {
  const off = createRegistry();
  register(off, {}, { abTesting: { enabled: false, experiments: [EXP] } });
  assert.equal(off.resolve('prebid-ssp', makeCtx()).length, 0);

  const on = createRegistry();
  register(on, {}, { abTesting: { enabled: true, experiments: [EXP] } });
  assert.equal(on.resolve('prebid-ssp', makeCtx()).length, 1);
});

test('stage recorder counts records and sums observed fields (postbid-dsp)', async () => {
  const rec = buildStageRecorder('postbid-dsp', [
    { expId: 'bid-e', labels: ['experiment', 'variant', 'dsp'], observe: [{ field: 'price', as: 'sum' }] },
  ]);
  rec({ experiment: { 'bid-e': 'v' }, dsp: 'd1', price: 2 });
  rec({ experiment: { 'bid-e': 'v' }, dsp: 'd1', price: 3 });
  const json = await metricsRegistry.getMetricsAsJSON();
  const cnt = json.find(x => x.name === 'smash_ab_postbid_dsp_total');
  assert.equal(cnt.values.find(v => v.labels.experiment === 'bid-e' && v.labels.dsp === 'd1').value, 2);
  const sum = json.find(x => x.name === 'smash_ab_postbid_dsp_price_total');
  assert.equal(sum.values.find(v => v.labels.experiment === 'bid-e').value, 5);
});

test('stage recorder tracks only experiments in its spec (impression)', async () => {
  const rec = buildStageRecorder('impression', [{ expId: 'tracked' }]);
  rec({ experiment: { tracked: 'a', untracked: 'b' } });
  const m = (await metricsRegistry.getMetricsAsJSON()).find(x => x.name === 'smash_ab_impression_total');
  assert.ok(m.values.find(v => v.labels.experiment === 'tracked' && v.labels.variant === 'a'));
  assert.equal(m.values.find(v => v.labels.experiment === 'untracked'), undefined);
});

test('stage recorder records histograms (postbid-ssp)', async () => {
  const rec = buildStageRecorder('postbid-ssp', [{ expId: 'h-e', observe: [{ field: 'lat', as: 'histogram', buckets: [1, 5] }] }]);
  rec({ experiment: { 'h-e': 'v' }, lat: 3 });
  const h = (await metricsRegistry.getMetricsAsJSON()).find(x => x.name === 'smash_ab_postbid_ssp_lat');
  assert.ok(h && h.type === 'histogram');
  assert.equal(h.values.find(v => v.metricName === 'smash_ab_postbid_ssp_lat_count' && v.labels.experiment === 'h-e')?.value, 1);
});

test('buildStageRecorder rejects an unknown measurement point', () => {
  assert.throws(() => buildStageRecorder('nope', []), /Unknown A\/B metric stage/);
});

test('register wires a stage hook and/or a tracking consumer from metrics config', () => {
  // No metrics → no consumer, no stage hooks.
  let bare = null;
  const off = createRegistry();
  register(off, { get: () => ({ addConsumer: fn => { bare = fn; } }) }, { abTesting: { enabled: true, experiments: [EXP] } });
  assert.equal(bare, null);
  assert.equal(off.resolve('postbid-dsp', makeCtx()).length, 0);

  // impression → consumer; postbid-dsp → a registered hook.
  let consumer = null;
  const on = createRegistry();
  register(on, { get: () => ({ addConsumer: fn => { consumer = fn; } }) }, {
    abTesting: { enabled: true, experiments: [{
      ...EXP,
      metrics: [
        { on: 'postbid-dsp', labels: ['experiment', 'variant', 'dsp'], observe: [{ field: 'price', as: 'sum' }] },
        { on: 'impression' },
      ],
    }] },
  });
  assert.equal(typeof consumer, 'function');
  assert.equal(on.resolve('postbid-dsp', makeCtx()).length, 1);
});

test('the postbid-dsp hook serializes each bid and records it', async () => {
  const on = createRegistry();
  register(on, { get: () => null }, {
    abTesting: { enabled: true, experiments: [{
      ...EXP, id: 'exec-e',
      metrics: [{ on: 'postbid-dsp', labels: ['experiment', 'variant', 'dsp'], observe: [{ field: 'price', as: 'sum' }] }],
    }] },
  });
  const [hook] = on.resolve('postbid-dsp', makeCtx());
  const ctx = {
    experiment: { 'exec-e': 'v' },
    responses: [{ price: 4 }, { price: 6 }],
    serialize(res) { return { experiment: this.experiment, dsp: 'd1', price: res.price }; },
  };
  hook(ctx);
  const sum = (await metricsRegistry.getMetricsAsJSON()).find(x => x.name === 'smash_ab_postbid_dsp_price_total');
  assert.equal(sum.values.find(v => v.labels.experiment === 'exec-e').value, 10);
});
