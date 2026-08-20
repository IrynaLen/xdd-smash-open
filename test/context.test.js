import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BidContext, DEFAULT_CONTEXT_FIELDS } from '../core/BidContext.js';

function makeCtx() {
  const c = new BidContext({
    dsp: { id: 'd1', endpointId: 'ep1' },
    ssp: { id: 's1' },
    device: { country: 'US', ifa: 'ifa1' },
  });
  c.experiment = { exp: 'A' };
  return c;
}

const RES = { id: 'b1', impid: '1', price: 1.5, crid: 'cr1', w: 300, h: 250 };

test('serialize() emits the default field set', () => {
  const out = makeCtx().serialize(RES);
  assert.deepEqual(Object.keys(out).sort(), [...DEFAULT_CONTEXT_FIELDS].sort());
  assert.equal(out.dsp, 'd1');
  assert.equal(out.price, 1.5);
  assert.equal(out.crid, 'cr1');
  assert.deepEqual(out.experiment, { exp: 'A' });
});

test('serialize() honours an explicit field list', () => {
  const out = makeCtx().serialize(RES, ['dsp', 'ssp', 'country', 'ifa', 'experiment']);
  assert.deepEqual(out, { dsp: 'd1', ssp: 's1', country: 'US', ifa: 'ifa1', experiment: { exp: 'A' } });
});

test('serialize() skips unknown fields', () => {
  assert.deepEqual(makeCtx().serialize(RES, ['dsp', 'nope']), { dsp: 'd1' });
});

test('res-derived fields read from the bid response', () => {
  const out = makeCtx().serialize({ id: 'x', price: 9, crid: 'y' }, ['bidId', 'price', 'crid']);
  assert.deepEqual(out, { bidId: 'x', price: 9, crid: 'y' });
});

test('endpoint fields map to the seat endpointId', () => {
  assert.deepEqual(makeCtx().serialize(RES, ['dspEndpoint']), { dspEndpoint: 'ep1' });
});
