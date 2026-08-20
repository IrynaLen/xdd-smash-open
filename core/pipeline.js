import { detectCodec } from './protocol/detect.js';
import { readSignal } from './signal.js';
import { createClient } from './client.js';
import { recordRequest } from './metrics.js';
import { performance } from 'node:perf_hooks';

const _defaultClient = createClient();

let _overheadMs = 5;

export function configurePipeline({ overheadMs } = {}) {
  if (overheadMs != null) _overheadMs = overheadMs;
}

export async function pipeline(req, body, registry, client = _defaultClient) {
  const codec = detectCodec(req.headers['x-smash-protocol']);
  const signal = readSignal(body);
  const ctx = codec.parseRequest(body, signal);

  const start = performance.now();
  let result;

  try {
    result = await _run(ctx, codec, registry, client);
    return result;
  } catch (err) {
    ctx.meta.errors.push({ stage: 'pipeline', error: err.message });
    throw err;
  } finally {
    recordRequest(ctx, performance.now() - start, result?.seatbid?.length > 0);
  }
}

async function _run(ctx, codec, registry, client) {
  if (await runChain('prebid-ssp', ctx, registry) === null) return codec.buildNoResponse(ctx);
  if (await runChain('prebid-dsp', ctx, registry) === null) return codec.buildNoResponse(ctx);

  if (ctx.timeLeft(80) <= 0) {
    ctx.meta.blockedBy = 'tmax';
    return codec.buildNoResponse(ctx);
  }

  if (ctx._storedResponse) {
    ctx._rawDspResponse = ctx._storedResponse;
    if (!ctx.responses.length) {
      const bids = codec.parseResponse(ctx._storedResponse);
      if (!bids) return codec.buildNoResponse(ctx);
      ctx.responses = bids;
    }
  } else {
    const dspReq = codec.buildRequest(ctx);
    const dspStart = performance.now();
    const result = await client.request(dspReq, Math.max(0, ctx.meta.tmax - _overheadMs));

    ctx.meta.dsp.latency = performance.now() - dspStart;
    ctx.meta.dsp.status = result.status;
    ctx.meta.dsp.code = result.code ?? null;

    if (result.status !== 'ok') return codec.buildNoResponse(ctx);

    ctx._rawDspResponse = result.body;

    const bids = codec.parseResponse(result.body);
    if (!bids) return codec.buildNoResponse(ctx);
    ctx.responses = bids;
  }

  if (await runChain('postbid-dsp', ctx, registry) === null) return codec.buildNoResponse(ctx);
  if (await runChain('postbid-ssp', ctx, registry) === null) return codec.buildNoResponse(ctx);

  return codec.buildResponse(ctx) ?? codec.buildNoResponse(ctx);
}

async function runChain(stage, ctx, registry) {
  const entries = registry.resolveLabeled(stage, ctx);
  const trace = { stage, handlers: [] };
  ctx.meta.pipeline.push(trace);

  for (const { handler, label } of entries) {
    let result;
    try {
      result = await handler(ctx);
    } catch (err) {
      trace.handlers.push(label);
      ctx.meta.errors.push({ stage, handler: label, error: err.message });
      ctx.meta.blockedBy = stage;
      ctx.meta.blockLabel ??= label;
      return null;
    }

    trace.handlers.push(label);

    if (result === null) {
      ctx.meta.blockedBy = stage;
      ctx.meta.blockLabel ??= label;
      return null;
    }
  }

  return ctx;
}
