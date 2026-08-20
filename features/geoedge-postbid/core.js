import { wrapAdm } from './wrapper.js';

// Returns a ready-to-use postbid-ssp hook locked to a specific Geoedge key.
//
// Usage — drop one file per SSP to enable geoedge for that SSP only:
//
//   // features/injector/ssp/pubmatic/postbid-ssp.js
//   import { createGeoedgeHook } from '../../../geoedge-postbid/core.js';
//   export default createGeoedgeHook('995474fd-972f-4a8e-ab05-4b1de447fa2b');
//
// To enable globally (all SSPs), configure geoedge in root config.json.
export function createGeoedgeHook(key) {
  if (!key) throw new Error('createGeoedgeHook: key is required');

  return function geoedgeHook(ctx) {
    for (const res of ctx.responses) {
      if (res.creative?.isHtml) {
        res.creative.inject(adm => wrapAdm(adm, {
          key,
          dspId: ctx.dsp.id,
          sspId: ctx.ssp?.id ?? null,
          crid: res.crid,
          w: res.w,
          h: res.h,
        }));
      }
    }
    return ctx;
  };
}
