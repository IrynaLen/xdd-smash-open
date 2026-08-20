// Feature tests for the geoedge tool.
//
// These tests cover the complete flow: hook fires → creative injected → adm replaced in response.
// For unit-level tests (wrapAdm, createGeoedgeHook internals) see test/adapters/geoedge.test.js.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pipeline } from '../../core/pipeline.js';
import { createRegistry } from '../../core/registry.js';
import { createGeoedgeHook } from '../../features/geoedge-postbid/core.js';
import { wrapToolHandler } from '../../features/geoedge-postbid/index.js';


function makeReq() {
  return { headers: { 'x-smash-protocol': 'openrtb/2.5' } };
}

function makeBidRequest({ sspBidder = null } = {}) {
  return {
    id: 'r1',
    imp: [{
      id: 'i1',
      banner: { w: 300, h: 250 },
      ext: { smash: {
        dsp: { id: 333, knownBidder: null, params: {}, destination: { url: 'https://dsp.example.com' } },
        ssp: sspBidder ? { id: 100, knownBidder: sspBidder } : null,
      }},
    }],
    site: { page: 'https://example.com' },
    tmax: 500,
  };
}

function makeClient(adm = '<div>ad</div>', mtype = 1) {
  return {
    request: async () => ({
      status: 'ok',
      body: {
        id: 'r1',
        seatbid: [{
          seat: 's1',
          bid: [{ id: 'b1', impid: 'i1', price: 1.5, adm, mtype, crid: 'crid-1', w: 300, h: 250 }],
        }],
        cur: 'USD',
      },
    }),
  };
}

function getAdm(result) {
  return result?.seatbid?.[0]?.bid?.[0]?.adm;
}


test('banner adm is wrapped in the final pipeline output', async () => {
  const registry = createRegistry();
  registry.register('postbid-ssp', null, createGeoedgeHook('site-key'), 'geoedge');

  const result = await pipeline(makeReq(), makeBidRequest(), registry, makeClient('<div>original</div>'));

  assert.ok(getAdm(result).includes('site-key'));
  assert.ok(getAdm(result).includes('<div>original</div>'));
});

test('wrapped adm includes the geoedge footer script', async () => {
  const registry = createRegistry();
  registry.register('postbid-ssp', null, createGeoedgeHook('k'), 'geoedge');

  const result = await pipeline(makeReq(), makeBidRequest(), registry, makeClient());

  assert.ok(getAdm(result).includes('rumcdn.geoedge.be'));
});

test('wrapped adm includes dsp id and crid in meta', async () => {
  const registry = createRegistry();
  registry.register('postbid-ssp', null, createGeoedgeHook('k'), 'geoedge');

  const result = await pipeline(makeReq(), makeBidRequest(), registry, makeClient());

  // dspId=333, crid=crid-1 from makeClient
  assert.ok(getAdm(result).includes('"333"'));
  assert.ok(getAdm(result).includes('crid-1'));
});


test('video adm is not wrapped by geoedge', async () => {
  const registry = createRegistry();
  registry.register('postbid-ssp', null, createGeoedgeHook('k'), 'geoedge');

  const vastAdm = '<VAST version="4.0"><Ad/></VAST>';
  const result = await pipeline(makeReq(), makeBidRequest(), registry, makeClient(vastAdm, 2));

  assert.equal(getAdm(result), vastAdm);
});

// features/tools/geoedge/config.json ships with { "enabled": false, "key": "" }
// The tool must be a no-op unless a deployment config.json overrides it.

test('global geoedge tool is a no-op when built-in config has enabled: false', async () => {
  const { default: globalHook } = await import('../../features/geoedge-postbid/postbid-ssp.js');

  const registry = createRegistry();
  registry.register('postbid-ssp', null, globalHook, 'geoedge-global');

  const result = await pipeline(makeReq(), makeBidRequest(), registry, makeClient('<div>ad</div>'));

  assert.equal(getAdm(result), '<div>ad</div>');
});

// Demonstrates the ssp/pubmatic/postbid-ssp.js pattern:
//   export default createGeoedgeHook('pubmatic-key')
// The hook is registered with target = { _side: 'ssp', knownBidder: 'pubmatic' }
// and fires ONLY when ctx.ssp.knownBidder === 'pubmatic'.

test('per-SSP hook wraps adm when SSP matches', async () => {
  const registry = createRegistry();
  registry.register(
    'postbid-ssp',
    { _side: 'ssp', knownBidder: 'pubmatic' },
    createGeoedgeHook('pubmatic-key'),
    'geoedge-pubmatic',
  );

  const result = await pipeline(makeReq(), makeBidRequest({ sspBidder: 'pubmatic' }), registry, makeClient());

  assert.ok(getAdm(result).includes('pubmatic-key'));
});

test('per-SSP hook does not fire for a different SSP', async () => {
  const registry = createRegistry();
  registry.register(
    'postbid-ssp',
    { _side: 'ssp', knownBidder: 'pubmatic' },
    createGeoedgeHook('pubmatic-key'),
    'geoedge-pubmatic',
  );

  const result = await pipeline(makeReq(), makeBidRequest({ sspBidder: 'appnexus' }), registry, makeClient('<div>ad</div>'));

  assert.equal(getAdm(result), '<div>ad</div>');
});

test('per-SSP hook does not fire when SSP is absent', async () => {
  const registry = createRegistry();
  registry.register(
    'postbid-ssp',
    { _side: 'ssp', knownBidder: 'pubmatic' },
    createGeoedgeHook('pubmatic-key'),
    'geoedge-pubmatic',
  );

  const result = await pipeline(makeReq(), makeBidRequest({ sspBidder: null }), registry, makeClient('<div>ad</div>'));

  assert.equal(getAdm(result), '<div>ad</div>');
});

// Tools are wrapped with wrapToolHandler by the loader.
// A throwing tool must: log the error to ctx.meta.errors AND let the pipeline continue.
// Contrast with adapter hooks: an adapter throw kills the pipeline (returns null).

test('tool error is logged to ext.smash.errors but pipeline still returns a bid', async () => {
  const brokenTool = () => { throw new Error('geoedge exploded'); };
  const registry = createRegistry();
  registry.register('postbid-ssp', null, wrapToolHandler(brokenTool, 'geoedge'), 'geoedge');

  const result = await pipeline(makeReq(), makeBidRequest(), registry, makeClient('<div>ad</div>'));

  // Bid still returned — tool did not kill pipeline
  assert.ok(result);
  assert.equal(getAdm(result), '<div>ad</div>');

  // Error was captured and forwarded to XE via ext.smash
  assert.equal(result.ext.smash.errors[0].handler, 'geoedge');
  assert.ok(result.ext.smash.errors[0].error.includes('exploded'));
});

test('adapter error kills pipeline but tool error does not', async () => {
  const registryWithAdapter = createRegistry();
  registryWithAdapter.register('postbid-ssp', null, () => { throw new Error('adapter boom'); }, 'bad-adapter');
  const r1 = await pipeline(makeReq(), makeBidRequest(), registryWithAdapter, makeClient());
  assert.ok(Array.isArray(r1?.seatbid) && r1.seatbid.length === 0); // adapter throws → no-bid

  const registryWithTool = createRegistry();
  registryWithTool.register('postbid-ssp', null, wrapToolHandler(() => { throw new Error('tool boom'); }, 'bad-tool'), 'bad-tool');
  const r2 = await pipeline(makeReq(), makeBidRequest(), registryWithTool, makeClient('<div>ad</div>'));
  assert.ok(r2); // tool throws → pipeline continues
  assert.equal(getAdm(r2), '<div>ad</div>');
});
