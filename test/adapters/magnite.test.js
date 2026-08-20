import { test } from 'node:test';
import assert from 'node:assert/strict';
import handler from '../../features/injector/dsp/magnite/prebid-dsp.js';
import { makeCtx, getPatch } from './helpers.js';

const required = { accountId: '100', siteId: '200', zoneId: '300' };

test('returns null if accountId missing', async () => {
  const ctx = makeCtx({ dsp: { params: { zoneId: '300' } } });
  assert.equal(await handler(ctx), null);
});

test('returns null if zoneId missing', async () => {
  const ctx = makeCtx({ dsp: { params: { accountId: '100' } } });
  assert.equal(await handler(ctx), null);
});

test('sets imp.ext.rp.zone_id as integer', async () => {
  const ctx = makeCtx({ dsp: { params: required } });
  await handler(ctx);
  assert.equal(getPatch(ctx, 'imp.ext.rp').zone_id, 300);
});

test('sets site.publisher.ext.rp.account_id', async () => {
  const ctx = makeCtx({ dsp: { params: required }, _raw: { imp: [{}], site: {} } });
  await handler(ctx);
  assert.equal(getPatch(ctx, 'site.publisher.ext.rp').account_id, 100);
});

test('sets Basic Auth header when username and password provided', async () => {
  const ctx = makeCtx({ dsp: { params: { ...required, username: 'user', password: 'pass' } } });
  await handler(ctx);
  const expected = 'Basic ' + Buffer.from('user:pass').toString('base64');
  assert.equal(ctx._headers['Authorization'], expected);
});

test('no Auth header when username/password not provided', async () => {
  const ctx = makeCtx({ dsp: { params: required } });
  await handler(ctx);
  assert.equal(ctx._headers['Authorization'], undefined);
});

test('sets banner size_id for known size', async () => {
  const ctx = makeCtx({
    dsp: { params: required },
    impression: { isBanner: true, width: 300, height: 250 },
  });
  await handler(ctx);
  const bannerExt = getPatch(ctx, 'imp.banner.ext');
  assert.equal(bannerExt.size_id, 15); // 300x250 = 15
});

test('sets banner size_id to 15 (default) for unknown size', async () => {
  const ctx = makeCtx({
    dsp: { params: required },
    impression: { isBanner: true, width: 999, height: 999 },
  });
  await handler(ctx);
  assert.equal(getPatch(ctx, 'imp.banner.ext').size_id, 15);
});

test('sets imp.secure = 1', async () => {
  const ctx = makeCtx({ dsp: { params: required } });
  await handler(ctx);
  assert.equal(getPatch(ctx, 'imp.secure'), 1);
});

test('limits badv to 19 items', async () => {
  const badv = Array.from({ length: 25 }, (_, i) => `domain${i}.com`);
  const ctx = makeCtx({
    dsp: { params: required },
    _raw: { imp: [{}], site: {}, badv },
  });
  await handler(ctx);
  assert.equal(getPatch(ctx, 'badv').length, 19);
});

test('does not limit badv if 19 or fewer', async () => {
  const badv = Array.from({ length: 10 }, (_, i) => `domain${i}.com`);
  const ctx = makeCtx({
    dsp: { params: required },
    _raw: { imp: [{}], badv },
  });
  await handler(ctx);
  assert.equal(getPatch(ctx, 'badv'), undefined);
});

test('sets GDPR on regs when present', async () => {
  const ctx = makeCtx({
    dsp: { params: required },
    privacy: { gdpr: 1, consent: 'CONSENT', usPrivacy: null },
  });
  await handler(ctx);
  assert.equal(getPatch(ctx, 'regs.gdpr'), 1);
  assert.equal(getPatch(ctx, 'user.consent'), 'CONSENT');
});

test('returns ctx on success', async () => {
  const ctx = makeCtx({ dsp: { params: required } });
  assert.equal(await handler(ctx), ctx);
});
