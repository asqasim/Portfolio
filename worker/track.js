/* POST /api/track: receives small batches of visitor events from assets/js/track.js and stores them. */
import { num, day, clip, json, empty, sameOrigin, optedOut, geo, hashKey, consume } from './lib.js';
import { parseUA, classifySource } from './ua.js';

const TYPES = new Set(['pageview', 'click', 'outbound', 'download', 'section', 'search', 'filter', 'copy', 'form_start', 'form_submit', 'media', 'rage_click', 'error', 'perf', 'leave', 'ai_open']);
const ID = /^[a-f0-9]{16,32}$/;
const int = (v, lo, hi) => { v = Math.round(Number(v)); return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : null };
const path = v => { const s = clip(v, 200); return s && s.startsWith('/') ? s : null };

function cleanMeta(m) {                                              // flat object of short primitives only
  if (!m || typeof m !== 'object' || Array.isArray(m)) return null;
  const o = {}; let n = 0;
  for (const [k, v] of Object.entries(m)) {
    if (n++ >= 14 || k.length > 24) continue;
    if (typeof v === 'number' && Number.isFinite(v)) o[k] = v; else if (typeof v === 'boolean') o[k] = v ? 1 : 0; else if (typeof v === 'string') o[k] = v.slice(0, 120);
  }
  const s = JSON.stringify(o); return s === '{}' || s.length > 600 ? null : s;
}
function cleanEvent(e) {
  if (!e || typeof e !== 'object' || !TYPES.has(e.t)) return null;
  const meta = e.m && typeof e.m === 'object' ? e.m : null;
  return { t: e.t, ago: int(e.ago, 0, 3600000) || 0, p: path(e.p), l: clip(e.l, 120), tg: clip(e.tg, 200), s: clip(e.s, 40), v: int(e.v, -1e9, 1e9), meta: cleanMeta(meta), raw: meta };
}

export async function handleTrack(request, env, url) {
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, { Allow: 'POST' });
  if (!sameOrigin(request, url)) return json({ error: 'forbidden' }, 403);
  if (optedOut(request)) return empty();                              // Do Not Track / Global Privacy Control: store nothing
  const ua = parseUA(request.headers.get('User-Agent') || '');
  if (ua.bot) return empty();

  const raw = await request.text();
  if (raw.length > 32000) return json({ error: 'too_large' }, 413);
  let b; try { b = JSON.parse(raw) } catch { return json({ error: 'bad_request' }, 400) }
  if (!b || !ID.test(b.vid || '') || !ID.test(b.sid || '')) return json({ error: 'bad_request' }, 400);
  const events = (Array.isArray(b.events) ? b.events : []).slice(0, 30).map(cleanEvent).filter(Boolean);
  if (!events.length) return empty();

  const d = day(), ipH = await hashKey(env, request.headers.get('CF-Connecting-IP'));
  if ((await consume(env, d, 'ev:' + ipH, num(env.EVENT_DAILY_LIMIT, 1500), events.length)) === null) return empty(429);
  if ((await consume(env, d, 'EVENTS', num(env.GLOBAL_EVENT_CAP, 8000), events.length)) === null) return empty(429);

  const now = Date.now(), g = geo(request), c = b.ctx && typeof b.ctx === 'object' ? b.ctx : {};
  const src = classifySource({ ref: c.ref, utmSource: c.us, referrer: c.r }, ua, url.host);
  const pv = events.filter(e => e.t === 'pageview').length;
  const clicks = events.filter(e => e.t === 'click' || e.t === 'outbound' || e.t === 'download').length;
  const active = events.filter(e => e.t === 'leave').reduce((a, e) => a + Math.max(0, e.v || 0), 0);
  const scroll = Math.max(0, ...events.filter(e => e.t === 'leave').map(e => int(e.raw && e.raw.scroll, 0, 100) || 0));
  const conv = events.some(e => e.t === 'form_submit' || (e.raw && e.raw.cv === 1)) ? 1 : 0;

  const stmts = [env.DB.prepare(
    `INSERT INTO sessions (sid, vid, visit_no, started, last_seen, country, region, city, continent, tz, lat, lon, isp, asn, colo,
       device, browser, browser_v, os, os_v, in_app, screen, viewport, dpr, lang, langs, touch, scheme, theme, conn,
       landing, referrer, source, via, medium, campaign, pageviews, clicks, events, active_ms, max_scroll, converted)
     VALUES (?1, ?2, (SELECT COUNT(*) FROM sessions WHERE vid = ?2) + 1, ?3, ?3, ?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,
       ?14,?15,?16,?17,?18,?19,?20,?21,?22,?23,?24,?25,?26,?27,?28,
       ?29,?30,?31,?32,?33,?34, ?35,?36,?37,?38,?39,?40)
     ON CONFLICT(sid) DO UPDATE SET last_seen = ?3, pageviews = pageviews + ?35, clicks = clicks + ?36, events = events + ?37,
       active_ms = active_ms + ?38, max_scroll = MAX(max_scroll, ?39), converted = MAX(converted, ?40)`
  ).bind(b.sid, b.vid, now, g.country, g.region, g.city, g.continent, g.tz, g.lat, g.lon, g.isp, g.asn, g.colo,
    ua.device, ua.browser, ua.browser_v, ua.os, ua.os_v, ua.in_app, clip(c.sc, 20), clip(c.vp, 20), int(c.dpr * 100, 0, 1000) / 100 || null, clip(c.l, 20), clip(c.ls, 60), c.tch ? 1 : 0, clip(c.cs, 8), clip(c.th, 8), clip(c.cn, 24),
    path(c.u), src.referrer, src.source, src.via, clip(String(c.um || '').toLowerCase().replace(/[^a-z0-9._-]/g, ''), 40), clip(String(c.uc || '').toLowerCase().replace(/[^a-z0-9._ -]/g, ''), 60),
    pv, clicks, events.length, active, scroll, conv)];

  const ins = env.DB.prepare('INSERT INTO events (ts, sid, vid, type, path, label, target, section, value, meta) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)');
  for (const e of events) stmts.push(ins.bind(now - e.ago, b.sid, b.vid, e.t, e.p, e.l, e.tg, e.s, e.v, e.meta));
  try { await env.DB.batch(stmts) } catch (err) { console.error('track failed', err && err.message); return empty(500) }
  return empty();
}
