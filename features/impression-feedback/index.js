import { matchesTarget } from '../../core/registry.js';
import { VideoCreative, NativeCreative } from '../../core/creative/index.js';

const LABEL = 'tool/impression-feedback/postbid-ssp';

function creativeType(creative) {
  if (creative.isHtml) return 'display';
  if (creative instanceof VideoCreative) return 'video';
  if (creative instanceof NativeCreative) return 'native';
  return null;
}

export function createImpFeedbackHook(cfg, tracking) {
  const types = cfg.creativeTypes ?? {};
  const targets = cfg.targets ?? [{}];
  const fields = cfg.contextFields; // undefined -> ctx.serialize default

  return function impFeedbackHook(ctx) {
    if (!targets.some(t => matchesTarget(t, ctx))) return ctx;

    for (const res of ctx.responses) {
      if (!res.creative || res._impfbDone) continue;
      const type = creativeType(res.creative);
      if (!type) continue;
      if (!types[type]) continue;

      tracking.inject(res.creative, type, ctx.serialize(res, fields));
      res._impfbDone = true;
    }
    return ctx;
  };
}

function wrapToolHandler(handler) {
  return async function toolWrapper(ctx) {
    try {
      return (await handler(ctx)) ?? ctx;
    } catch (err) {
      ctx.meta.errors.push({ stage: 'tool', handler: LABEL, error: err.message });
      return ctx;
    }
  };
}

export function register(registry, services, cfg) {
  const fcfg = cfg.impFeedback ?? {};
  const tracking = services.get('tracking');

  if (fcfg.enabled && tracking?.enabled) {
    registry.register('postbid-ssp', null, wrapToolHandler(createImpFeedbackHook(fcfg, tracking)), LABEL);
  }
  return { side: 'feature', bidder: 'impression-feedback', stage: 'postbid-ssp', label: LABEL };
}
