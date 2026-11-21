/* Portfolio backend (Cloudflare Worker, free plan).
   /api/chat    AI assistant, 10 messages per visitor per day (chat.js)
   /api/quota   messages left today (chat.js)
   /api/track   visitor analytics events (track.js)
   /api/admin/* private analytics panel API (admin.js)
   everything else is the static site, served by Cloudflare's asset layer. */
import { json, num, secLog } from './lib.js';
import { chat, quota } from './chat.js';
import { handleTrack } from './track.js';
import { handleAdmin } from './admin.js';

export { ipKey } from './lib.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    try {
      switch (url.pathname) {
        case '/api/chat': return request.method === 'POST' ? await chat(request, env, ctx, url) : json({ error: 'method_not_allowed' }, 405, { Allow: 'POST' });
        case '/api/quota': return request.method === 'GET' ? await quota(request, env) : json({ error: 'method_not_allowed' }, 405, { Allow: 'GET' });
        case '/api/track': return await handleTrack(request, env, url);
      }
      if (url.pathname.startsWith('/api/admin/')) return await handleAdmin(request, env, url);
      if (url.pathname.startsWith('/api/')) return json({ error: 'not_found' }, 404);
      return env.ASSETS.fetch(request);
    } catch (err) {
      console.error(err && err.stack || err);
      return json({ error: 'server_error', message: 'Something went wrong. Please try again.' }, 500);
    }
  },

  /* Runs once a day (see "triggers" in wrangler.jsonc): deletes data older than RETENTION_DAYS and tidies counters. */
  async scheduled(event, env, ctx) {
    const days = num(env.RETENTION_DAYS, 90), cut = Date.now() - days * 864e5;
    const old = new Date(Date.now() - 3 * 864e5).toISOString().slice(0, 10);
    ctx.waitUntil(env.DB.batch([
      env.DB.prepare('DELETE FROM events WHERE ts < ?1').bind(cut),
      env.DB.prepare('DELETE FROM chats WHERE ts < ?1').bind(cut),
      env.DB.prepare('DELETE FROM sessions WHERE last_seen < ?1').bind(cut),
      env.DB.prepare('DELETE FROM security_log WHERE ts < ?1').bind(cut),
      env.DB.prepare('DELETE FROM admin_sessions WHERE expires < ?1').bind(Date.now()),
      env.DB.prepare('DELETE FROM usage WHERE day < ?1').bind(old)
    ]).catch(e => console.error('retention job failed', e && e.message)));
  }
};
