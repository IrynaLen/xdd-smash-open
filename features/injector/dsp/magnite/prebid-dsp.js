// Magnite (Rubicon) DSP adapter
// Auth: Basic Auth header.
// Priority: ext.smash.dsp.params → deployment config → built-in config.json → null (no bid)
//
// Required params:
//   accountId, zoneId
// Optional:
//   siteId, username, password

import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../../../../core/config.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dir, '../../../..');

const _cfg = loadConfig(
  resolve(__dir, 'config.json'),
  resolve(ROOT, 'config.json'),
  'adapters.magnite',
);
const _staticParams = _cfg.params ?? {};

const BANNER_SIZE_MAP = {
  '468x60': 1, '728x90': 2, '120x600': 8, '160x600': 9,
  '300x600': 10, '300x250': 15, '336x280': 16, '180x150': 18,
  '930x180': 38, '320x50': 43, '300x50': 44, '300x1050': 54,
  '970x90': 55, '970x250': 57, '1000x90': 58, '1000x1000': 61,
  '320x480': 67, '1800x1000': 68, '980x240': 78,
};

export default function(ctx) {
  const p = { ..._staticParams, ...ctx.dsp.params };

  const accountId = p.accountId ?? null;
  const siteId = p.siteId ?? null;
  const zoneId = p.zoneId ?? null;
  const username = p.username ?? null;
  const password = p.password ?? null;

  if (!accountId || !zoneId) return null;

  if (username && password) {
    const credentials = Buffer.from(`${username}:${password}`).toString('base64');
    ctx.header('Authorization', `Basic ${credentials}`);
  }

  ctx.header('Accept', 'application/json');
  ctx.set('imp.secure', 1);

  const ptype = ctx._raw?.app ? 'app' : 'site';
  ctx.set(`${ptype}.ext.rp`, { site_id: siteId ? parseInt(siteId) : undefined });
  ctx.set(`${ptype}.publisher.ext.rp`, { account_id: parseInt(accountId) });

  ctx.set('imp.ext.rp', {
    zone_id: parseInt(zoneId),
    target: buildImpTarget(ctx),
    track: { mint: '', mint_version: '' },
  });

  if (ctx.impression.isBanner) {
    const key = `${ctx.impression.width}x${ctx.impression.height}`;
    const sizeId = BANNER_SIZE_MAP[key] ?? 15;
    ctx.set('imp.banner.ext', {
      rp: { mime: 'text/html' },
      size_id: sizeId,
    });
  }

  if (ctx.impression.isVideo) {
    const placement = ctx._raw?.imp?.[0]?.video?.placement;
    let sizeId = 202;
    if (placement === 1) sizeId = 201;
    if (placement === 3) sizeId = 203;

    ctx.set('imp.video.minduration', ctx.impression.videoMinduration ?? 0);
    ctx.set('imp.video.maxduration', ctx.impression.videoMaxduration ?? 999);
    ctx.set('imp.video.ext', {
      rp: { size_id: sizeId },
      ...(ctx.impression.isRewarded ? { videotype: 'rewarded' } : {}),
    });
  }

  if (ctx.privacy.gdpr !== null) {
    ctx.set('regs.gdpr', ctx.privacy.gdpr);
    ctx.set('regs.ext.gdpr', undefined);
  }
  if (ctx.privacy.usPrivacy) {
    ctx.set('regs.us_privacy', ctx.privacy.usPrivacy);
    ctx.set('regs.ext.us_privacy', undefined);
  }
  if (ctx.privacy.consent) {
    ctx.set('user.consent', ctx.privacy.consent);
    ctx.set('user.ext.consent', undefined);
  }

  if (ptype === 'site' && !ctx.content.page && ctx.publisher.domain) {
    ctx.set('site.page', `https://${ctx.publisher.domain}`);
  }

  const raw = ctx._raw;
  if (Array.isArray(raw.badv) && raw.badv.length > 19) ctx.set('badv', raw.badv.slice(0, 19));
  if (Array.isArray(raw.bcat) && raw.bcat.length > 19) ctx.set('bcat', raw.bcat.slice(0, 19));
  if (Array.isArray(raw.cat) && raw.cat.length > 19) ctx.set('cat', raw.cat.slice(0, 19));

  return ctx;
}

function buildImpTarget(ctx) {
  const target = {};
  const raw = ctx._raw;
  const source = raw?.app ?? raw?.site ?? {};

  if (source.sectioncat?.length) target.sectioncat = source.sectioncat;
  if (source.pagecat?.length) target.pagecat = source.pagecat;
  if (ctx.content.page) target.page = ctx.content.page;
  if (ctx.content.ref) target.ref = ctx.content.ref;
  if (ctx.impression.pbadslot) target.pbadslot = ctx.impression.pbadslot;

  return target;
}
