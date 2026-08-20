// TripeLift DSP adapter
// Docs: https://github.com/prebid/prebid-server/tree/master/adapters/triplelift
//
// Required ctx.impression.inventoryCode (imp.tagid from XE)
// Optional ctx.dsp.params.inventoryCode (fallback override)

export default function(ctx) {
  const inventoryCode =
    ctx.dsp.params.inventoryCode // ext.smash.dsp.params.inventoryCode
    ?? ctx.impression.inventoryCode // imp.tagid (set by XE)
    ?? null;

  if (!inventoryCode) return null;

  ctx.set('imp.tagid', String(inventoryCode));

  ctx.set('imp.ext.bidder', {
    inventoryCode: String(inventoryCode),
    floor: ctx.impression.floor ?? undefined,
  });

  ctx.set('imp.secure', 1);

  ctx.header('Accept', 'application/json');

  return ctx;
}
