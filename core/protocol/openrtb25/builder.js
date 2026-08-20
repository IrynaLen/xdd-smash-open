import { setPath } from '../../utils.js';

export function build(ctx) {
  const body = structuredClone(ctx._raw);

  applyPatches(body, ctx._patches);
  stripSignal(body);

  return {
    url: ctx._endpoint ?? ctx.destination.url,
    body,
    headers: ctx._headers,
  };
}

// imp.X patches broadcast to ALL imp entries.
// Any other path is applied to the root body object.
function applyPatches(body, patches) {
  for (const { path, value } of patches) {
    if (path.startsWith('imp.')) {
      const subPath = path.slice('imp.'.length);
      for (const imp of (body.imp ?? [])) {
        setPath(imp, subPath, value);
      }
    } else {
      setPath(body, path, value);
    }
  }
}

// Strip ext.smash before forwarding to DSP — it's our internal signal
function stripSignal(body) {
  for (const imp of (body.imp ?? [])) {
    if (imp.ext?.smash !== undefined) delete imp.ext.smash;
  }
  if (body.ext?.smash !== undefined) delete body.ext.smash;
}

