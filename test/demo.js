// Integration demo — real mock DSP HTTP server + full pipeline.
//
// Each test section covers a distinct feature of the system:
//   adapters (appnexus / criteo / magnite / triplelift)
//   wildcard hooks (seat-123, ep-2788)
//   geoedge creative wrapping
//   pipeline edge cases (timeout, DSP error, filter)
//   tool error handling
//   signals between stages
//
// Run:  node --test test/demo.js

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

import { createRegistry } from '../core/registry.js';
import { pipeline } from '../core/pipeline.js';
import { register as loadAdapters } from '../features/injector/index.js';
import { wrapToolHandler } from '../features/geoedge-postbid/index.js';
import { createGeoedgeHook } from '../features/geoedge-postbid/core.js';
import { _dedupWith } from '../features/user-dedup/prebid-dsp.js';
import { indent } from '../core/utils.js';


const R = '\x1b[0m';
const B = '\x1b[1m';
const CYAN = `${B}\x1b[36m`;
const GREEN = `${B}\x1b[32m`;
const YELLOW = `${B}\x1b[33m`;
const MAGENTA = `${B}\x1b[35m`;

const { i2: I2 } = indent;

function log(tag, color, ...args) {
  const s = args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
  console.log(`${I2}${color}[${tag}]${R} ${s}`);
}


function createMockDsp() {
  let _handler = async () => null;

  const srv = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const reqBody = JSON.parse(Buffer.concat(chunks).toString());

    let reply;
    try { reply = await _handler(reqBody, req.headers); }
    catch { reply = null; }

    if (!reply) {
      log('DSP', MAGENTA, `← ${reqBody.id}  → 204 no-bid`);
      res.writeHead(204); res.end();
    } else if (reply._status) {
      log('DSP', MAGENTA, `← ${reqBody.id}  → ${reply._status} (error)`);
      res.writeHead(reply._status); res.end();
    } else {
      const price = reply.seatbid?.[0]?.bid?.[0]?.price;
      log('DSP', MAGENTA, `← ${reqBody.id}  → 200 bid  price=${price}`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(reply));
    }
  });

  return {
    start: () => new Promise(r => srv.listen(0, '127.0.0.1', r)),
    stop: () => new Promise((r, j) => srv.close(e => e ? j(e) : r())),
    get port() { return srv.address().port; },
    respond(fn) { _handler = fn; },
    bidWith(adm, { price = 2.75, mtype = 1, crid = 'demo-crid-001', w = 300, h = 250 } = {}) {
      _handler = async (body) => ({
        id: body.id, cur: 'USD',
        seatbid: [{ seat: 's1', bid: [{ id: 'b1', impid: 'imp1', price, adm, mtype, crid, adomain: ['demo.com'], w, h }] }],
      });
    },
    noBid() { _handler = async () => null; },
    httpError(code){ _handler = async () => ({ _status: code }); },
    delayMs(ms) { _handler = async (_body) => new Promise(r => setTimeout(() => r(null), ms)); },
  };
}


const REQ = { headers: { 'x-smash-protocol': 'openrtb/2.5' } };

function makeBody(dspPort, {
  knownBidder = 'appnexus',
  dspId = 333,
  params = { placementId: '99999' },
  mtype = 1,
  tmax = 2000,
  api = null,
  device = {},
  regs = null,
  user = null,
  ssp = { id: 100, knownBidder: 'pubmatic' },
} = {}) {
  return {
    id: `req-${Math.random().toString(36).slice(2, 8)}`,
    imp: [{
      id: 'imp1',
      banner: mtype !== 2 ? { w: 300, h: 250, format: [{ w: 300, h: 250 }] } : undefined,
      video: mtype === 2 ? { w: 640, h: 480, mimes: ['video/mp4'], protocols: [2, 3] } : undefined,
      ...(api ? { api } : {}),
      ext: { smash: {
        dsp: { id: dspId, knownBidder, endpointId: null, destination: { url: `http://127.0.0.1:${dspPort}` }, params },
        ssp,
      }},
    }],
    site: { page: 'https://demo.example.com', publisher: { domain: 'example.com' } },
    device: { ua: 'demo/1.0', ip: '1.2.3.4', ...device },
    ...(regs ? { regs } : {}),
    ...(user ? { user } : {}),
    tmax,
  };
}

