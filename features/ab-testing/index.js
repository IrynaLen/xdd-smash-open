import { matchesTarget } from '../../core/registry.js';
import { defineCounter, defineHistogram, registry as metricsRegistry } from '../../core/metrics.js';

const LABEL = 'ab-testing/prebid-ssp';
const DEFAULT_LABELS = ['experiment', 'variant'];
const IMPRESSION = 'impression';

// Measurement points a metric may declare via `on`, mapped to their metric-name
// prefix. Pipeline stages get a registered hook; `impression` is the detached
// tracking event (a consumer). Any other `on` is rejected.
const STAGE_PREFIX = {
  'prebid-ssp': 'smash_ab_prebid_ssp',
  'prebid-dsp': 'smash_ab_prebid_dsp',
  'postbid-dsp': 'smash_ab_postbid_dsp',
  'postbid-ssp': 'smash_ab_postbid_ssp',
  [IMPRESSION]: 'smash_ab_impression',
};

const counter = (name, help, labels) =>
  metricsRegistry.getSingleMetric(name) ?? defineCounter(name, help, labels);
const histogram = (name, help, labels, buckets) =>
  metricsRegistry.getSingleMetric(name) ?? defineHistogram(name, help, labels, buckets);

// A recorder for one measurement point (`on`). It consumes flat context records
// (ctx.serialize output, or a decoded token) and emits config-driven metrics: a
// count plus each declared observe. Metric names are shared across experiments
// (union labelNames; each experiment fills only its own labels, `none` otherwise).
export function buildStageRecorder(stage, specs) {
  const prefix = STAGE_PREFIX[stage];
  if (!prefix) throw new Error(`Unknown A/B metric stage "${stage}"`);

  const tracked = new Map(); // expId -> { labelFields, observe }
  const labelSet = new Set(DEFAULT_LABELS);
  const observeSpecs = new Map(); // `field:as` -> { field, as, buckets }

  for (const s of specs) {
    const labelFields = s.labels ?? DEFAULT_LABELS;
    const observe = (s.observe ?? []).map(o => ({ ...o, as: o.as ?? 'sum' }));
    labelFields.forEach(l => labelSet.add(l));
    observe.forEach(o => observeSpecs.set(`${o.field}:${o.as}`, o));
    tracked.set(s.expId, { labelFields, observe });
  }

  const labelNames = [...labelSet];
  const count = counter(`${prefix}_total`, `${stage} count by label set`, labelNames);
  const emit = new Map();
  for (const [key, o] of observeSpecs) {
    if (o.as === 'histogram') {
      const h = histogram(`${prefix}_${o.field}`, `${stage} ${o.field} distribution`, labelNames, o.buckets);
      emit.set(key, (lv, v) => h.observe(lv, v));
    } else {
      const c = counter(`${prefix}_${o.field}_total`, `${stage} summed ${o.field}`, labelNames);
      emit.set(key, (lv, v) => c.inc(lv, v));
    }
  }

  return function record(rec) {
    for (const [expId, variant] of Object.entries(rec?.experiment ?? {})) {
      const cfg = tracked.get(expId);
      if (!cfg) continue;
      const lv = {};
      for (const l of labelNames) {
        lv[l] = l === 'experiment' ? expId
          : l === 'variant' ? variant
          : cfg.labelFields.includes(l) ? (rec[l] ?? 'none') : 'none';
      }
      count.inc(lv);
      for (const o of cfg.observe) emit.get(`${o.field}:${o.as}`)(lv, Number(rec[o.field]) || 0);
    }
  };
}

// Context fields a stage hook must serialize per bid to satisfy its metric specs.
function stageFields(specs) {
  const s = new Set(['experiment']);
  for (const sp of specs) {
    (sp.labels ?? DEFAULT_LABELS).forEach(l => { if (l !== 'variant') s.add(l); });
    (sp.observe ?? []).forEach(o => s.add(o.field));
  }
  return [...s];
}

function getPath(obj, path) {
  return path.split('.').reduce((cur, k) => cur?.[k], obj);
}

