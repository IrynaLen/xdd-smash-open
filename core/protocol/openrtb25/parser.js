import { BidContext } from '../../BidContext.js';

export function parse(body, signal) {
  const device = body.device ?? {};
  const user = body.user ?? {};
  const site = body.site ?? {};
  const app = body.app ?? {};
  const regs = body.regs ?? {};

  const publisher = site.publisher ?? app.publisher ?? {};
  const geo = device.geo ?? {};
  const userExt = user.ext ?? {};
  const regsExt = regs.ext ?? {};

  return new BidContext({
    ssp: signal.ssp,
    dsp: signal.dsp,
    destination: signal.destination,
    signals: signal.signals,
    tmax: body.tmax ?? 0,
    raw: body,

    impressions: parseImpressions(body.imp ?? []),

    device: {
      country: geo.country ?? null,
      region: geo.region ?? null,
      city: geo.city ?? null,
      os: device.os ?? null,
      type: device.devicetype ?? null,
      make: device.make ?? null,
      model: device.model ?? null,
      ua: device.ua ?? null,
      ip: device.ip ?? null,
      ifa: device.ifa ?? null,
      lang: device.language ?? null,
      dnt: device.dnt ?? 0,
      lmt: device.lmt ?? 0,
      js: device.js ?? null,
      connectiontype: device.connectiontype ?? null,
    },

    user: {
      id: user.id ?? null,
      buyeruid: user.buyeruid ?? null,
      consent: userExt.consent ?? user.consent ?? null,
      eids: userExt.eids ?? [],
    },

    publisher: {
      id: publisher.id ?? null,
      domain: site.domain ?? app.domain ?? null,
      bundle: app.bundle ?? null,
      name: site.name ?? app.name ?? null,
      inventoryCode: null,
    },

    privacy: {
      gdpr: regs.gdpr ?? regsExt.gdpr ?? null,
      consent: userExt.consent ?? null,
      usPrivacy: regs.us_privacy ?? regsExt.us_privacy ?? null,
    },

    content: {
      cats: (site.cat ?? app.cat ?? []).slice(),
      pageCats: (site.pagecat ?? app.pagecat ?? []).slice(),
      sectionCats: (site.sectioncat ?? app.sectioncat ?? []).slice(),
      page: site.page ?? null,
      ref: site.ref ?? null,
      keywords: site.keywords ?? app.keywords ?? null,
    },
  });
}

function parseImpressions(imps) {
  return imps.map(imp => {
    const banner = imp.banner ?? null;
    const video = imp.video ?? null;
    const native = imp.native ?? null;
    const impExt = imp.ext ?? {};

    return {
      id: imp.id ?? null,
      floor: imp.bidfloor ?? 0,
      floorCur: imp.bidfloorcur ?? 'USD',
      secure: imp.secure ?? null,
      inventoryCode: imp.tagid ?? null,
      api: imp.api ?? null,

      isBanner: !!banner,
      isVideo: !!video,
      isNative: !!native,
      isRewarded: !!(imp.rwdd || impExt.reward || impExt.rewarded || impExt.prebid?.is_rewarded_inventory),
      instl: !!imp.instl,

      width: banner?.w ?? banner?.format?.[0]?.w ?? null,
      height: banner?.h ?? banner?.format?.[0]?.h ?? null,
      format: banner?.format ?? null,

      videoWidth: video?.w ?? null,
      videoHeight: video?.h ?? null,
      videoMinduration: video?.minduration ?? null,
      videoMaxduration: video?.maxduration ?? null,

      nativeVer: native?.ver ?? null,
      // JSON string holding the Native Request object (assets, plcmttype,
      // context). Kept raw here; BidContext exposes it parsed and memoised
      // behind nativeRequest/nativeAssets/... so it costs nothing per request
      // unless an adapter actually reads it.
      nativeRequestRaw: native?.request ?? null,

      gpid: imp.gpid ?? impExt.gpid ?? null,
      pbadslot: impExt?.data?.pbadslot ?? impExt?.pbadslot ?? null,
      displaymanager: imp.displaymanager ?? null,
      displaymanagerver: imp.displaymanagerver ?? null,
    };
  });
}