function getAdm(result) { return result?.seatbid?.[0]?.bid?.[0]?.adm; }
function getPrice(result) { return result?.seatbid?.[0]?.bid?.[0]?.price; }
function getMeta(result) { return result?.ext?.smash; }

const BANNER_ADM = '<div style="background:#4a90;width:300px;height:250px">DEMO BANNER</div>';
const VAST_ADM = '<VAST version="4.0"><Ad><InLine><AdTitle>Demo</AdTitle></InLine></Ad></VAST>';
const NATIVE_ADM = '{"native":{"ver":"1.1","link":{},"assets":[]}}';


let dsp;
let registry;

before(async () => {
  log('SETUP', CYAN, 'starting mock DSP...');
  dsp = createMockDsp();
  await dsp.start();
  log('SETUP', CYAN, `mock DSP :${dsp.port}`);

  registry = createRegistry();
  const adapters = await loadAdapters(registry);
  for (const a of adapters.filter(a => !a.error))
    log('SETUP', CYAN, `  adapter  ${a.label}`);

  registry.register('postbid-ssp', null,
    wrapToolHandler(createGeoedgeHook('demo-key-abc123'), 'geoedge'), 'geoedge');
  log('SETUP', CYAN, `  feature  geoedge  key=demo-key-abc123 (force-enabled)`);
});

after(async () => {
  await dsp.stop();
  log('TEARDOWN', CYAN, 'done');
});

//  SECTION 1 — APPNEXUS

test('appnexus — sets placement_id and member on outbound request', async () => {
  let captured;
  dsp.respond(async (body) => {
    captured = body.imp?.[0]?.ext?.appnexus;
    log('DSP', MAGENTA, `   imp.ext.appnexus = ${JSON.stringify(captured)}`);
    return { id: body.id, cur: 'USD', seatbid: [{ seat: 's', bid: [{ id:'b', impid:'imp1', price:2, adm:BANNER_ADM, mtype:1, crid:'c', w:300, h:250 }] }] };
  });

  await pipeline(REQ, makeBody(dsp.port, { params: { placementId: '12345', memberId: '999' } }), registry);

  log('TEST', GREEN, `   placement_id=${captured?.placement_id}  member=${captured?.member}  hb_source=${captured?.hb_source ?? 'n/a (ext.appnexus)'}`);
  assert.equal(captured?.placement_id, 12345);
  assert.equal(captured?.member, '999');
});

test('appnexus — blocks when no placementId, DSP never called', async () => {
  let called = false;
  dsp.respond(async () => { called = true; return null; });

  const result = await pipeline(REQ, makeBody(dsp.port, { params: {} }), registry);

  log('TEST', YELLOW, `   result=${result}  dspCalled=${called}`);
  assert.equal(result, null);
  assert.equal(called, false, 'DSP must not be called');
});

//  SECTION 2 — CRITEO

test('criteo — sets uid/zoneId/pubId/networkId', async () => {
  let captured;
  dsp.respond(async (body) => {
    captured = { bidder: body.imp?.[0]?.ext?.bidder, pubId: body.imp?.[0]?.ext?.pubId };
    log('DSP', MAGENTA, `   imp[0].ext = ${JSON.stringify(captured)}`);
    return { id: body.id, cur: 'USD', seatbid: [{ seat:'s', bid:[{id:'b',impid:'imp1',price:1.5,adm:BANNER_ADM,mtype:1,crid:'c',w:300,h:250}] }] };
  });

  const body = makeBody(dsp.port, {
    knownBidder: 'criteo',
    params: { zoneId: 'zone-456', pubId: '111', networkId: '222' },
  });
  await pipeline(REQ, body, registry);

  log('TEST', GREEN, `   uid=${captured?.bidder?.uid}  networkid=${captured?.bidder?.networkid}  pubId=${captured?.pubId}`);
  assert.equal(captured?.bidder?.uid, 'zone-456');
  assert.equal(captured?.bidder?.networkid, 222);
  assert.equal(captured?.pubId, '111');
});

