import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { createTrackingService } from '../../services/tracking/index.js';
import { detect } from '../../core/creative/index.js';

const KEY = Buffer.alloc(32, 7).toString('base64');

function svc(overrides = {}) {
  return createTrackingService({
    enabled: true,
    route: '/t',
    endpointUrl: 'https://smash.example/t',
    cdnScriptUrl: 'https://cdn.example/track.js',
    activeKeyid: 1,
    keyring: { 1: KEY },
    ...overrides,
  });
}

function fakeRes() {
  return {
    writeHead(code, headers) { this.statusCode = code; this.headers = headers; },
    end(body) { this.body = body; },
  };
}

test('pack/unpack round-trips the context', () => {
  const t = svc();
  const ctx = { req: 'r1', ts: 123, bid: { id: 'b1', price: 1.5, crid: 'cr-1' } };
  assert.deepEqual(t.unpack(t.pack(ctx)), ctx);
});

test('a bigger context still round-trips (gzip path)', () => {
  const t = svc();
  const ctx = { req: 'r1', blob: 'x'.repeat(2000) };
  assert.deepEqual(t.unpack(t.pack(ctx)), ctx);
});

test('a tampered token fails to unpack', () => {
  const t = svc();
  const token = t.pack({ a: 1 });
  const flip = token[12] === 'A' ? 'B' : 'A';
  const bad = token.slice(0, 12) + flip + token.slice(13);
  assert.throws(() => t.unpack(bad));
});

test('a token sealed under another key does not unpack here', () => {
  const other = svc({ keyring: { 1: Buffer.alloc(32, 9).toString('base64') } });
  const token = other.pack({ a: 1 });
  assert.throws(() => svc().unpack(token));
});

test('inject display appends a <script> carrying the token, endpoint and cdn', () => {
  const t = svc();
  const creative = detect('<div>ad</div>', 1);
  assert.equal(t.inject(creative, 'display', { req: 'r1' }), 'display');

  const out = creative.serialize();
  assert.ok(out.includes('<div>ad</div>'));
  assert.ok(out.includes('src="https://cdn.example/track.js"'));
  assert.ok(out.includes('data-smash-ep="https://smash.example/t"'));

  const m = out.match(/data-smash-ctx="([^"]+)"/);
  assert.ok(m, 'token attribute present');
  assert.deepEqual(t.unpack(m[1]), { req: 'r1' });
});

test('inject video splices an <Impression> before </InLine>', () => {
  const t = svc();
  const creative = detect('<VAST><Ad><InLine></InLine></Ad></VAST>', 2);
  assert.equal(t.inject(creative, 'video', { req: 'r1' }), 'video');

  const out = creative.serialize();
  assert.ok(out.includes('<Impression><![CDATA[https://smash.example/t?c='));
  assert.match(out, /<Impression>.*<\/InLine>/s);
});

test('inject video leaves a self-closing VAST untouched', () => {
  const t = svc();
  const creative = detect('<VAST version="4.0"/>', 2);
  t.inject(creative, 'video', { req: 'r1' });
  assert.equal(creative.serialize(), '<VAST version="4.0"/>');
});

test('inject native appends an eventtracker on a 1.2 response', () => {
  const t = svc();
  const creative = detect(JSON.stringify({
    native: { ver: '1.2', assets: [], link: { url: 'https://adv.example' } },
  }), 4);
  assert.equal(t.inject(creative, 'native', { req: 'r1' }), 'native');

  const out = JSON.parse(creative.serialize());
  assert.equal(out.native.eventtrackers.length, 1);
  const [tr] = out.native.eventtrackers;
  assert.equal(tr.event, 1);
  assert.equal(tr.method, 1);
  assert.ok(tr.url.startsWith('https://smash.example/t?c='));

  // 1.1 field must stay untouched — writing both would double-count.
  assert.equal(out.native.imptrackers, undefined);
  assert.deepEqual(t.unpack(new URL(tr.url).searchParams.get('c')), { req: 'r1' });
});

