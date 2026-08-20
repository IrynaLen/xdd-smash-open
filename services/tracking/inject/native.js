// Service-internal: the native injection shape used by tracking.inject().
// Operates on the parsed Native Ad Response object (see NativeCreative.mutate),
// not on a raw string, so the adm is parsed and re-serialized exactly once no
// matter how many injectors run.
//
// Native 1.1 carries impression pixels in `imptrackers`; 1.2 replaced them with
// the richer `eventtrackers` array but kept `imptrackers` for backwards compat.
// We write to exactly one of them, never both: a 1.2 renderer that honours the
// legacy field too would fire twice and double-count a single render.
// `jstracker` is left alone for the same reason.

const EVENT_IMPRESSION = 1;
const METHOD_IMG = 1; // the callback endpoint answers with a 1x1 GIF

// A response is treated as 1.2 when it already speaks 1.2 (an eventtrackers
// array is present, whatever its length) or declares ver >= 1.2. Anything else
// — ver 1.1, ver 1, ver absent — gets the legacy field, which every renderer
// understands.
function usesEventTrackers(root) {
  if (Array.isArray(root.eventtrackers)) return true;
  const ver = parseFloat(root.ver);
  return Number.isFinite(ver) && ver >= 1.2;
}

export function injectNative(root, { url }) {
  if (!root || typeof root !== 'object') return;

  if (usesEventTrackers(root)) {
    root.eventtrackers = root.eventtrackers ?? [];
    root.eventtrackers.push({ event: EVENT_IMPRESSION, method: METHOD_IMG, url });
    return;
  }

  root.imptrackers = root.imptrackers ?? [];
  root.imptrackers.push(url);
}