test('criteo — normalizes android → Android, ios → iOS', async () => {
  let capturedOs;
  dsp.respond(async (body) => {
    capturedOs = body.device?.os;
    return { id: body.id, cur: 'USD', seatbid: [{ seat:'s', bid:[{id:'b',impid:'imp1',price:1,adm:BANNER_ADM,mtype:1,crid:'c',w:300,h:250}] }] };
  });

  const body = makeBody(dsp.port, { knownBidder: 'criteo', params: { zoneId: 'z1' }, device: { os: 'android', ua: 'test', ip: '1.2.3.4' } });
  await pipeline(REQ, body, registry);

  log('TEST', GREEN, `   device.os: android → ${capturedOs}`);
  assert.equal(capturedOs, 'Android');
});

test('criteo — sets video minduration/maxduration for video imp', async () => {
  let capturedVideo;
  dsp.respond(async (body) => {
    capturedVideo = body.imp?.[0]?.video;
    log('DSP', MAGENTA, `   imp[0].video.minduration=${capturedVideo?.minduration}  maxduration=${capturedVideo?.maxduration}`);
    return { id: body.id, cur: 'USD', seatbid: [{ seat:'s', bid:[{id:'b',impid:'imp1',price:1,adm:VAST_ADM,mtype:2,crid:'c',w:640,h:480}] }] };
  });

  const body = makeBody(dsp.port, { knownBidder: 'criteo', params: { zoneId: 'z1' }, mtype: 2 });
  body.imp[0].video.minduration = 5;
  body.imp[0].video.maxduration = 30;
  await pipeline(REQ, body, registry);

  log('TEST', GREEN, `   minduration=${capturedVideo?.minduration}  maxduration=${capturedVideo?.maxduration}`);
  assert.equal(capturedVideo?.minduration, 5);
  assert.equal(capturedVideo?.maxduration, 30);
});

//  SECTION 3 — MAGNITE

test('magnite — sets zone_id, account_id, Basic Auth header', async () => {
  let capturedRp, capturedAuth;
  dsp.respond(async (body, headers) => {
    capturedRp = body.imp?.[0]?.ext?.rp;
    capturedAuth = headers?.authorization;
    log('DSP', MAGENTA, `   imp.ext.rp=${JSON.stringify(capturedRp)}`);
    log('DSP', MAGENTA, `   Authorization=${capturedAuth}`);
    return { id: body.id, cur: 'USD', seatbid: [{ seat:'s', bid:[{id:'b',impid:'imp1',price:3,adm:BANNER_ADM,mtype:1,crid:'c',w:300,h:250}] }] };
  });

  const body = makeBody(dsp.port, {
    knownBidder: 'magnite',
    params: { accountId: '7281', zoneId: '456789', siteId: '11', username: 'me', password: 'secret' },
  });
  await pipeline(REQ, body, registry);

  const expectedAuth = `Basic ${Buffer.from('me:secret').toString('base64')}`;
  log('TEST', GREEN, `   zone_id=${capturedRp?.zone_id}  auth match=${capturedAuth === expectedAuth}`);
  assert.equal(capturedRp?.zone_id, 456789);
  assert.equal(capturedAuth, expectedAuth, 'Basic Auth header');
});

test('magnite — blocks when accountId or zoneId missing', async () => {
  let called = false;
  dsp.respond(async () => { called = true; return null; });

  const result = await pipeline(REQ, makeBody(dsp.port, { knownBidder: 'magnite', params: { zoneId: '456' } }), registry);

  log('TEST', YELLOW, `   result=${result}  dspCalled=${called}  (no accountId)`);
  assert.equal(result, null);
  assert.equal(called, false);
});

