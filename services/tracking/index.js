import { seal, open, parseKeyring } from './crypto.js';
import { serialize, deserialize } from './codec.js';
import { injectDisplay } from './inject/display.js';
import { injectVideo } from './inject/video.js';
import { injectNative } from './inject/native.js';

// 1x1 transparent GIF, returned by the callback regardless of outcome.
const PIXEL = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');

function readText(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString()));
    req.on('error', reject);
  });
}

export function createTrackingService(cfg) {
  const keyring = parseKeyring(cfg.keyring);
  const activeKeyid = cfg.activeKeyid ?? 1;
  const activeKey = keyring[activeKeyid] ?? null;
  const enabled = !!cfg.enabled && !!cfg.endpointUrl && !!activeKey;

  const consumers = [];

  const pack = context => seal(serialize(context), activeKeyid, activeKey);
  const unpack = token => deserialize(open(token, keyring));

  // type ('display' | 'video' | 'native') is decided by the caller; token is
  // packed here so the queued transform stays a pure string (or, for native, a
  // pure object) op at serialize time.
  function inject(creative, type, context) {
    const token = pack(context);
    if (type === 'display') {
      creative.inject(adm => injectDisplay(adm, {
        token, endpointUrl: cfg.endpointUrl, cdnScriptUrl: cfg.cdnScriptUrl,
      }));
      return 'display';
    }
    if (type === 'video') {
      const url = `${cfg.endpointUrl}?c=${token}`;
      creative.inject(adm => injectVideo(adm, { url }));
      return 'video';
    }
    if (type === 'native') {
      const url = `${cfg.endpointUrl}?c=${token}`;
      creative.mutate(root => injectNative(root, { url }));
      return 'native';
    }
    return null;
  }

  const addConsumer = fn => consumers.push(fn);

  // POST carries the token in the body (no URL limit, used by the display
  // beacon); GET reads ?c (the VAST pixel and Image fallback). Only this server
  // holds the key. Any failure still returns the pixel and skips the fan-out.
  async function handleCallback(req, res) {
    try {
      const token = req.method === 'POST'
        ? await readText(req)
        : new URL(req.url, 'http://localhost').searchParams.get('c');
      if (token) {
        const context = unpack(token);
        for (const consumer of consumers) {
          try { consumer(context); } catch {}
        }
      }
    } catch {}
    res.writeHead(200, {
      'Content-Type': 'image/gif',
      'Content-Length': PIXEL.length,
      'Cache-Control': 'no-store',
    });
    res.end(PIXEL);
  }

  const routes = () => {
    if (!enabled) return [];
    const path = cfg.route ?? '/t';
    return [
      { method: 'GET', path, handler: handleCallback },
      { method: 'POST', path, handler: handleCallback },
    ];
  };

  return {
    name: 'tracking',
    enabled,
    endpointUrl: cfg.endpointUrl,
    cdnScriptUrl: cfg.cdnScriptUrl,
    pack, unpack, inject, addConsumer, handleCallback, routes,
  };
}

export function register(services, cfg) {
  return services.register('tracking', createTrackingService(cfg.tracking ?? {}));
}
