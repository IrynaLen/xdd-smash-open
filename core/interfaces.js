/**
 * INTERFACES
 *
 * Contracts between core components.
 * Runtime validators are used by features/adapter/validate.js to catch mistakes early.
 */

//
// A pipeline hook function. Implemented by every adapter and tool.
// Returns ctx to continue the chain, null to block (no bid).
//
// signature: (ctx: BidContext) => BidContext | null | Promise<BidContext | null>

export function assertHook(fn, label) {
  if (typeof fn !== 'function') {
    throw new InterfaceError(`${label}: must export a default function (Hook)`);
  }
}

//
// Handles one wire protocol on both sides.
//
// parseRequest  (body: object, signal: Signal) → BidContext
// buildRequest  (ctx: BidContext)              → DspRequest
// parseResponse (body: object)                 → BidResponse[] | null
// buildResponse (ctx: BidContext)              → object | null

export function assertCodec(codec, label) {
  for (const method of ['parseRequest', 'buildRequest', 'parseResponse', 'buildResponse']) {
    if (typeof codec[method] !== 'function') {
      throw new InterfaceError(`${label}: codec missing method "${method}"`);
    }
  }
}

//
// Returned by codec.buildRequest(). Passed directly to client.request().
//
// { url: string, body: object, headers: object }

export function assertDspRequest(req, label) {
  if (typeof req.url !== 'string' || !req.url) {
    throw new InterfaceError(`${label}: DspRequest.url must be a non-empty string`);
  }
  if (!req.body || typeof req.body !== 'object') {
    throw new InterfaceError(`${label}: DspRequest.body must be an object`);
  }
}

//
// Resolves the hook chain for a given stage + context.
// Returned hooks are ordered least-specific → most-specific.
//
// resolve(stage: string, ctx: BidContext) → Hook[]

export function assertRegistry(registry, label) {
  if (typeof registry?.resolve !== 'function') {
    throw new InterfaceError(`${label}: registry must implement resolve(stage, ctx)`);
  }
}

//
// Wraps DSP ad markup. Adapters call inject() to modify the creative.
// serialize() is called by buildResponse only when _dirty = true.
//
// inject(fn: (adm: string) => string): void
// serialize(): string | null
// _dirty: boolean

export function assertCreative(creative, label) {
  for (const method of ['inject', 'serialize']) {
    if (typeof creative[method] !== 'function') {
      throw new InterfaceError(`${label}: creative missing method "${method}"`);
    }
  }
}

//
// Returned by client.request(). Pipeline reads .status to decide next step.
//
// { status: 'ok',        body: object           }
// { status: 'no-bid'                            }
// { status: 'timeout'                           }
// { status: 'dsp-error', code: number           }
// { status: 'error',     message: string        }

export const CLIENT_STATUS = {
  OK: 'ok',
  NO_BID: 'no-bid',
  TIMEOUT: 'timeout',
  DSP_ERROR: 'dsp-error',
  ERROR: 'error',
};


export class InterfaceError extends Error {
  constructor(msg) {
    super(msg);
    this.name = 'InterfaceError';
  }
}
