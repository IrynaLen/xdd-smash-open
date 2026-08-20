import { createClient } from 'redis';

let _conn = null;

async function connect(url) {
  // reconnectStrategy: false — otherwise node-redis retries forever and
  // connect() never rejects, so a dead Redis hangs inside tmax instead of
  // failing open. createClient is inside the try: it throws synchronously on a
  // malformed url.
  const client = createClient({ url, socket: { reconnectStrategy: false, connectTimeout: 300 } });
  client.on('error', () => {});
  await client.connect();
  return client;
}

// Memoises the promise, not the client. Awaiting the client instead lets every
// concurrent caller past the null check, each opening a connection that is then
// orphaned — still connected, never used, never closed.
export function getRedis(url) {
  if (!url) return null;
  if (_conn) return _conn;

  try {
    _conn = connect(url).catch(() => { _conn = null; return null; });
  } catch {
    _conn = null;
    return null;
  }
  return _conn;
}

export function _reset() {
  _conn = null;
}
