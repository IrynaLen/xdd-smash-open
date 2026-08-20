import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pipeline } from '../../core/pipeline.js';
import { createRegistry } from '../../core/registry.js';
import { createServices } from '../../core/services.js';
import { createTrackingService } from '../../services/tracking/index.js';
import { createImpFeedbackHook, register } from '../../features/impression-feedback/index.js';

const KEY = Buffer.alloc(32, 7).toString('base64');

function tracking() {
  return createTrackingService({
    enabled: true,
    endpointUrl: 'https://smash.example/t',
    cdnScriptUrl: 'https://cdn.example/track.js',
    activeKeyid: 1,
    keyring: { 1: KEY },
  });
}

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

const getAdm = result => result?.seatbid?.[0]?.bid?.[0]?.adm;

function withHook(cfg, trk = tracking()) {
  const registry = createRegistry();
  registry.register('postbid-ssp', null, createImpFeedbackHook(cfg, trk), 'impfb');
  return registry;
}

test('banner adm gets a tracker <script> with an opaque context token', async () => {
  const trk = tracking();
  const registry = withHook({ creativeTypes: { display: true }, targets: [{}] }, trk);

  const result = await pipeline(makeReq(), makeBidRequest(), registry, makeClient('<div>original</div>'));
  const adm = getAdm(result);

  assert.ok(adm.includes('<div>original</div>'));
  assert.ok(adm.includes('src="https://cdn.example/track.js"'));

  const token = adm.match(/data-smash-ctx="([^"]+)"/)?.[1];
  assert.ok(token, 'token present');
  const ctx = trk.unpack(token);
  assert.equal(ctx.crid, 'crid-1');
  assert.equal(ctx.dsp, '333');
  assert.ok(Array.isArray(ctx.pipeline) && ctx.pipeline.length, 'pipeline trace present');
  assert.deepEqual(ctx.experiment, {}, 'experiment present (empty without A/B)');
});

test('video adm gets an <Impression> tracker when video is enabled', async () => {
  const registry = withHook({ creativeTypes: { display: true, video: true }, targets: [{}] });
  const vast = '<VAST><Ad><InLine></InLine></Ad></VAST>';

  const result = await pipeline(makeReq(), makeBidRequest(), registry, makeClient(vast, 2));
  assert.ok(getAdm(result).includes('<Impression><![CDATA[https://smash.example/t?c='));
});

test('video adm is untouched when video is disabled', async () => {
  const registry = withHook({ creativeTypes: { display: true, video: false }, targets: [{}] });
  const vast = '<VAST><Ad><InLine></InLine></Ad></VAST>';

  const result = await pipeline(makeReq(), makeBidRequest(), registry, makeClient(vast, 2));
  assert.equal(getAdm(result), vast);
});

test('native adm gets an eventtracker when native is enabled', async () => {
  const trk = tracking();
  const registry = withHook({ creativeTypes: { display: true, native: true }, targets: [{}] }, trk);
  const adm = JSON.stringify({ native: { ver: '1.2', assets: [], link: { url: 'https://adv.example' } } });

  const result = await pipeline(makeReq(), makeBidRequest(), registry, makeClient(adm, 4));
  const out = JSON.parse(getAdm(result));

  assert.equal(out.native.eventtrackers.length, 1);
  const tr = out.native.eventtrackers[0];
  assert.equal(tr.event, 1);
  assert.equal(tr.method, 1);

  const ctx = trk.unpack(new URL(tr.url).searchParams.get('c'));
  assert.equal(ctx.crid, 'crid-1');
  assert.equal(ctx.dsp, '333');
});

test('native 1.1 adm gets an imptracker, and the link stays intact', async () => {
  const registry = withHook({ creativeTypes: { native: true }, targets: [{}] });
  const adm = JSON.stringify({ native: { ver: '1.1', assets: [], link: { url: 'https://adv.example' } } });

  const result = await pipeline(makeReq(), makeBidRequest(), registry, makeClient(adm, 4));
  const out = JSON.parse(getAdm(result));

  assert.equal(out.native.imptrackers.length, 1);
  assert.ok(out.native.imptrackers[0].startsWith('https://smash.example/t?c='));
  assert.equal(out.native.eventtrackers, undefined);
  assert.equal(out.native.link.url, 'https://adv.example', 'click destination untouched');
});

test('native adm is untouched when native is disabled', async () => {
  const registry = withHook({ creativeTypes: { display: true, native: false }, targets: [{}] });
  const adm = JSON.stringify({ native: { ver: '1.2', assets: [] } });

  const result = await pipeline(makeReq(), makeBidRequest(), registry, makeClient(adm, 4));
  assert.equal(getAdm(result), adm);
});

test('targets gate: fires only for the matching SSP', async () => {
  const cfg = { creativeTypes: { display: true }, targets: [{ _side: 'ssp', knownBidder: 'pubmatic' }] };

  const match = await pipeline(makeReq(), makeBidRequest({ sspBidder: 'pubmatic' }), withHook(cfg), makeClient('<div>ad</div>'));
  assert.ok(getAdm(match).includes('data-smash-ctx="'));

  const miss = await pipeline(makeReq(), makeBidRequest({ sspBidder: 'appnexus' }), withHook(cfg), makeClient('<div>ad</div>'));
  assert.equal(getAdm(miss), '<div>ad</div>');
});

test('register wires nothing when the feature is disabled', async () => {
  const registry = createRegistry();
  const services = createServices();
  services.register('tracking', tracking());
  register(registry, services, { impFeedback: { enabled: false } });

  const result = await pipeline(makeReq(), makeBidRequest(), registry, makeClient('<div>ad</div>'));
  assert.equal(getAdm(result), '<div>ad</div>');
});

test('register wires nothing when the tracking service is disabled', async () => {
  const registry = createRegistry();
  const services = createServices();
  services.register('tracking', createTrackingService({ enabled: false }));
  register(registry, services, { impFeedback: { enabled: true, creativeTypes: { display: true } } });

  const result = await pipeline(makeReq(), makeBidRequest(), registry, makeClient('<div>ad</div>'));
  assert.equal(getAdm(result), '<div>ad</div>');
});

test('register wires the hook when both are enabled', async () => {
  const registry = createRegistry();
  const services = createServices();
  services.register('tracking', tracking());
  register(registry, services, { impFeedback: { enabled: true, creativeTypes: { display: true }, targets: [{}] } });

  const result = await pipeline(makeReq(), makeBidRequest(), registry, makeClient('<div>ad</div>'));
  assert.ok(getAdm(result).includes('data-smash-ctx="'));
});
