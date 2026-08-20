import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detect, DisplayCreative, VideoCreative, NativeCreative } from '../core/creative/index.js';

test('detects banner by mtype=1', () => {
  assert.ok(detect('<div>ad</div>', 1) instanceof DisplayCreative);
});

test('detects video by mtype=2', () => {
  assert.ok(detect('<VAST version="4.0">', 2) instanceof VideoCreative);
});

test('detects native by mtype=4', () => {
  assert.ok(detect('{"native":{}}', 4) instanceof NativeCreative);
});

test('sniffs VAST from adm content', () => {
  assert.ok(detect('<VAST version="4.0"><Ad/></VAST>', null) instanceof VideoCreative);
});

test('sniffs native from JSON content', () => {
  assert.ok(detect('{"assets":[]}', null) instanceof NativeCreative);
});

test('defaults to DisplayCreative for html content', () => {
  assert.ok(detect('<div>banner</div>', null) instanceof DisplayCreative);
});

test('returns null for null adm', () => {
  assert.equal(detect(null, 1), null);
});

test('starts with _dirty = false', () => {
  const c = detect('<div>ad</div>', 1);
  assert.equal(c._dirty, false);
});

test('inject marks _dirty', () => {
  const c = detect('<div>ad</div>', 1);
  c.inject(adm => adm);
  assert.equal(c._dirty, true);
});

test('serialize applies transforms in order', () => {
  const c = detect('<div>ad</div>', 1);
  c.inject(adm => adm + '<!-- A -->');
  c.inject(adm => adm + '<!-- B -->');
  assert.equal(c.serialize(), '<div>ad</div><!-- A --><!-- B -->');
});

test('serialize without inject returns original adm', () => {
  const c = detect('<div>original</div>', 1);
  assert.equal(c.serialize(), '<div>original</div>');
});

test('VideoCreative inject and serialize', () => {
  const vast = '<VAST version="4.0"/>';
  const c = detect(vast, 2);
  c.inject(v => v.replace('4.0', '4.1'));
  assert.equal(c.serialize(), '<VAST version="4.1"/>');
});

test('NativeCreative mutate sees the unwrapped response and keeps the wrapper', () => {
  const c = detect('{"native":{"ver":"1.2","assets":[]}}', 4);
  c.mutate(root => { root.assets.push({ id: 1 }); });
  assert.deepEqual(JSON.parse(c.serialize()), {
    native: { ver: '1.2', assets: [{ id: 1 }] },
  });
});

test('NativeCreative mutate works on the bare response shape too', () => {
  const c = detect('{"ver":"1.2","assets":[]}', 4);
  c.mutate(root => { root.assets.push({ id: 1 }); });
  assert.deepEqual(JSON.parse(c.serialize()), { ver: '1.2', assets: [{ id: 1 }] });
});

test('NativeCreative parses and stringifies once for many mutations', () => {
  const c = detect('{"native":{"assets":[]}}', 4);
  const seen = [];
  c.mutate(root => { seen.push(root); root.a = 1; });
  c.mutate(root => { seen.push(root); root.b = 2; });

  const out = JSON.parse(c.serialize());
  assert.deepEqual(out.native, { assets: [], a: 1, b: 2 });
  assert.equal(seen.length, 2);
  assert.equal(seen[0], seen[1], 'both mutations share one parsed object');
});

test('NativeCreative applies string injects before object mutations', () => {
  const c = detect('{"native":{"assets":[]}}', 4);
  c.inject(adm => adm.replace('"assets"', '"ver":"1.2","assets"'));
  c.mutate(root => { root.tagged = true; });

  const out = JSON.parse(c.serialize());
  assert.deepEqual(out.native, { ver: '1.2', assets: [], tagged: true });
});

test('NativeCreative mutate leaves an unparseable adm untouched', () => {
  const c = detect('{"native": broken', 4);
  c.mutate(root => { root.tagged = true; });
  assert.equal(c.serialize(), '{"native": broken');
});

test('NativeCreative without mutations returns the original adm', () => {
  const c = detect('{"native":{"assets":[]}}', 4);
  assert.equal(c.serialize(), '{"native":{"assets":[]}}');
  assert.equal(c._dirty, false);
});

test('NativeCreative mutate marks _dirty', () => {
  const c = detect('{"native":{}}', 4);
  c.mutate(() => {});
  assert.equal(c._dirty, true);
});
