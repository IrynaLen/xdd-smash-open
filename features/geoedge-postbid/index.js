import hook from './postbid-ssp.js';

const LABEL = 'tool/geoedge/postbid-ssp';

// Tools are non-blocking: null return → ctx, errors → logged, pipeline continues.
export function wrapToolHandler(handler, label = LABEL) {
  return async function toolWrapper(ctx) {
    try {
      const result = await handler(ctx);
      return result ?? ctx;
    } catch (err) {
      ctx.meta.errors.push({ stage: 'tool', handler: label, error: err.message });
      return ctx;
    }
  };
}

export function register(registry) {
  registry.register('postbid-ssp', null, wrapToolHandler(hook), LABEL);
  return { side: 'tool', bidder: 'geoedge', stage: 'postbid-ssp', label: LABEL };
}
