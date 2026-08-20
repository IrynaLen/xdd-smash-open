import { createRegistry } from './core/registry.js';
import { createServices } from './core/services.js';
import { createRouter } from './core/router.js';
import { createServer, registerCoreRoutes } from './core/server.js';
import { loadModules, mountServiceRoutes } from './core/modules.js';
import { printStartup } from './core/startup.js';
import { SUPPORTED_PROTOCOLS } from './core/protocol/detect.js';
import { loadConfig } from './core/config.js';
import { configurePipeline } from './core/pipeline.js';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));

const cfg = loadConfig(resolve(__dir, 'config.json'));
const port = parseInt(process.env.PORT ?? cfg.port ?? 3001, 10);

configurePipeline({ overheadMs: cfg.pipeline?.overheadMs });

const registry = createRegistry();
const services = createServices();
const router = createRouter();

const { features } = await loadModules({ registry, services, cfg });

registerCoreRoutes(router, registry, { metricsToken: cfg.metricsToken ?? null });
mountServiceRoutes(router, services);

printStartup(features, SUPPORTED_PROTOCOLS, port);

const server = createServer(router, { port });
await server.start();
