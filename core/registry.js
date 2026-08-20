import { assertHook } from './interfaces.js';

const STAGES = ['prebid-ssp', 'prebid-dsp', 'postbid-dsp', 'postbid-ssp'];

export function createRegistry() {
  const index = new Map(STAGES.map(s => [s, []]));

  function register(stage, target, handler, label) {
    if (!STAGES.includes(stage)) {
      throw new Error(`Unknown stage "${stage}". Valid: ${STAGES.join(', ')}`);
    }
    assertHook(handler, label);
    index.get(stage).push({ handler, target, score: specificity(target), label });
  }

  // Returns handlers matching ctx, ordered least-specific → most-specific
  function resolve(stage, ctx) {
    const entries = index.get(stage);
    if (!entries?.length) return [];

    return entries
      .filter(e => matchesTarget(e.target, ctx))
      .sort((a, b) => a.score - b.score)
      .map(e => e.handler);
  }

  function resolveLabeled(stage, ctx) {
    const entries = index.get(stage);
    if (!entries?.length) return [];

    return entries
      .filter(e => matchesTarget(e.target, ctx))
      .sort((a, b) => a.score - b.score)
      .map(e => ({ handler: e.handler, label: e.label }));
  }

  return { register, resolve, resolveLabeled };
}

function specificity(target) {
  if (!target) return 0;

  // Two-sided format: { dsp: {...}, ssp: {...} }
  if ('dsp' in target || 'ssp' in target) {
    let score = 0;
    for (const side of [target.dsp, target.ssp]) {
      if (!side) continue;
      if (side.knownBidder) score += 1;
      if (side.seatId) score += 1;
      if (side.endpointId) score += 1;
    }
    return score;
  }

  // Legacy format: { _side, knownBidder, seatId, endpointId }
  let score = 0;
  if (target.knownBidder) score += 1;
  if (target.seatId) score += 1;
  if (target.endpointId) score += 1;
  return score;
}

export function matchesTarget(target, ctx) {
  if (!target) return true;

  // Two-sided format: { dsp: {...}, ssp: {...} }
  if ('dsp' in target || 'ssp' in target) {
    if (target.dsp !== undefined && !matchesSeat(target.dsp, ctx.dsp)) return false;
    if (target.ssp !== undefined && !matchesSeat(target.ssp, ctx.ssp)) return false;
    return true;
  }

  // Legacy format: { _side, knownBidder, seatId, endpointId }
  const seat = target._side === 'ssp' ? ctx.ssp : ctx.dsp;
  return matchesSeat(target, seat);
}

function matchesSeat(criteria, seat) {
  if (!seat) return false;
  if (criteria.knownBidder && seat.knownBidder !== criteria.knownBidder) return false;
  if (criteria.seatId && seat.id !== criteria.seatId) return false;
  if (criteria.endpointId && seat.endpointId !== criteria.endpointId) return false;
  return true;
}
