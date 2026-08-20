// Minimal ctx mock for adapter unit tests.
// Adapters only need: dsp.params, impression, device, privacy, publisher, content,
// _raw, set(), header(). We don't need BidContext's full constructor here.
export function makeCtx(overrides = {}) {
  const patches = [];
  const headers = {};

  return {
    dsp: { id: 333, knownBidder: 'test', endpointId: null, params: {}, ...overrides.dsp },
    ssp: { id: 100, knownBidder: null, params: {}, ...overrides.ssp },

    impression: {
      isBanner: true,
      isVideo: false,
      isNative: false,
      isRewarded: false,
      inventoryCode: null,
      floor: 0,
      width: 300,
      height: 250,
      videoMinduration: null,
      videoMaxduration: null,
      pbadslot: null,
      ...overrides.impression,
    },

    device: { os: null, ...overrides.device },
    publisher: { domain: null, ...overrides.publisher },
    privacy: { gdpr: null, consent: null, usPrivacy: null, ...overrides.privacy },
    content: { page: null, ref: null, ...overrides.content },
    _raw: { imp: [{}], ...overrides._raw },
    _patches: patches,
    _headers: headers,
    _endpoint: null,

    set(path, value) { patches.push({ path, value }); return this; },
    header(name, value) { headers[name] = value; return this; },
    endpoint(url) { this._endpoint = url; return this; },

    ...overrides.extra,
  };
}

// Find the last patch for a given path
export function getPatch(ctx, path) {
  const found = ctx._patches.filter(p => p.path === path);
  return found.length ? found[found.length - 1].value : undefined;
}