test('inject native falls back to imptrackers on a 1.1 response', () => {
  const t = svc();
  const creative = detect(JSON.stringify({
    native: { ver: '1.1', assets: [], imptrackers: ['https://dsp.example/imp'] },
  }), 4);
  assert.equal(t.inject(creative, 'native', { req: 'r1' }), 'native');

  const out = JSON.parse(creative.serialize());
  assert.equal(out.native.imptrackers.length, 2);
  assert.equal(out.native.imptrackers[0], 'https://dsp.example/imp');
  assert.ok(out.native.imptrackers[1].startsWith('https://smash.example/t?c='));
  assert.equal(out.native.eventtrackers, undefined);
});

test('inject native treats an existing eventtrackers array as 1.2 even without ver', () => {
  const t = svc();
  const creative = detect(JSON.stringify({ native: { assets: [], eventtrackers: [] } }), 4);
  t.inject(creative, 'native', { req: 'r1' });

  const out = JSON.parse(creative.serialize());
  assert.equal(out.native.eventtrackers.length, 1);
  assert.equal(out.native.imptrackers, undefined);
});

test('inject native handles the bare (unwrapped) response shape', () => {
  const t = svc();
  const creative = detect(JSON.stringify({ ver: '1.2', assets: [] }), 4);
  t.inject(creative, 'native', { req: 'r1' });

  const out = JSON.parse(creative.serialize());
  assert.equal(out.native, undefined, 'no wrapper is invented');
  assert.equal(out.eventtrackers.length, 1);
});

test('inject native leaves a non-JSON adm untouched', () => {
  const t = svc();
  const creative = detect('{"native": broken', 4);
  t.inject(creative, 'native', { req: 'r1' });
  assert.equal(creative.serialize(), '{"native": broken');
});

test('inject returns null for an unsupported type', () => {
  const t = svc();
  const creative = detect('<div>ad</div>', 1);
  assert.equal(t.inject(creative, 'audio', { req: 'r1' }), null);
  assert.equal(creative._dirty, false);
});

test('GET callback decodes ?c, fans out to consumers, returns the pixel', async () => {
  const t = svc();
  const seen = [];
  t.addConsumer(c => seen.push(c));

  const token = t.pack({ req: 'r1', n: 2 });
  const res = fakeRes();
  await t.handleCallback({ url: `/t?c=${token}` }, res);

  assert.deepEqual(seen, [{ req: 'r1', n: 2 }]);
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['Content-Type'], 'image/gif');
  assert.equal(res.headers['Cache-Control'], 'no-store');
  assert.ok(Buffer.isBuffer(res.body));
});

test('POST callback reads the token from the body', async () => {
  const t = svc();
  const seen = [];
  t.addConsumer(c => seen.push(c));

  const token = t.pack({ req: 'r9' });
  const req = Readable.from([Buffer.from(token)]);
  req.method = 'POST';
  req.url = '/t';
  const res = fakeRes();
  await t.handleCallback(req, res);

  assert.deepEqual(seen, [{ req: 'r9' }]);
  assert.equal(res.statusCode, 200);
});

test('callback with a bad token still returns the pixel and skips consumers', async () => {
  const t = svc();
  const seen = [];
  t.addConsumer(c => seen.push(c));

  const res = fakeRes();
  await t.handleCallback({ url: '/t?c=not-a-real-token' }, res);

  assert.equal(seen.length, 0);
  assert.equal(res.statusCode, 200);
});

test('routes() declares GET+POST when enabled, nothing when not', () => {
  assert.deepEqual(
    svc().routes().map(r => [r.method, r.path]),
    [['GET', '/t'], ['POST', '/t']],
  );
  assert.equal(svc({ enabled: false }).enabled, false);
  assert.deepEqual(svc({ enabled: false }).routes(), []);
  assert.deepEqual(svc({ endpointUrl: '' }).routes(), []);
  assert.deepEqual(svc({ keyring: { 1: '' } }).routes(), []);
});
