// 33Across DSP adapter — direct ORTB
// The same Placement ID is used for App ID, Tag ID, and Zone ID.
//
// Required params:
//   placementId — from ext.smash.dsp.params or deployment config

import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../../../../core/config.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dir, '../../../..');

const _cfg = loadConfig(
  resolve(__dir, 'config.json'),
  resolve(ROOT, 'config.json'),
  'adapters.33across',
);
const _staticParams = _cfg.params ?? {};

export default function(ctx) {
  const p = { ..._staticParams, ...ctx.dsp.params };

  const placementId = p.placementId ?? null;
  if (!placementId) return null;

  if (!ctx.impression.isBanner && !ctx.impression.isVideo) return null;

  // App ID — set on app or site object depending on inventory type
  if (ctx._raw?.app) {
    ctx.set('app.id', String(placementId));
  } else {
    ctx.set('site.id', String(placementId));
  }

  // Tag ID
  ctx.set('imp.tagid', String(placementId));

  // Zone ID
  ctx.set('imp.ext.ttx', { zoneId: String(placementId) });

  ctx.set('imp.secure', 1);
  ctx.header('Accept', 'application/json');

  return ctx;
}
