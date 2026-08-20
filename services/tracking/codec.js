import { gzipSync, gunzipSync } from 'node:zlib';

// Context serialization (the layer under encryption).
//
// The token can carry the whole context object a feature hands us, so we gzip
// when it pays off. A 1-byte marker records the encoding so deserialize is
// unambiguous:  0 = raw JSON, 1 = gzip'd JSON.

export function serialize(context) {
  const json = Buffer.from(JSON.stringify(context));
  const gz = gzipSync(json);
  return gz.length < json.length
    ? Buffer.concat([Buffer.from([1]), gz])
    : Buffer.concat([Buffer.from([0]), json]);
}

export function deserialize(buf) {
  const marker = buf[0];
  const rest = buf.subarray(1);
  const json = marker === 1 ? gunzipSync(rest) : rest;
  return JSON.parse(json.toString());
}
