import { createClient } from 'redis';

let _client = null;

// Lazy connect, fail-open: if Redis is unavailable returns null so the hook skips dedup.
export async function getRedis(url) {
  if (!url) return null;
  if (_client) return _client;

  const client = createClient({ url });
  client.on('error', () => {}); // silence — caller handles null

  try {
    await client.connect();
    _client = client;
    return _client;
  } catch {
    return null;
  }
}
