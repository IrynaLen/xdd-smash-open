import { readdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dir, '..');

async function loadDir(kind, invoke) {
  const dir = resolve(ROOT, kind);
  if (!existsSync(dir)) return [];

  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const path = resolve(dir, entry.name, 'index.js');
    if (!existsSync(path)) continue;

    const mod = await import(path);
    if (typeof mod.register !== 'function') continue;

    const res = await invoke(mod);
    if (Array.isArray(res)) out.push(...res);
    else if (res) out.push(res);
    console.log(`[modules] loaded ${kind.slice(0, -1)}: ${entry.name}`);
  }
  return out;
}

export async function loadModules({ registry, services, cfg }) {
  const svc = await loadDir('services', mod => mod.register(services, cfg));
  const feat = await loadDir('features', mod => mod.register(registry, services, cfg));
  return { services: svc, features: feat };
}

export function mountServiceRoutes(router, services) {
  for (const svc of services.all()) {
    for (const r of svc.routes?.() ?? []) router.add(r.method, r.path, r.handler);
  }
}