// Joins the parts of a composite bucketBy. Load-bearing: without it
// ('ab', 'c') and ('a', 'bc') would produce the same seed and silently share a
// bucket. \x1f (unit separator) is used because it cannot occur in an ifa, a
// user agent or an id.
const SEED_SEP = '\x1f';

// bucketBy is one dot-path ('device.ifa') or several (['device.ifa',
// 'device.ua']). Several are resolved in order and joined, so the bucket is
// stable for that combination of values.
//
// A part that does not resolve contributes an empty string rather than
// discarding the whole seed, so the remaining parts still decide the bucket:
// with ['device.ifa','device.ua'] a request with no ifa stays sticky per ua.
//
// The degenerate case is a request where NO part resolves — every one of those
// shares the seed made of separators alone, so they all land in one variant.
// Keep that in mind when picking paths: at least one should be near-universal.
function seedFor(ctx, bucketBy) {
  const paths = Array.isArray(bucketBy) ? bucketBy : [bucketBy ?? 'meta.requestId'];
  if (!paths.length) return ctx.meta.requestId;

  const parts = [];
  for (const path of paths) {
    const value = getPath(ctx, path);
    parts.push(value == null ? '' : String(value));
  }
  return parts.join(SEED_SEP);
}

// Cheap deterministic [0,1) from a string (FNV-1a + fmix32, no crypto).
function bucket(seed) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  }
  h ^= h >>> 16; h = Math.imul(h, 2246822507);
  h ^= h >>> 13; h = Math.imul(h, 3266489909);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function pickVariant(variants, r) {
  const total = variants.reduce((s, v) => s + (v.weight ?? 0), 0);
  if (total <= 0) return null;
  let acc = 0;
  const x = r * total;
  for (const v of variants) {
    acc += v.weight ?? 0;
    if (x < acc) return v;
  }
  return variants[variants.length - 1];
}

export function createSelectorHook(experiments) {
  return function abSelectorHook(ctx) {
    try {
      for (const exp of experiments) {
        if (exp.target && !matchesTarget(exp.target, ctx)) continue;

        const seedVal = seedFor(ctx, exp.bucketBy);
        const variant = pickVariant(exp.variants ?? [], bucket(`${seedVal}|${exp.salt ?? exp.id}`));
        if (!variant) continue;

        ctx.experiment[exp.id] = variant.name;
        for (const [ns, patch] of Object.entries(variant.config ?? {})) {
          ctx.configOverrides[ns] = { ...ctx.configOverrides[ns], ...patch };
          ctx.experimentByNs[ns] = variant.name;
        }
      }
    } catch (err) {
      ctx.meta.errors.push({ stage: 'ab-testing', error: err.message });
    }
    return ctx;
  };
}

// Group each experiment's `metrics` entries by measurement point (`on`).
function metricsByStage(experiments) {
  const byStage = new Map();
  for (const e of experiments) {
    for (const m of e.metrics ?? []) {
      if (!m.on) continue;
      if (!byStage.has(m.on)) byStage.set(m.on, []);
      byStage.get(m.on).push({ expId: e.id, labels: m.labels, observe: m.observe });
    }
  }
  return byStage;
}

export function register(registry, services, cfg) {
  const acfg = cfg.abTesting ?? {};
  const experiments = (acfg.experiments ?? []).filter(e => e.id && e.variants?.length);
  if (!(acfg.enabled && experiments.length)) {
    return { side: 'feature', bidder: 'ab-testing', stage: 'prebid-ssp', label: LABEL };
  }

  registry.register('prebid-ssp', null, createSelectorHook(experiments), LABEL);

  for (const [stage, specs] of metricsByStage(experiments)) {
    const record = buildStageRecorder(stage, specs);
    if (stage === IMPRESSION) {
      services?.get?.('tracking')?.addConsumer(record);
    } else {
      const fields = stageFields(specs);
      registry.register(stage, null, ctx => {
        for (const res of ctx.responses ?? []) record(ctx.serialize(res, fields));
        return ctx;
      }, `${LABEL}/${stage}`);
    }
  }

  return { side: 'feature', bidder: 'ab-testing', stage: 'prebid-ssp', label: LABEL };
}
