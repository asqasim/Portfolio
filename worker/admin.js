/* /api/admin/*: login (admin key + authenticator code) and read-only analytics endpoints for admin.html. */
import { num, day, json, empty, SEC, sameOrigin, hashKey, geo, sha256hex, rid, b64url, timingSafeEq, secLog, consume, peek, clip } from './lib.js';
import { verifyTotp } from './totp.js';

const COOKIE = '__Host-asq_admin', SESSION_MS = 12 * 3600e3, WINDOW_MS = 15 * 60e3, MAX_FAILS_IP = 5, MAX_FAILS_ALL = 30;
const DAY = 864e5;

/* D1 wrapper that adds up "rows read", so the admin panel can never use up the free daily read allowance the chat also needs. */
class Q {
  constructor(db) { this.db = db; this.reads = 0 }
  p(sql, ...a) { return this.db.prepare(sql).bind(...a) }
  async all(sql, ...a) { const r = await this.p(sql, ...a).all(); this.reads += (r.meta && r.meta.rows_read) || 0; return r.results || [] }
  async first(sql, ...a) { return (await this.all(sql, ...a))[0] || null }
  async batch(stmts) { const rs = await this.db.batch(stmts); return rs.map(r => { this.reads += (r.meta && r.meta.rows_read) || 0; return r.results || [] }) }
}

