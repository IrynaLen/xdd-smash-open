import { createCodec as createOpenRtb25Codec } from './openrtb25/codec.js';

const SUPPORTED = {
  'openrtb/2.5': createOpenRtb25Codec,
};

// Codec instances are stateless — create once and reuse
const _cache = {};

export class ProtocolError extends Error {
  constructor(msg) {
    super(msg);
    this.name = 'ProtocolError';
    this.status = 400;
  }
}

export function detectCodec(protocol) {
  if (!protocol) throw new ProtocolError('Missing X-Smash-Protocol header');

  const factory = SUPPORTED[protocol];
  if (!factory) {
    throw new ProtocolError(
      `Unsupported protocol: "${protocol}". Supported: ${Object.keys(SUPPORTED).join(', ')}`
    );
  }

  return (_cache[protocol] ??= factory());
}

export const SUPPORTED_PROTOCOLS = Object.keys(SUPPORTED);
