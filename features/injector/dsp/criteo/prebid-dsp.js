export default function(ctx) {
  const pubId =
    ctx.dsp.params.pubId // ext.smash.dsp.params.pubId
    ?? null;

  const networkId =
    ctx.dsp.params.networkId // ext.smash.dsp.params.networkId
    ?? null;

  const zoneId =
    ctx.dsp.params.zoneId // ext.smash.dsp.params.zoneId
    ?? ctx.impression.inventoryCode // imp.tagid
    ?? null;

  if (pubId) {
    // set on both site and app — builder applies only the one present in raw body
    ctx.set('site.publisher.id', String(pubId));
    ctx.set('app.publisher.id', String(pubId));
    ctx.set('imp.ext.pubId', String(pubId));
    ctx.set('imp.ext.pubid', String(pubId));
  }

  ctx.set('imp.ext.bidder', {
    ...(zoneId ? { uid: String(zoneId) } : {}),
    ...(networkId ? { networkid: parseInt(networkId) } : {}),
  });

  if (zoneId) {
    ctx.set('imp.ext.zoneid', String(zoneId));
    ctx.set('imp.ext.zoneId', String(zoneId));
  }

  // normalize OS casing for Criteo
  if (ctx.device.os === 'android') ctx.set('device.os', 'Android');
  if (ctx.device.os === 'ios') ctx.set('device.os', 'iOS');

  // video fields Criteo requires
  if (ctx.impression.isVideo) {
    ctx.set('imp.video.minduration', ctx.impression.videoMinduration ?? 0);
    ctx.set('imp.video.maxduration', ctx.impression.videoMaxduration ?? 3600);
    if (ctx.impression.isRewarded) {
      ctx.set('imp.video.ext', { rewarded: 1 });
    }
  }

  return ctx;
}
