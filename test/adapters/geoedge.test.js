import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wrapAdm } from '../../features/geoedge-postbid/wrapper.js';
import { createGeoedgeHook } from '../../features/geoedge-postbid/core.js';
import { BidResponse } from '../../core/BidResponse.js';


test('wrapAdm contains the original adm', () => {
  const result = wrapAdm('<div>original</div>', { key: 'k', dspId: 1, crid: 'cr1', sspId: 100, w: 300, h: 250 });
  assert.ok(result.includes('<div>original</div>'));
});

test('wrapAdm includes the geoedge key', () => {
  const result = wrapAdm('<div>ad</div>', { key: 'my-uuid-key', dspId: 1, crid: 'cr1', sspId: 100, w: 300, h: 250 });
  assert.ok(result.includes('my-uuid-key'));
});

test('wrapAdm includes dspId and sspId', () => {
  const result = wrapAdm('<div>ad</div>', { key: 'k', dspId: 333, crid: 'cr1', sspId: 100, w: 300, h: 250 });
  assert.ok(result.includes('"333"'));
  assert.ok(result.includes('"100"'));
});

test('wrapAdm includes dimensions', () => {
  const result = wrapAdm('<div>ad</div>', { key: 'k', dspId: 1, crid: 'cr1', sspId: 1, w: 640, h: 480 });
  assert.ok(result.includes('"640"'));
  assert.ok(result.includes('"480"'));
});

test('wrapAdm strips double quotes from crid', () => {
  const result = wrapAdm('<div>ad</div>', { key: 'k', dspId: 1, crid: 'cr"123"', sspId: 1, w: 1, h: 1 });
  assert.ok(result.includes('cr123'));
  assert.ok(!result.match(/dcid:"cr"123"/));
});

test('wrapAdm includes geoedge footer script', () => {
  const result = wrapAdm('<div>ad</div>', { key: 'k', dspId: 1, crid: 'c', sspId: 1, w: 1, h: 1 });
  assert.ok(result.includes('rumcdn.geoedge.be'));
});


function makeBidResponse(adm = '<div>ad</div>', mtype = 1) {
  const rawBid = { id: 'b1', impid: 'i1', price: 1.5, adm, mtype, crid: 'cr-1', w: 300, h: 250 };
  return new BidResponse(rawBid, 'tl', 0, 0);
}

function makeCtx(responses) {
  return {
    dsp: { id: 333 },
    ssp: { id: 100 },
    responses,
    get response() { return this.responses[0]; },
  };
}

test('createGeoedgeHook throws if no key', () => {
  assert.throws(() => createGeoedgeHook(''), /key is required/);
  assert.throws(() => createGeoedgeHook(null), /key is required/);
});

test('hook wraps DisplayCreative and marks dirty', () => {
  const hook = createGeoedgeHook('test-key');
  const ctx = makeCtx([makeBidResponse()]);
  hook(ctx);
  assert.equal(ctx.response.creative._dirty, true);
});

test('hook inserts key into wrapped adm', () => {
  const hook = createGeoedgeHook('my-site-key');
  const ctx = makeCtx([makeBidResponse()]);
  hook(ctx);
  assert.ok(ctx.response.creative.serialize().includes('my-site-key'));
});

test('hook preserves original adm inside wrapper', () => {
  const hook = createGeoedgeHook('k');
  const ctx = makeCtx([makeBidResponse('<div>original</div>')]);
  hook(ctx);
  assert.ok(ctx.response.creative.serialize().includes('<div>original</div>'));
});

test('hook skips VideoCreative', () => {
  const hook = createGeoedgeHook('k');
  const ctx = makeCtx([makeBidResponse('<VAST version="4.0"/>', 2)]);
  hook(ctx);
  assert.equal(ctx.response.creative._dirty, false);
});

test('hook wraps only banner among mixed responses', () => {
  const hook = createGeoedgeHook('k');
  const banner = makeBidResponse('<div>banner</div>', 1);
  const video = makeBidResponse('<VAST/>', 2);
  const ctx = makeCtx([banner, video]);
  hook(ctx);
  assert.equal(banner.creative._dirty, true);
  assert.equal(video.creative._dirty, false);
});

test('hook returns ctx', () => {
  const hook = createGeoedgeHook('k');
  const ctx = makeCtx([makeBidResponse()]);
  assert.equal(hook(ctx), ctx);
});


test('hook created once per file and reused across requests', () => {
  // This simulates the pattern used in ssp/pubmatic/postbid-ssp.js:
  //   export default createGeoedgeHook('pubmatic-key')
  const pubmaticHook = createGeoedgeHook('pubmatic-key');

  const ctx1 = makeCtx([makeBidResponse('<div>ad1</div>')]);
  const ctx2 = makeCtx([makeBidResponse('<div>ad2</div>')]);

  pubmaticHook(ctx1);
  pubmaticHook(ctx2);

  assert.ok(ctx1.response.creative.serialize().includes('pubmatic-key'));
  assert.ok(ctx2.response.creative.serialize().includes('pubmatic-key'));
});
