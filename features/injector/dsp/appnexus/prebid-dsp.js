export default function(ctx) {
  const placementId =
    ctx.dsp.params.placementId // ext.smash.dsp.params.placementId
    ?? ctx.impression.inventoryCode // imp.tagid
    ?? null;

  if (!placementId) return null;

  const memberId =
    ctx.dsp.params.memberId // ext.smash.dsp.params.memberId
    ?? null;

  ctx.set('imp.ext.appnexus', {
    placement_id: parseInt(placementId),
    ...(memberId ? { member: String(memberId) } : {}),
  });

  // AppNexus requires this to identify prebid server traffic
  ctx.set('ext', {
    appnexus: { hb_source: 5 },
  });

  // move schain from source.ext.schain → ext.schain (AppNexus reads it from root ext)
  const schain = ctx._raw?.source?.ext?.schain;
  if (schain) {
    ctx.set('ext.schain', schain);
    ctx.set('source.ext.schain', undefined);
  }

  ctx.set('imp.secure', 1);

  ctx.header('Accept', 'application/json');

  return ctx;
}
