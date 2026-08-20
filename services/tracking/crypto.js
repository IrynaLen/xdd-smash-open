import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';

// Authenticated symmetric encryption for the context blob.
//
// The same fleet seals (at injection) and opens (at callback), so a shared
// 32-byte key is the right tool — AES-256-GCM gives confidentiality + integrity
// in one primitive with ~29 bytes of overhead. Wire format:
//
//   keyid(1) ‖ nonce(12) ‖ ciphertext ‖ tag(16)   → base64url
//
// The keyid selects the key from the keyring (zero-downtime rotation: add a new
// key, flip activeKeyid, retire the old one later) and is bound as AAD so the
// selector cannot be swapped without failing the tag check.

export function seal(plaintext, keyid, key) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from([keyid]));
  const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([Buffer.from([keyid]), iv, ct, tag]).toString('base64url');
}

export function open(token, keyring) {
  const buf = Buffer.from(token, 'base64url');
  if (buf.length < 1 + 12 + 16) throw new Error('short token');

  const keyid = buf[0];
  const key = keyring[keyid];
  if (!key) throw new Error('unknown keyid');

  const iv = buf.subarray(1, 13);
  const tag = buf.subarray(buf.length - 16);
  const ct = buf.subarray(13, buf.length - 16);

  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAAD(Buffer.from([keyid]));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]); // throws on tamper/wrong key
}

// Parse a config keyring ({ "1": "<base64 32-byte key>" }) into { [id]: Buffer }.
// Keys that are not exactly 32 bytes are dropped.
export function parseKeyring(raw) {
  const keyring = {};
  for (const [id, b64] of Object.entries(raw ?? {})) {
    if (!b64) continue;
    const key = Buffer.from(b64, 'base64');
    if (key.length === 32) keyring[Number(id)] = key;
  }
  return keyring;
}
