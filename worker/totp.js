/* TOTP (RFC 6238): the 6-digit codes from an authenticator app. */
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function b32decode(s) {
  const clean = String(s).toUpperCase().replace(/[^A-Z2-7]/g, ''); let bits = '', out = [];
  for (const c of clean) bits += B32.indexOf(c).toString(2).padStart(5, '0');
  for (let i = 0; i + 8 <= bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8), 2));
  return new Uint8Array(out);
}
export async function totp(secret, counter) {
  const key = await crypto.subtle.importKey('raw', b32decode(secret), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const msg = new Uint8Array(8); new DataView(msg.buffer).setUint32(4, counter >>> 0); new DataView(msg.buffer).setUint32(0, Math.floor(counter / 2 ** 32));
  const h = new Uint8Array(await crypto.subtle.sign('HMAC', key, msg)), o = h[19] & 15;
  const n = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 1_000_000).padStart(6, '0');
}
/* Returns the matching time-step counter (current ±1 step = ±30 s), or null. */
export async function verifyTotp(secret, code, now = Date.now()) {
  if (!/^\d{6}$/.test(String(code))) return null;
  const c0 = Math.floor(now / 30000); let hit = null;
  for (const d of [-1, 0, 1]) if ((await totp(secret, c0 + d)) === code) hit = c0 + d;      // no early exit: same work either way
  return hit;
}
