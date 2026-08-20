import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig, resolveConfig, variantFor } from '../../core/config.js';
import { matchesTarget } from '../../core/registry.js';
import { getRedis } from './redis.js';
import { defineCounter } from '../../core/metrics.js';

// result labels:
//   allowed        — new IFA within TTL window, request passes
//   blocked        — duplicate IFA within TTL window, request dropped
//   skip_no_ifa    — no IFA in request (non-mobile or scraper), dedup skipped
//   skip_no_target — DSP/SSP not in configured targets, dedup skipped
//   skip_redis     — Redis unavailable, fail-open
//
// variant label: the A/B variant overriding userDedup (or 'none') — split the
// block rate by experiment group.
const dedupTotal = defineCounter(
  'smash_user_dedup_total',
  'User-dedup decisions by result',
  ['endpoint_id', 'ssp_id', 'result', 'variant'],
);

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dir, '../..');

const _cfg = loadConfig(
  resolve(__dir, 'config.json'),
  resolve(ROOT, 'config.json'),
  'userDedup',
);

const LABEL = 'user-dedup';

function labels(ctx, result) {
  return {
    endpoint_id: ctx.dsp.endpointId ?? ctx.dsp.id ?? 'unknown',
    ssp_id: ctx.ssp?.endpointId ?? ctx.ssp?.id ?? 'unknown',
    result,
    variant: variantFor(ctx, 'userDedup'),
  };
}

function warn(ctx, reason) {
  ctx.meta.warnings.push({ feature: LABEL, reason });
}

export async function _dedupWith(ctx, redis, ttlMs) {
  const key = `xdd-smash:dedup:${ctx.dsp.id}:${ctx.device.ifa}`;
  const set = await redis.set(key, '1', { NX: true, PX: ttlMs ?? 60_000 });
  if (set === null) {
    ctx.meta.blockReason = `user-dedup: duplicate IFA ${ctx.device.ifa} for DSP ${ctx.dsp.id}`;
    dedupTotal.inc(labels(ctx, 'blocked'));
    return null;
  }
  dedupTotal.inc(labels(ctx, 'allowed'));
  return ctx;
}

export default async function userDedupHook(ctx) {
  const cfg = resolveConfig(ctx, _cfg, 'userDedup');
  if (!cfg.enabled) return ctx;

  const ifa = ctx.device.ifa;
  if (!ifa) {
    dedupTotal.inc(labels(ctx, 'skip_no_ifa'));
    return ctx;
  }

  const targets = cfg.targets ?? [{}];
  if (!targets.some(t => matchesTarget(t, ctx))) {
    dedupTotal.inc(labels(ctx, 'skip_no_target'));
    return ctx;
  }

  try {
    const redis = await getRedis(cfg.redisUrl);
    if (!redis) {
      warn(ctx, 'redis not configured — fail-open');
      dedupTotal.inc(labels(ctx, 'skip_redis'));
      return ctx;
    }
    return await _dedupWith(ctx, redis, cfg.ttlMs);
  } catch {
    warn(ctx, 'redis error — fail-open');
    dedupTotal.inc(labels(ctx, 'skip_redis'));
    return ctx;
  }
}