test('magnite — GDPR: regs.gdpr + user.consent on DSP request', async () => {
  let capturedRegs, capturedUser;
  dsp.respond(async (body) => {
    capturedRegs = body.regs;
    capturedUser = body.user;
    return { id: body.id, cur: 'USD', seatbid: [{ seat:'s', bid:[{id:'b',impid:'imp1',price:2,adm:BANNER_ADM,mtype:1,crid:'c',w:300,h:250}] }] };
  });

  const body = makeBody(dsp.port, {
    knownBidder: 'magnite',
    params: { accountId: '7281', zoneId: '456789' },
    regs: { ext: { gdpr: 1 } },
    user: { ext: { consent: 'BOEFEAyOEFEAyAHABDENAI4AAAB9vABAASA' } },
  });
  await pipeline(REQ, body, registry);

  log('TEST', GREEN, `   regs.gdpr=${capturedRegs?.gdpr}  (regs.ext.gdpr removed: ${capturedRegs?.ext?.gdpr === undefined})`);
  log('TEST', GREEN, `   user.consent=${capturedUser?.consent?.slice(0, 20)}...  (user.ext.consent removed: ${capturedUser?.ext?.consent === undefined})`);
  assert.equal(capturedRegs?.gdpr, 1, 'regs.gdpr set');
  assert.equal(capturedRegs?.ext?.gdpr, undefined, 'regs.ext.gdpr removed');
  assert.equal(capturedUser?.consent, 'BOEFEAyOEFEAyAHABDENAI4AAAB9vABAASA', 'user.consent set');
  assert.equal(capturedUser?.ext?.consent, undefined, 'user.ext.consent removed');
});

//  SECTION 4 — TRIPLELIFT

test('triplelift — sets imp.ext.bidder.inventoryCode', async () => {
  let captured;
  dsp.respond(async (body) => {
    captured = body.imp?.[0]?.ext?.bidder;
    log('DSP', MAGENTA, `   imp.ext.bidder=${JSON.stringify(captured)}`);
    return { id: body.id, cur: 'USD', seatbid: [{ seat:'s', bid:[{id:'b',impid:'imp1',price:1.2,adm:BANNER_ADM,mtype:1,crid:'c',w:300,h:250}] }] };
  });

  await pipeline(REQ, makeBody(dsp.port, { knownBidder: 'triplelift', params: { inventoryCode: 'xe_homepage_300x250' } }), registry);

  log('TEST', GREEN, `   inventoryCode=${captured?.inventoryCode}`);
  assert.equal(captured?.inventoryCode, 'xe_homepage_300x250');
});

test('triplelift — blocks when inventoryCode missing', async () => {
  let called = false;
  dsp.respond(async () => { called = true; return null; });

  const result = await pipeline(REQ, makeBody(dsp.port, { knownBidder: 'triplelift', params: {} }), registry);

  log('TEST', YELLOW, `   result=${result}  dspCalled=${called}`);
  assert.equal(result, null);
  assert.equal(called, false);
});

//  SECTION 5 — WILDCARD: seat-123 (dsp/_/)

test('seat-123 (dsp/_/) — blocks request without MRAID api=[7]', async () => {
  let called = false;
  dsp.respond(async () => { called = true; return null; });

  // seat-123 matches any DSP with id='123'; without api=[7] it returns null
  const body = makeBody(dsp.port, { knownBidder: null, dspId: '123', params: {} });
  body.imp[0].ext.smash.dsp.destination = { url: `http://127.0.0.1:${dsp.port}` };
  const result = await pipeline(REQ, body, registry);

  log('TEST', YELLOW, `   result=${result}  dspCalled=${called}  (no api=[7])`);
  assert.equal(result, null);
  assert.equal(called, false);
});

test('seat-123 (dsp/_/) — passes when api includes 7 (MRAID)', async () => {
  dsp.bidWith(BANNER_ADM);

  const body = makeBody(dsp.port, { knownBidder: null, dspId: '123', params: {}, api: [3, 7] });
  const result = await pipeline(REQ, body, registry);

  log('TEST', GREEN, `   result=${result ? '200 bid' : 'null'}  price=${getPrice(result)}`);
  assert.ok(result, 'pipeline returned a bid');
});

//  SECTION 6 — SSP HOOK: ep-2788 (ssp/_/)