const cookieOf = request => { const m = (request.headers.get('Cookie') || '').match(/(?:^|;\s*)__Host-asq_admin=([A-Za-z0-9_-]{20,80})/); return m ? m[1] : null };
const setCookie = (val, maxAge) => `${COOKIE}=${val}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;

async function session(request, env) {
  const t = cookieOf(request); if (!t) return null;
  const h = await sha256hex(t);
  return await env.DB.prepare('SELECT h, created, expires, country, city FROM admin_sessions WHERE h = ?1 AND expires > ?2').bind(h, Date.now()).first();
}

async function login(request, env) {
  let b; try { b = await request.json() } catch { return json({ error: 'bad_request' }, 400) }
  const key = typeof b.key === 'string' ? b.key.trim().slice(0, 200) : '', code = typeof b.code === 'string' ? b.code.replace(/\s/g, '') : '';
  const ipH = await hashKey(env, request.headers.get('CF-Connecting-IP')), since = Date.now() - WINDOW_MS;

  const [mine, all] = await Promise.all([
    env.DB.prepare("SELECT COUNT(*) n FROM security_log WHERE type = 'login_fail' AND ip = ?1 AND ts > ?2").bind(ipH, since).first(),
    env.DB.prepare("SELECT COUNT(*) n FROM security_log WHERE type = 'login_fail' AND ts > ?1").bind(since).first()
  ]);
  if (mine.n >= MAX_FAILS_IP || all.n >= MAX_FAILS_ALL) {
    await secLog(env, request, 'login_locked', mine.n >= MAX_FAILS_IP ? 'too many failures from this visitor' : 'too many failures overall', ipH);
    return json({ error: 'locked', message: 'Too many attempts. Try again in 15 minutes.' }, 429, { 'Retry-After': 900 });
  }

  const keyOk = timingSafeEq(await sha256hex(key), String(env.ADMIN_KEY_HASH).toLowerCase());
  const counter = await verifyTotp(env.TOTP_SECRET, code);
  const last = Number((await env.DB.prepare("SELECT v FROM kv WHERE k = 'totp_last'").first() || {}).v || 0);
  const codeOk = counter !== null && counter > last;                    // a code can only be used once
  if (!(keyOk && codeOk)) {
    await secLog(env, request, 'login_fail', `key:${keyOk ? 'ok' : 'bad'} code:${counter === null ? 'bad' : codeOk ? 'ok' : 'reused'}`, ipH, true);
    return json({ error: 'invalid', message: 'Invalid key or code.' }, 401);
  }
  const token = b64url(crypto.getRandomValues(new Uint8Array(32))), now = Date.now(), g = geo(request);
  await env.DB.batch([
    env.DB.prepare("INSERT INTO kv (k, v) VALUES ('totp_last', ?1) ON CONFLICT(k) DO UPDATE SET v = ?1").bind(String(counter)),
    env.DB.prepare('DELETE FROM admin_sessions WHERE expires < ?1').bind(now),
    env.DB.prepare('INSERT INTO admin_sessions (h, created, expires, ip, ua, country, city) VALUES (?1,?2,?3,?4,?5,?6,?7)')
      .bind(await sha256hex(token), now, now + SESSION_MS, ipH, clip(request.headers.get('User-Agent'), 160), g.country, g.city)
  ]);
  await secLog(env, request, 'login_ok', null, ipH, true);
  return json({ ok: true, expires: now + SESSION_MS }, 200, { 'Set-Cookie': setCookie(token, SESSION_MS / 1000) });
}

/* ---------- date range helper ---------- */
function range(q, env) {
  const ret = num(env.RETENTION_DAYS, 90), now = Date.now();
  const to = Math.min(Number(q.get('to')) || now, now + 1000);
  const from = Math.max(Number(q.get('from')) || (to - 7 * DAY), now - (ret + 1) * DAY);
  return [from, to];
}
const lim = (q, d, max) => Math.min(Math.max(parseInt(q.get('limit')) || d, 1), max);
const like = s => '%' + String(s).replace(/[%_\\]/g, m => '\\' + m).slice(0, 80) + '%';

/* ---------- endpoints ---------- */
async function summary(q, url, env) {
  const [f, t] = range(url.searchParams, env), off = Math.max(-840, Math.min(840, parseInt(url.searchParams.get('tz')) || 0));
  const S = 'started BETWEEN ?1 AND ?2', E = 'ts BETWEEN ?1 AND ?2', a = [f, t];
  const bucket = fmt => `strftime('${fmt}', started / 1000 + ${off * 60}, 'unixepoch')`;
  const grp = (col, extra = '') => q.p(`SELECT ${col} AS k, COUNT(*) visits, COUNT(DISTINCT vid) visitors FROM sessions WHERE ${S} ${extra} GROUP BY ${col} ORDER BY visits DESC LIMIT 15`, ...a);
  const ev = (type, cols, grpBy, order = 'n DESC', limit = 15, extra = '') =>
    q.p(`SELECT ${cols}, COUNT(*) n, COUNT(DISTINCT sid) sessions FROM events WHERE type ${type} AND ${E} ${extra} GROUP BY ${grpBy} ORDER BY ${order} LIMIT ${limit}`, ...a);
  const stmts = {
    totals: q.p(`SELECT COUNT(*) visits, COUNT(DISTINCT vid) visitors, COALESCE(SUM(pageviews),0) pageviews, COALESCE(SUM(clicks),0) clicks, COALESCE(SUM(ai_msgs),0) ai_msgs,
      COALESCE(SUM(ai_msgs > 0),0) ai_sessions, COALESCE(SUM(converted),0) converted, COALESCE(SUM(visit_no > 1),0) returning_sessions, AVG(active_ms) avg_active_ms,
      COALESCE(SUM(pageviews <= 1 AND clicks = 0),0) bounces, AVG(max_scroll) avg_scroll, AVG(pageviews) avg_pages FROM sessions WHERE ${S}`, ...a),
    new_visitors: q.p(`SELECT COUNT(DISTINCT vid) n FROM sessions WHERE ${S} AND visit_no = 1`, ...a),
    live: q.p('SELECT COUNT(*) n FROM sessions WHERE last_seen > ?1', Date.now() - 300000),
    daily: q.p(`SELECT ${bucket('%Y-%m-%d')} d, COUNT(*) visits, COUNT(DISTINCT vid) visitors, SUM(pageviews) pageviews, SUM(ai_msgs) ai FROM sessions WHERE ${S} GROUP BY d ORDER BY d`, ...a),
    hours: q.p(`SELECT CAST(${bucket('%H')} AS INTEGER) k, COUNT(*) visits FROM sessions WHERE ${S} GROUP BY k`, ...a),
    weekdays: q.p(`SELECT CAST(${bucket('%w')} AS INTEGER) k, COUNT(*) visits FROM sessions WHERE ${S} GROUP BY k`, ...a),
    countries: grp('country'),
    cities: q.p(`SELECT city k, country, region, COUNT(*) visits, COUNT(DISTINCT vid) visitors FROM sessions WHERE ${S} AND city IS NOT NULL GROUP BY city, country ORDER BY visits DESC LIMIT 20`, ...a),
    sources: q.p(`SELECT source k, COUNT(*) visits, COUNT(DISTINCT vid) visitors, SUM(pageviews) pageviews, SUM(ai_msgs) ai_msgs, SUM(converted) converted, AVG(active_ms) avg_active_ms,
      SUM(pageviews <= 1 AND clicks = 0) bounces FROM sessions WHERE ${S} GROUP BY source ORDER BY visits DESC LIMIT 30`, ...a),
    campaigns: q.p(`SELECT source, medium, campaign, COUNT(*) visits, COUNT(DISTINCT vid) visitors FROM sessions WHERE ${S} AND (campaign IS NOT NULL OR medium IS NOT NULL) GROUP BY source, medium, campaign ORDER BY visits DESC LIMIT 20`, ...a),
    referrers: grp('referrer', 'AND referrer IS NOT NULL'),
    landing: grp('landing'),
    devices: grp('device'), browsers: grp("browser || COALESCE(' ' || browser_v, '')"), os: grp("os || COALESCE(' ' || os_v, '')"),
    langs: grp('lang'), screens: grp('screen'), isps: grp('isp', 'AND isp IS NOT NULL'), tzs: grp('tz', 'AND tz IS NOT NULL'),
    funnel: q.p(`SELECT COUNT(*) visits,
      COALESCE(SUM(EXISTS(SELECT 1 FROM events e WHERE e.sid = s.sid AND e.type = 'section' AND e.label = 'projects')),0) saw_projects,
      COALESCE(SUM(EXISTS(SELECT 1 FROM events e WHERE e.sid = s.sid AND e.type = 'pageview' AND (e.path LIKE '/project?%' OR e.path LIKE '/project.html%'))),0) viewed_project,
      COALESCE(SUM(EXISTS(SELECT 1 FROM events e WHERE e.sid = s.sid AND e.type = 'ai_open') OR s.ai_msgs > 0),0) opened_ai,
      COALESCE(SUM(s.ai_msgs > 0),0) sent_ai, COALESCE(SUM(s.converted),0) converted FROM sessions s WHERE s.${S}`, ...a),
    pages: ev("= 'pageview'", 'path k', 'path', 'n DESC', 15),
    clicks: ev("= 'click'", 'label k, section', 'label, section', 'n DESC', 20),
    outbound: ev("= 'outbound'", 'target k', 'target'),
    downloads: ev("= 'download'", 'target k', 'target'),
    searches: ev("= 'search'", 'lower(label) k', 'lower(label)'),
    filters: ev("= 'filter'", "label || ' = ' || COALESCE(target,'') k", 'k'),
    sections: q.p(`SELECT label k, COUNT(DISTINCT sid) reach, AVG(value) avg_ms, SUM(value) total_ms FROM events WHERE type = 'section' AND ${E} GROUP BY label ORDER BY reach DESC`, ...a),
    perf: q.p(`SELECT path k, COUNT(*) n, AVG(value) lcp, AVG(json_extract(meta,'$.load')) load, AVG(json_extract(meta,'$.ttfb')) ttfb, AVG(json_extract(meta,'$.cls')) cls
      FROM events WHERE type = 'perf' AND ${E} GROUP BY path ORDER BY n DESC LIMIT 10`, ...a),
    errors: ev("= 'error'", 'label k, path', 'label, path', 'n DESC', 10),
    rage: ev("= 'rage_click'", 'label k, path', 'label, path', 'n DESC', 10),
    chats: q.p(`SELECT COUNT(*) total, COALESCE(SUM(status='ok'),0) ok, COALESCE(SUM(status='limited'),0) limited, COALESCE(SUM(status='busy'),0) busy,
      COALESCE(SUM(status='ai_error'),0) errors, COUNT(DISTINCT vid) askers, AVG(total_ms) avg_ms, AVG(a_chars) avg_chars FROM chats WHERE ${E}`, ...a),
    questions: q.p(`SELECT substr(lower(question),1,100) k, COUNT(*) n FROM chats WHERE ${E} GROUP BY k ORDER BY n DESC LIMIT 10`, ...a)
  };
  const names = Object.keys(stmts), res = await q.batch(Object.values(stmts)), out = { from: f, to: t };
  names.forEach((n, i) => { out[n] = ['totals', 'new_visitors', 'live', 'funnel', 'chats'].includes(n) ? res[i][0] : res[i] });
  return out;
}

async function sessions(q, sp, env) {
  const [f, t] = range(sp, env), w = ['started BETWEEN ?1 AND ?2'], a = [f, t], limit = lim(sp, 100, 200), offset = Math.max(parseInt(sp.get('offset')) || 0, 0);
  const text = sp.get('q'); if (text) { a.push(like(text)); const n = a.length; w.push(`(vid LIKE ?${n} ESCAPE '\\' OR sid LIKE ?${n} ESCAPE '\\' OR city LIKE ?${n} ESCAPE '\\' OR country LIKE ?${n} ESCAPE '\\' OR source LIKE ?${n} ESCAPE '\\' OR landing LIKE ?${n} ESCAPE '\\' OR campaign LIKE ?${n} ESCAPE '\\')`) }
  for (const k of ['country', 'source', 'device']) { const v = sp.get(k); if (v) { a.push(v); w.push(`${k} = ?${a.length}`) } }
  if (sp.get('converted') === '1') w.push('converted = 1');
  if (sp.get('ai') === '1') w.push('ai_msgs > 0');
  if (sp.get('returning') === '1') w.push('visit_no > 1');
  const where = w.join(' AND ');
  const [rows, tot] = await q.batch([
    q.p(`SELECT * FROM sessions WHERE ${where} ORDER BY started DESC LIMIT ${limit} OFFSET ${offset}`, ...a),
    q.p(`SELECT COUNT(*) n FROM sessions WHERE ${where}`, ...a)
  ]);
  return { rows, total: tot[0].n, limit, offset };
}

async function journey(q, sp) {
  const sid = sp.get('sid'), vid = sp.get('vid');
  if (!/^[a-f0-9]{16,32}$/.test(sid || vid || '')) return json({ error: 'bad_request' }, 400);
  const col = sid ? 'sid' : 'vid', val = sid || vid;
  const [sess, events, chats] = await q.batch([
    q.p(`SELECT * FROM sessions WHERE ${col} = ?1 ORDER BY started`, val),
    q.p(`SELECT id, ts, sid, type, path, label, target, section, value, meta FROM events WHERE ${col} = ?1 ORDER BY ts, id LIMIT 3000`, val),
    q.p(`SELECT id, ts, sid, turn, question, answer, status, model, ttfb_ms, total_ms, page FROM chats WHERE ${col} = ?1 ORDER BY ts, id LIMIT 300`, val)
  ]);
  return { sessions: sess, events, chats };
}

async function chatsList(q, sp, env) {
  const [f, t] = range(sp, env), a = [f, t], w = ['ts BETWEEN ?1 AND ?2'], limit = lim(sp, 40, 100), offset = Math.max(parseInt(sp.get('offset')) || 0, 0);
  const text = sp.get('q'); if (text) { a.push(like(text)); w.push(`(question LIKE ?${a.length} ESCAPE '\\' OR answer LIKE ?${a.length} ESCAPE '\\')`) }
  const st = sp.get('status'); if (st) { a.push(st); w.push(`status = ?${a.length}`) }
  const where = w.join(' AND ');
  const [rows, tot] = await q.batch([
    q.p(`SELECT * FROM chats WHERE ${where} ORDER BY ts DESC, id DESC LIMIT ${limit} OFFSET ${offset}`, ...a),
    q.p(`SELECT COUNT(*) n FROM chats WHERE ${where}`, ...a)
  ]);
  return { rows, total: tot[0].n, limit, offset };
}

async function logs(q, sp, env) {
  const [f, t] = range(sp, env), a = [f, t], w = ['e.ts BETWEEN ?1 AND ?2'], limit = lim(sp, 200, 300);
  const type = sp.get('type'); if (type) { a.push(type); w.push(`e.type = ?${a.length}`) }
  const text = sp.get('q'); if (text) { a.push(like(text)); const n = a.length; w.push(`(e.label LIKE ?${n} ESCAPE '\\' OR e.path LIKE ?${n} ESCAPE '\\' OR e.target LIKE ?${n} ESCAPE '\\')`) }
  const before = parseInt(sp.get('before')); if (before > 0) { a.push(before); w.push(`e.id < ?${a.length}`) }
  const rows = await q.all(`SELECT e.id, e.ts, e.sid, e.vid, e.type, e.path, e.label, e.target, e.section, e.value, e.meta, s.country, s.city, s.source, s.device
    FROM events e LEFT JOIN sessions s ON s.sid = e.sid WHERE ${w.join(' AND ')} ORDER BY e.id DESC LIMIT ${limit}`, ...a);
  return { rows, next: rows.length === limit ? rows[rows.length - 1].id : null };
}

async function security(q, sp, env) {
  const [f, t] = range(sp, env), a = [f, t], w = ['ts BETWEEN ?1 AND ?2'], limit = lim(sp, 200, 300);
  const type = sp.get('type'); if (type) { a.push(type); w.push(`type = ?${a.length}`) }
  const [rows, types, adm] = await q.batch([
    q.p(`SELECT * FROM security_log WHERE ${w.join(' AND ')} ORDER BY id DESC LIMIT ${limit}`, ...a),
    q.p('SELECT type k, COUNT(*) n FROM security_log WHERE ts BETWEEN ?1 AND ?2 GROUP BY type ORDER BY n DESC', f, t),
    q.p('SELECT created, expires, country, city, ua FROM admin_sessions WHERE expires > ?1 ORDER BY created DESC', Date.now())
  ]);
  return { rows, types, active_sessions: adm };
}

const EXPORTS = {
  sessions: { sql: 'SELECT rowid AS _id, * FROM sessions WHERE rowid > ?1 AND started BETWEEN ?2 AND ?3 ORDER BY rowid LIMIT ?4', id: '_id' },
  events: { sql: 'SELECT * FROM events WHERE id > ?1 AND ts BETWEEN ?2 AND ?3 ORDER BY id LIMIT ?4', id: 'id' },
  chats: { sql: 'SELECT * FROM chats WHERE id > ?1 AND ts BETWEEN ?2 AND ?3 ORDER BY id LIMIT ?4', id: 'id' },
  security: { sql: 'SELECT * FROM security_log WHERE id > ?1 AND ts BETWEEN ?2 AND ?3 ORDER BY id LIMIT ?4', id: 'id' }
};
async function exportRows(q, sp, env) {
  const x = EXPORTS[sp.get('table')]; if (!x) return json({ error: 'bad_request' }, 400);
  const [f, t] = range(sp, env), after = Math.max(parseInt(sp.get('after')) || 0, 0), limit = lim(sp, 1000, 2000);
  const rows = await q.all(x.sql, after, f, t, limit);
  return { rows, next: rows.length === limit ? rows[rows.length - 1][x.id] : null };
}

async function system(q, env) {
  const d = day(), n = t => q.p(`SELECT COUNT(*) n FROM ${t}`);
  const [c1, c2, c3, c4, c5, span] = await q.batch([n('sessions'), n('events'), n('chats'), n('security_log'), n('admin_sessions'),
    q.p('SELECT MIN(started) oldest, MAX(started) newest FROM sessions')]);
  const [chatsToday, eventsToday, reads] = await Promise.all([peek(env, d, 'GLOBAL'), peek(env, d, 'EVENTS'), peek(env, d, 'D1_READS')]);
  return { tables: { sessions: c1[0].n, events: c2[0].n, chats: c3[0].n, security_log: c4[0].n, admin_sessions: c5[0].n }, oldest: span[0].oldest, newest: span[0].newest,
    today: { chats: chatsToday, chat_cap: num(env.GLOBAL_DAILY_CAP, 150), est_neurons: chatsToday * 25, neuron_free: 10000, events: eventsToday, event_cap: num(env.GLOBAL_EVENT_CAP, 8000),
      d1_reads: reads, read_budget: num(env.ADMIN_READ_BUDGET, 3000000), d1_read_free: 5000000 },
    config: { daily_limit: num(env.DAILY_LIMIT, 10), retention_days: num(env.RETENTION_DAYS, 90), model: '@cf/meta/llama-3.1-8b-instruct-fp8' } };
}

async function purge(q, request, env) {
  let b; try { b = await request.json() } catch { return json({ error: 'bad_request' }, 400) }
  if (!/^[a-f0-9]{16,32}$/.test(b.vid || '')) return json({ error: 'bad_request', message: 'Enter a full visitor ID.' }, 400);
  const r = await env.DB.batch(['events', 'chats', 'sessions'].map(t => env.DB.prepare(`DELETE FROM ${t} WHERE vid = ?1`).bind(b.vid)));
  const counts = { events: r[0].meta.changes, chats: r[1].meta.changes, sessions: r[2].meta.changes };
  await secLog(env, request, 'admin_purge', `vid ${b.vid.slice(0, 8)}…: ${JSON.stringify(counts)}`, null, true);
  return { ok: true, deleted: counts };
}

/* ---------- router ---------- */
export async function handleAdmin(request, env, url) {
  const name = url.pathname.slice('/api/admin/'.length).replace(/\/$/, '');
  if (!env.ADMIN_KEY_HASH || !env.TOTP_SECRET) return json({ error: 'not_configured', message: 'Admin is not set up yet. Run tools/setup-secrets.mjs.' }, 503);
  if (!sameOrigin(request, url)) { await secLog(env, request, 'forbidden_origin', 'admin api'); return json({ error: 'forbidden' }, 403) }
  if (request.headers.get('X-Requested-With') !== 'asq-admin') return json({ error: 'forbidden' }, 403);

  if (name === 'login') return request.method === 'POST' ? login(request, env) : json({ error: 'method_not_allowed' }, 405, { Allow: 'POST' });

  const sess = await session(request, env);
  if (!sess) return json({ error: 'unauthorized' }, 401, { 'Set-Cookie': setCookie('', 0) });
  if (name === 'me') return json({ ok: true, expires: sess.expires, country: sess.country, city: sess.city });
  if (name === 'logout' && request.method === 'POST') {
    await env.DB.prepare('DELETE FROM admin_sessions WHERE h = ?1').bind(sess.h).run();
    await secLog(env, request, 'logout', null, null, true);
    return json({ ok: true }, 200, { 'Set-Cookie': setCookie('', 0) });
  }

  const q = new Q(env.DB), sp = url.searchParams, d = day();
  if ((await peek(env, d, 'D1_READS')) >= num(env.ADMIN_READ_BUDGET, 3000000))
    return json({ error: 'budget', message: 'Admin read budget for today is used up (this protects the free database allowance). Try again after 00:00 UTC.' }, 429);

  let out;
  try {
    if (request.method === 'POST' && name === 'purge') out = await purge(q, request, env);
    else if (request.method !== 'GET') return json({ error: 'method_not_allowed' }, 405);
    else switch (name) {
      case 'summary': out = await summary(q, url, env); break;
      case 'sessions': out = await sessions(q, sp, env); break;
      case 'journey': out = await journey(q, sp); break;
      case 'chats': out = await chatsList(q, sp, env); break;
      case 'logs': out = await logs(q, sp, env); break;
      case 'security': out = await security(q, sp, env); break;
      case 'export': out = await exportRows(q, sp, env); break;
      case 'system': out = await system(q, env); break;
      default: return json({ error: 'not_found' }, 404);
    }
  } finally {
    if (q.reads) await consume(env, d, 'D1_READS', 1e12, q.reads).catch(() => { });
  }
  return out instanceof Response ? out : json(out);
}
