import hook from './prebid-dsp.js';

const LABEL = 'user-dedup/prebid-dsp';

export function register(registry) {
  registry.register('prebid-dsp', null, hook, LABEL);
  return { side: 'feature', bidder: 'user-dedup', stage: 'prebid-dsp', label: LABEL };
}