test('ep-2788 (ssp/_/) — filters blocked crid → 204', async () => {
  dsp.bidWith(BANNER_ADM, { crid: 'democrid1234qwerty:16' }); // this crid is blocked

  const body = makeBody(dsp.port, {
    params: { placementId: '99999' },
    ssp: { id: 100, knownBidder: 'pubmatic', endpointId: '2788' },
  });
  const result = await pipeline(REQ, body, registry);

  log('TEST', YELLOW, `   result=${result}  (blocked crid filtered → empty responses → no-bid)`);
  assert.equal(result, null);
});

test('ep-2788 (ssp/_/) — passes non-blocked crid', async () => {
  dsp.bidWith(BANNER_ADM, { crid: 'legitimate-crid-999' });

  const body = makeBody(dsp.port, {
    params: { placementId: '99999' },
    ssp: { id: 100, knownBidder: 'pubmatic', endpointId: '2788' },
  });
  const result = await pipeline(REQ, body, registry);

  log('TEST', GREEN, `   result=${result ? 'bid' : 'null'}  crid=${result?.seatbid?.[0]?.bid?.[0]?.crid}`);
  assert.ok(result, 'bid passes through');
});

//  SECTION 7 — GEOEDGE

test('geoedge — banner adm wrapped with key + footer script', async () => {
  dsp.bidWith(BANNER_ADM);
  const result = await pipeline(REQ, makeBody(dsp.port, { params: { placementId: '99999' } }), registry);
  const adm = getAdm(result);

  log('TEST', GREEN, `   key present      : ${adm?.includes('demo-key-abc123')}`);
  log('TEST', GREEN, `   original inside  : ${adm?.includes('DEMO BANNER')}`);
  log('TEST', GREEN, `   footer script    : ${adm?.includes('rumcdn.geoedge.be')}`);
  log('TEST', GREEN, `   adm[:80]         : ${adm?.slice(0, 80)}...`);

  assert.ok(adm?.includes('demo-key-abc123'), 'key injected');
  assert.ok(adm?.includes('DEMO BANNER'), 'original adm preserved');
  assert.ok(adm?.includes('rumcdn.geoedge.be'), 'footer script present');
});

test('geoedge — video VAST passes through unchanged', async () => {
  dsp.respond(async (body) => ({
    id: body.id, cur: 'USD',
    seatbid: [{ seat:'s', bid:[{id:'b',impid:'imp1',price:1.5,adm:VAST_ADM,mtype:2,crid:'c',w:640,h:480}] }],
  }));
  const result = await pipeline(REQ, makeBody(dsp.port, { params: { placementId: '99999' }, mtype: 2 }), registry);
  const adm = getAdm(result);

  log('TEST', GREEN, `   adm=${adm?.slice(0, 60)}`);
  log('TEST', GREEN, `   geoedge touched: ${adm?.includes('demo-key-abc123')}`);
  assert.equal(adm, VAST_ADM, 'VAST unchanged');
});

test('geoedge — native JSON adm passes through unchanged', async () => {
  dsp.respond(async (body) => ({
    id: body.id, cur: 'USD',
    seatbid: [{ seat:'s', bid:[{id:'b',impid:'imp1',price:1,adm:NATIVE_ADM,mtype:4,crid:'c',w:0,h:0}] }],
  }));
  const body = makeBody(dsp.port, { params: { placementId: '99999' } });
  body.imp[0].native = { request: '{}', ver: '1.1' };
  const result = await pipeline(REQ, body, registry);
  const adm = getAdm(result);

  log('TEST', GREEN, `   adm=${adm?.slice(0, 40)}`);
  log('TEST', GREEN, `   geoedge touched: ${adm?.includes('demo-key-abc123')}`);
  assert.equal(adm, NATIVE_ADM, 'native JSON unchanged');
});

