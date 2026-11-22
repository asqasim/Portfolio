/* POST /api/contact: stores a contact-form message in your own database, then asks your Google Apps Script to email you about it. */
import { num, day, clip, json, sameOrigin, optedOut, geo, hashKey, consume, refund, sha256hex } from './lib.js';

const ID = /^[a-f0-9]{16,32}$/;
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
const clean = s => String(s ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();     // drops control characters, keeps line breaks

/* Sends one notification to the Apps Script web app. Never throws. */
export async function notifyWebhook(env, payload) {
  if (!env.CONTACT_WEBHOOK_URL || !env.CONTACT_WEBHOOK_SECRET) return { ok: false, error: 'email notifications not set up' };
  try {
    const r = await fetch(env.CONTACT_WEBHOOK_URL, { method: 'POST', headers: { 'content-type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ ...payload, secret: env.CONTACT_WEBHOOK_SECRET }), redirect: 'follow', signal: AbortSignal.timeout(10000) });
    const text = (await r.text()).trim();
    if (text === 'ok') return { ok: true };
    return { ok: false, error: `${r.status}: ${text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 110) || 'empty reply'}` };
  } catch (e) { return { ok: false, error: String((e && e.message) || e).slice(0, 120) } }
}

export async function sendNotification(env, row) {
  const res = await notifyWebhook(env, { id: row.id, name: row.name, email: row.email, message: row.message, page: row.page, country: row.country, city: row.city, time: new Date(row.ts).toISOString() });
  try { await env.DB.prepare('UPDATE messages SET notified = ?2, notify_error = ?3 WHERE id = ?1').bind(row.id, res.ok ? 1 : 0, res.ok ? null : clip(res.error, 160)).run() } catch (e) { console.error('notify update failed', e && e.message) }
  return res;
}

export async function handleContact(request, env, ctx, url) {
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, { Allow: 'POST' });
  if (!sameOrigin(request, url)) return json({ error: 'forbidden' }, 403);
  if (!(request.headers.get('content-type') || '').toLowerCase().startsWith('application/json')) return json({ error: 'unsupported_media_type' }, 415);
  const raw = await request.text();
  if (raw.length > 12000) return json({ error: 'too_large', message: 'That message is too long.' }, 413);
  let b; try { b = JSON.parse(raw) } catch { return json({ error: 'bad_request' }, 400) }
  if (!b || typeof b !== 'object') return json({ error: 'bad_request' }, 400);

  const name = clip(clean(b.name), 80), email = clip(clean(b.email).toLowerCase(), 254), message = clip(clean(b.message), 2000);
  if (!name || !email || !message) return json({ error: 'invalid', message: 'Please fill in every field.' }, 400);
  if (!EMAIL.test(email)) return json({ error: 'invalid', message: 'That email address doesn’t look right.' }, 400);
  if (message.length < 5) return json({ error: 'invalid', message: 'Your message is a bit short.' }, 400);
  if (clean(b.website) || !(Number(b.t) >= 2500)) return json({ ok: true });       // honeypot filled or form "filled" in under 2.5 s: a bot. Pretend it worked, store nothing.

  const d = day(), ipH = await hashKey(env, request.headers.get('CF-Connecting-IP'));
  const tooMany = { error: 'rate_limited', message: 'You’ve sent a few messages already today. Please email me directly instead.' };
  if ((await consume(env, d, 'ct:' + ipH, num(env.CONTACT_DAILY_LIMIT, 3))) === null) return json(tooMany, 429);
  if ((await consume(env, d, 'CONTACT', num(env.CONTACT_GLOBAL_CAP, 30))) === null) { await refund(env, d, 'ct:' + ipH); return json(tooMany, 429) }

  const fp = (await sha256hex(email + '|' + message)).slice(0, 24);
  const dupe = await env.DB.prepare('SELECT id FROM messages WHERE fp = ?1 AND ts > ?2').bind(fp, Date.now() - 600000).first();
  if (dupe) return json({ ok: true });                                              // double click / resubmit

  const c = b.ctx && typeof b.ctx === 'object' ? b.ctx : {}, private_ = optedOut(request) || c.ignore === true, g = private_ ? {} : geo(request);
  const row = { ts: Date.now(), name, email, message, vid: !private_ && ID.test(c.vid || '') ? c.vid : null, sid: !private_ && ID.test(c.sid || '') ? c.sid : null,
    country: g.country || null, city: g.city || null, page: clip(c.page, 120) };
  let id;
  try {
    const r = await env.DB.prepare('INSERT INTO messages (ts, name, email, message, vid, sid, country, city, page, fp) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)')
      .bind(row.ts, row.name, row.email, row.message, row.vid, row.sid, row.country, row.city, row.page, fp).run();
    id = r.meta.last_row_id;
  } catch (e) { console.error('message insert failed', e && e.message); await refund(env, d, 'ct:' + ipH); return json({ error: 'server_error', message: 'Couldn’t send that. Please email me directly instead.' }, 500) }
  ctx.waitUntil(sendNotification(env, { ...row, id }));
  return json({ ok: true });
}
