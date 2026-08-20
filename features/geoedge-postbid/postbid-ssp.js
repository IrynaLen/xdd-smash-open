import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../../core/config.js';
import { createGeoedgeHook } from './core.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dir, '../..');

const _baseCfg = loadConfig(
  resolve(__dir, 'config.json'),
  resolve(ROOT, 'config.json'),
  'geoedge',
);

export default function(ctx) {
  if (!_baseCfg.enabled || !_baseCfg.key) return ctx;

  return createGeoedgeHook(_baseCfg.key)(ctx);
}