test('geoedge — per-SSP hook fires only for pubmatic, not for appnexus', async () => {
  dsp.bidWith(BANNER_ADM);

  // Fresh registry — only per-SSP pubmatic geoedge, no global
  const reg = createRegistry();
  await loadAdapters(reg);
  reg.register('postbid-ssp', { _side: 'ssp', knownBidder: 'pubmatic' },
    createGeoedgeHook('pubmatic-only-key'), 'geoedge-pubmatic');

  const pubmaticBody = makeBody(dsp.port, {
    params: { placementId: '99999' },
    ssp: { id: 100, knownBidder: 'pubmatic' },
  });
  const openxBody = makeBody(dsp.port, {
    params: { placementId: '99999' },
    ssp: { id: 200, knownBidder: 'openx' },
  });

  const r1 = await pipeline(REQ, pubmaticBody, reg);
  const r2 = await pipeline(REQ, openxBody, reg);

  log('TEST', GREEN, `   pubmatic adm wrapped  : ${getAdm(r1)?.includes('pubmatic-only-key')}`);
  log('TEST', GREEN, `   openx   adm unchanged : ${!getAdm(r2)?.includes('pubmatic-only-key')}`);

  assert.ok( getAdm(r1)?.includes('pubmatic-only-key'), 'pubmatic: wrapped');
  assert.ok(!getAdm(r2)?.includes('pubmatic-only-key'), 'openx: untouched');
});

//  SECTION 8 — PIPELINE BEHAVIORS

test('DSP no-bid (204) → null', async () => {
  dsp.noBid();
  const result = await pipeline(REQ, makeBody(dsp.port, { params: { placementId: '99999' } }), registry);
  log('TEST', YELLOW, `   result=${result}`);
  assert.equal(result, null);
});

test('DSP HTTP error (503) → null', async () => {
  dsp.httpError(503);
  const result = await pipeline(REQ, makeBody(dsp.port, { params: { placementId: '99999' } }), registry);
  log('TEST', YELLOW, `   dsp.status=${getMeta(result)?.dsp?.status ?? 'null (no-bid)'}  result=${result}`);
  assert.equal(result, null);
});

test('DSP timeout → null', async () => {
  dsp.delayMs(400); // DSP delays 400ms, tmax=200ms → timeout

  const body = makeBody(dsp.port, { params: { placementId: '99999' }, tmax: 200 });
  const result = await pipeline(REQ, body, registry);

  log('TEST', YELLOW, `   result=${result}  (tmax=200ms, DSP delayed 400ms)`);
  assert.equal(result, null);
});

test('ext.smash stripped from DSP request body', async () => {
  let dspSaw;
  dsp.respond(async (body) => {
    dspSaw = body.imp?.[0]?.ext?.smash;
    return { id: body.id, cur: 'USD', seatbid: [{ seat:'s', bid:[{id:'b',impid:'imp1',price:1,adm:BANNER_ADM,mtype:1,crid:'c',w:300,h:250}] }] };
  });

  await pipeline(REQ, makeBody(dsp.port, { params: { placementId: '99999' } }), registry);

  log('TEST', GREEN, `   ext.smash in DSP body = ${JSON.stringify(dspSaw)}  ${dspSaw === undefined ? 'stripped' : 'LEAKED'}`);
  assert.equal(dspSaw, undefined, 'ext.smash must be stripped');
});

test('ext.smash meta returned to XE — requestId, latency, dsp.status', async () => {
  dsp.bidWith(BANNER_ADM);
  const result = await pipeline(REQ, makeBody(dsp.port, { params: { placementId: '99999' } }), registry);
  const meta = getMeta(result);

  log('TEST', GREEN, `   requestId   = ${meta?.requestId}`);
  log('TEST', GREEN, `   dsp.status  = ${meta?.dsp?.status}`);
  log('TEST', GREEN, `   dsp.latency = ${meta?.dsp?.latency}ms`);

  assert.ok(meta?.requestId, 'requestId present');
  assert.equal(meta?.dsp?.status, 'ok');
  assert.ok(typeof meta?.dsp?.latency === 'number');
});

//  SECTION 9 — TOOL ERROR HANDLING

