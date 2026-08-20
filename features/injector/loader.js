import { readdirSync, statSync } from 'node:fs';
import { resolve, join, basename, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { wrapHandler } from './validate.js';

const __dir = dirname(fileURLToPath(import.meta.url));

const STAGES = ['prebid-ssp', 'prebid-dsp', 'postbid-dsp', 'postbid-ssp'];

// Scan features/injector/dsp/ and ssp/.
// Returns entries: { side, bidder, stage, label, error? }
export async function loadAdapters(registry) {
  const entries = [];

  for (const side of ['dsp', 'ssp']) {
    await scanBidderDir(resolve(__dir, side), side, registry, entries);
  }

  return entries;
}

async function scanBidderDir(sideDir, side, registry, entries) {
  let bidders;
  try {
    bidders = readdirSync(sideDir);
  } catch {
    return;
  }

  for (const bidderName of bidders) {
    const bidderDir = join(sideDir, bidderName);
    if (!statSync(bidderDir).isDirectory()) continue;

    let files;
    try {
      files = readdirSync(bidderDir).filter(f => f.endsWith('.js'));
    } catch {
      continue;
    }

    for (const filename of files) {
      const parsed = parseBidderFilename(filename, bidderName, side);
      if (!parsed) continue;

      const label = `${side}/${bidderName}/${filename}`;
      const entry = { side, bidder: bidderName, stage: parsed.stage, label };

      await registerHook(join(bidderDir, filename), label, parsed.stage, parsed.target, registry, entry);
      entries.push(entry);
    }
  }
}

async function registerHook(filePath, label, stage, target, registry, entry) {
  let handler;
  try {
    const mod = await import(pathToFileURL(filePath).href);
    handler = mod.default;
  } catch (err) {
    entry.error = err.message;
    return;
  }

  try {
    registry.register(stage, target, wrapHandler(handler, label), label);
  } catch (err) {
    entry.error = err.message;
  }
}

// Parse DSP/SSP adapter filename → { stage, target } or null.
//
//   prebid-dsp.js              → stage=prebid-dsp,  target={ knownBidder, _side }
//   seat-333.prebid-dsp.js     → same + seatId='333'
//   ep-abc.postbid-dsp.js      → same + endpointId='abc'
//
// Directory named '_' means any bidder — knownBidder is not set in target.
// Useful for seat- or ep- adapters that apply across all DSPs/SSPs.
function parseBidderFilename(filename, knownBidder, side) {
  const stage = parseStageFromFilename(filename);
  if (!stage) return null;

  const base = basename(filename, '.js');
  const parts = base.split('.');
  const target = { _side: side };

  if (knownBidder !== '_') target.knownBidder = knownBidder;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (part.startsWith('seat-')) target.seatId = part.slice('seat-'.length);
    else if (part.startsWith('ep-')) target.endpointId = part.slice('ep-'.length);
  }

  return { stage, target };
}

// Extract stage name from filename: 'prebid-dsp.js' → 'prebid-dsp', or null.
function parseStageFromFilename(filename) {
  const base = basename(filename, '.js');
  const parts = base.split('.');
  const stagePart = parts[parts.length - 1];
  return STAGES.includes(stagePart) ? stagePart : null;
}
