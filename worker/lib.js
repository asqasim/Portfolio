/* Shared helpers for the Worker modules. */

export const num = (v, d) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : d);
export const day = () => new Date().toISOString().slice(0, 10);                       // UTC day
export const resetAt = () => { const d = new Date(); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1)).toISOString() };
export const clip = (v, n) => (v == null || v === '' ? null : String(v).slice(0, n));

export const SEC = {
  'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer',
  'cross-origin-resource-policy': 'same-origin', 'x-robots-tag': 'noindex'
};
export const json = (o, status = 200, h = {}) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...SEC, ...h } });
export const empty = (status = 204) => new Response(null, { status, headers: SEC });

/* ---------- visitor identity (never store raw IPs) ---------- */
/* IPv6 visitors usually own a whole /64, so the /64 counts as one visitor. */
export function ipKey(ip) {
  if (!ip) return 'unknown';
  if (!ip.includes(':')) return ip;
  if (/^::ffff:\d+\.\d+\.\d+\.\d+$/i.test(ip)) return ip.slice(7);
  const [head, tail] = ip.split('::');
  const h = head ? head.split(':') : [], t = tail ? tail.split(':') : [];
  const groups = tail === undefined ? h : [...h, ...Array(Math.max(0, 8 - h.length - t.length)).fill('0'), ...t];
  return groups.slice(0, 4).map(g => g.toLowerCase().padStart(4, '0')).join(':') + '::/64';
}
const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
export const sha256hex = async s => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
export const hashKey = async (env, ip) => (await sha256hex(`${env.IP_SALT || 'portfolio'}|${ipKey(ip)}`)).slice(0, 32);
export const rid = (bytes = 16) => hex(crypto.getRandomValues(new Uint8Array(bytes)));
export const b64url = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export function timingSafeEq(a, b) {
  const x = new TextEncoder().encode(String(a)), y = new TextEncoder().encode(String(b));
  if (x.length !== y.length) return false;
  if (crypto.subtle && crypto.subtle.timingSafeEqual) return crypto.subtle.timingSafeEqual(x, y);
  let d = 0; for (let i = 0; i < x.length; i++) d |= x[i] ^ y[i]; return d === 0;
}

/* ---------- request checks ---------- */
/* Browsers send Origin on POSTs; Sec-Fetch-Site covers beacons that omit it. Only our own pages may call the API. */
export function sameOrigin(request, url) {
  const o = request.headers.get('Origin');
  if (o) { try { return new URL(o).host === url.host } catch { return false } }
  return request.headers.get('Sec-Fetch-Site') === 'same-origin';
}
export const optedOut = request => request.headers.get('DNT') === '1' || request.headers.get('Sec-GPC') === '1';

/* Approximate location comes from Cloudflare (city level, from the IP address). The IP itself is not stored. */
export function geo(request) {
  const c = request.cf || {}, r2 = v => (v == null || v === '' || isNaN(parseFloat(v)) ? null : Math.round(parseFloat(v) * 100) / 100);
  return { country: clip(c.country, 2), region: clip(c.region, 60), city: clip(c.city, 60), continent: clip(c.continent, 2), tz: clip(c.timezone, 40),
    lat: r2(c.latitude), lon: r2(c.longitude), isp: clip(c.asOrganization, 80), asn: Number.isFinite(c.asn) ? c.asn : null, colo: clip(c.colo, 8) };
}

/* ---------- D1 counters ---------- */
export const consume = async (env, d, k, cap, inc = 1) => {
  const row = await env.DB.prepare(
    'INSERT INTO usage (day, k, n) VALUES (?1, ?2, ?4) ON CONFLICT(day, k) DO UPDATE SET n = n + ?4 WHERE n < ?3 RETURNING n'
  ).bind(d, k, cap, inc).first();
  return row ? row.n : null;                 // null = already at the cap
};
export const refund = (env, d, k, inc = 1) => env.DB.prepare('UPDATE usage SET n = MAX(n - ?3, 0) WHERE day = ?1 AND k = ?2').bind(d, k, inc).run();
export const peek = async (env, d, k) => { const r = await env.DB.prepare('SELECT n FROM usage WHERE day = ?1 AND k = ?2').bind(d, k).first(); return r ? r.n : 0 };

/* Security log (capped per visitor per day so an attacker can't fill the database). */
export async function secLog(env, request, type, detail, ipHash, force = false) {
  try {
    const ip = ipHash || await hashKey(env, request.headers.get('CF-Connecting-IP'));
    if (!force && (await consume(env, day(), 'sec:' + ip, 60)) === null) return;
    const g = geo(request);
    await env.DB.prepare('INSERT INTO security_log (ts, type, ip, country, city, asn, ua, path, detail) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)')
      .bind(Date.now(), type, ip, g.country, g.city, g.asn, clip(request.headers.get('User-Agent'), 160), clip(new URL(request.url).pathname, 100), clip(detail, 300)).run();
  } catch (e) { console.error('secLog failed', e && e.message) }
}