test('tool throws → error logged in ext.smash, bid still returned', async () => {
  dsp.bidWith(BANNER_ADM);

  // Fresh registry with a broken tool — geoedge replaced by a throwing hook
  const reg = createRegistry();
  await loadAdapters(reg);
  reg.register('postbid-ssp', null,
    wrapToolHandler(() => { throw new Error('geoedge exploded'); }, 'geoedge'),
    'geoedge');

  const result = await pipeline(REQ, makeBody(dsp.port, { params: { placementId: '99999' } }), reg);
  const meta = getMeta(result);

  log('TEST', GREEN, `   bid returned  : ${!!result}`);
  log('TEST', GREEN, `   adm unchanged : ${getAdm(result) === BANNER_ADM}`);
  log('TEST', GREEN, `   error logged  : ${JSON.stringify(meta?.errors?.[0])}`);

  assert.ok(result, 'bid still returned despite tool error');
  assert.equal(getAdm(result), BANNER_ADM, 'adm unchanged (tool did not corrupt it)');
  assert.equal(meta?.errors?.[0]?.handler, 'geoedge', 'error handler name logged');
  assert.ok(meta?.errors?.[0]?.error?.includes('exploded'), 'error message logged');
});

//  SECTION 10 — SIGNALS BETWEEN STAGES

test('signals — prebid-ssp writes minPrice, postbid-dsp filters cheap bids', async () => {

  // DSP returns a cheap bid (price=0.3)
  dsp.bidWith(BANNER_ADM, { price: 0.3 });

  // Fresh registry with custom hooks for this test
  const reg = createRegistry();
  await loadAdapters(reg);

  // prebid-ssp: set floor signal
  reg.register('prebid-ssp', null, (ctx) => {
    ctx.signals.minPrice = 1.0;
    log('TEST', CYAN, `   [prebid-ssp] ctx.signals.minPrice = ${ctx.signals.minPrice}`);
    return ctx;
  }, 'set-floor');

  // postbid-dsp: read signal, filter bids below floor
  reg.register('postbid-dsp', null, (ctx) => {
    const before = ctx.responses.length;
    ctx.responses = ctx.responses.filter(r => r.price >= ctx.signals.minPrice);
    log('TEST', CYAN, `   [postbid-dsp] filter: ${before} bid(s) → ${ctx.responses.length} (floor=${ctx.signals.minPrice})`);
    return ctx;
  }, 'price-floor');

  const result = await pipeline(REQ, makeBody(dsp.port, { params: { placementId: '99999' } }), reg);

  log('TEST', YELLOW, `   DSP price=0.3 < floor=1.0 → result=${result}`);
  assert.equal(result, null, 'bid filtered out by signal-driven floor');

  // Now with a bid above floor
  dsp.bidWith(BANNER_ADM, { price: 2.5 });
  const result2 = await pipeline(REQ, makeBody(dsp.port, { params: { placementId: '99999' } }), reg);
  log('TEST', GREEN, `   DSP price=2.5 ≥ floor=1.0 → price=${getPrice(result2)}`);
  assert.equal(getPrice(result2), 2.5, 'bid above floor passes through');
});

//  SECTION 11 — USER DEDUP  (XE-8768, seat-323)
//
//  Uses _dedupWith directly with an in-memory Redis mock.
//  In production, register() wires this to seat-323 with a real redisUrl.

// Shared in-memory Redis store for this section — resets per test via closure.
function createMemRedis() {
  const store = new Set();
  return {
    set: async (key, _v, opts) => {
      if (opts?.NX && store.has(key)) return null;
      store.add(key);
      return 'OK';
    },
  };
}


test('user-dedup — first bid for IFA passes through', async () => {
  dsp.bidWith(BANNER_ADM, { price: 1.5 });
  const redis = createMemRedis();

  const reg = createRegistry();
  await loadAdapters(reg);
  reg.register('prebid-dsp', { _side: 'dsp', seatId: '323' }, async (ctx) => {
    if (!ctx.device.ifa) return ctx;
    return _dedupWith(ctx, redis, 60_000);
  }, 'user-dedup');

  const body = makeBody(dsp.port, {
    knownBidder: null, dspId: '323', params: {},
    device: { ifa: 'aaa-ifa-111' },
  });
  const result = await pipeline(REQ, body, reg);

  log('TEST', GREEN, `   result=${result ? 'bid' : 'null'}  price=${getPrice(result)}`);
  assert.ok(result, 'first bid passes');
});

