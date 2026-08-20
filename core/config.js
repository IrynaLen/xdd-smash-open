import { readJson, mergeConfig } from './utils.js';

// Load config with a two-level merge:
//   1. Built-in defaults — per-adapter/tool config.json (checked in, always present)
//   2. Global override   — root config.json, keyed by namespace
//
// Namespace path uses dot notation: 'adapters.magnite', 'geoedge'
//
// Root config.json structure:
// {
//   "adapters": {
//     "magnite":    { "params": { "accountId": "..." } },
//     "triplelift": { "params": { "inventoryCode": "..." } }
//   },
//   "geoedge": { "enabled": true, "key": "abc-uuid" }
// }
//
// Priority (last wins):
//   built-in config.json → root config.json[namespace] → ext.smash params (handled by each hook)
export function loadConfig(builtinPath, globalPath, namespace) {
  let config = readJson(builtinPath) ?? {};

  if (globalPath && namespace) {
    const global = readJson(globalPath);
    if (global) {
      const section = getByNamespace(global, namespace);
      if (section && typeof section === 'object') {
        config = mergeConfig(config, section);
      }
    }
  }

  return config;
}

function getByNamespace(obj, namespace) {
  return namespace.split('.').reduce((cur, key) => cur?.[key], obj) ?? null;
}

// Overlay per-request A/B overrides for `namespace` (set on ctx by the selector).
export function resolveConfig(ctx, cfg, namespace) {
  const overrides = ctx?.configOverrides?.[namespace];
  return overrides ? mergeConfig(cfg, overrides) : cfg;
}

// The A/B variant overriding `namespace` this request, or 'none' — for metric labels.
export function variantFor(ctx, namespace) {
  return ctx?.experimentByNs?.[namespace] ?? 'none';
}