test('user-dedup — second bid for same IFA → no-bid (duplicate)', async () => {
  dsp.bidWith(BANNER_ADM, { price: 1.5 });
  const redis = createMemRedis(); // fresh store

  const reg = createRegistry();
  await loadAdapters(reg);
  reg.register('prebid-dsp', { _side: 'dsp', seatId: '323' }, async (ctx) => {
    if (!ctx.device.ifa) return ctx;
    return _dedupWith(ctx, redis, 60_000);
  }, 'user-dedup');

  const body = () => makeBody(dsp.port, {
    knownBidder: null, dspId: '323', params: {},
    device: { ifa: 'bbb-ifa-222' },
  });

  const first = await pipeline(REQ, body(), reg);
  const second = await pipeline(REQ, body(), reg);

  log('TEST', GREEN, `   1st request → ${first ? 'bid' : 'null'}`);
  log('TEST', YELLOW, `   2nd request → ${second ? 'bid' : 'null'}  (duplicate → no-bid)`);
  assert.ok(first, '1st bid passes');
  assert.equal(second, null, '2nd bid blocked as duplicate');
});

test('user-dedup — different IFA on same DSP → both pass', async () => {
  dsp.bidWith(BANNER_ADM, { price: 1.5 });
  const redis = createMemRedis();

  const reg = createRegistry();
  await loadAdapters(reg);
  reg.register('prebid-dsp', { _side: 'dsp', seatId: '323' }, async (ctx) => {
    if (!ctx.device.ifa) return ctx;
    return _dedupWith(ctx, redis, 60_000);
  }, 'user-dedup');

  const r1 = await pipeline(REQ, makeBody(dsp.port, { knownBidder: null, dspId: '323', params: {}, device: { ifa: 'device-A' } }), reg);
  const r2 = await pipeline(REQ, makeBody(dsp.port, { knownBidder: null, dspId: '323', params: {}, device: { ifa: 'device-B' } }), reg);

  log('TEST', GREEN, `   device-A → ${r1 ? 'bid' : 'null'}`);
  log('TEST', GREEN, `   device-B → ${r2 ? 'bid' : 'null'}  (different IFA, not a duplicate)`);
  assert.ok(r1, 'device-A passes');
  assert.ok(r2, 'device-B passes');
});

test('user-dedup — no IFA → hook skips, bid passes', async () => {
  dsp.bidWith(BANNER_ADM, { price: 1.5 });
  const redis = createMemRedis();

  const reg = createRegistry();
  await loadAdapters(reg);
  reg.register('prebid-dsp', { _side: 'dsp', seatId: '323' }, async (ctx) => {
    if (!ctx.device.ifa) return ctx;
    return _dedupWith(ctx, redis, 60_000);
  }, 'user-dedup');

  const body = makeBody(dsp.port, { knownBidder: null, dspId: '323', params: {} });
  // no device.ifa set
  const result = await pipeline(REQ, body, reg);

  log('TEST', GREEN, `   no IFA → result=${result ? 'bid' : 'null'}  (hook skipped)`);
  assert.ok(result, 'bid passes when IFA absent');
});

test('user-dedup — hook does not fire for other DSP seats', async () => {
  dsp.bidWith(BANNER_ADM, { price: 1.5 });
  const redis = createMemRedis();

  // Even with a Redis that would deduplicate, seat-999 never hits the hook
  const reg = createRegistry();
  await loadAdapters(reg);
  reg.register('prebid-dsp', { _side: 'dsp', seatId: '323' }, async (ctx) => {
    if (!ctx.device.ifa) return ctx;
    return _dedupWith(ctx, redis, 60_000);
  }, 'user-dedup');

  const body = () => makeBody(dsp.port, {
    knownBidder: null, dspId: '999', params: {},
    device: { ifa: 'shared-ifa-xyz' },
  });

  const r1 = await pipeline(REQ, body(), reg);
  const r2 = await pipeline(REQ, body(), reg);

  log('TEST', GREEN, `   seat-999 1st → ${r1 ? 'bid' : 'null'}`);
  log('TEST', GREEN, `   seat-999 2nd → ${r2 ? 'bid' : 'null'}  (hook not targeted → no dedup)`);
  assert.ok(r1, '1st bid passes (untargeted)');
  assert.ok(r2, '2nd bid passes (untargeted, hook never fired)');
});
