/* ASQ Ai: the full-page chat (ai.html). The old pop-up is gone; every "ASQ Ai" button on the site links here.
   Answers come from the Cloudflare Worker (worker/chat.js) via POST /api/chat. The reply stream starts with one event
   {ui, step, chips} (which cards to show), followed by the AI's text. Cards are drawn from the real JSON in assets/data/,
   never from model text, so they are always correct.
   If the Worker can't be reached (plain files, no backend) it falls back to cards only, using the same routing (ai-core.js).
   Shared logic lives in ai-core.js. Needs assets/css/base.css + chat.css. */
import { normalizeData, buildVisitor, emptyVisitor, hasActivity, route, suggest, visitTags, firstName, slug } from './ai-core.js';

(function () {
  'use strict';
  const ROOT = '';
  const root = document.getElementById('aiRoot');
  if (!root) return;
  const KEY = 'asq-ai-chat', PKEY = 'asq_ai_personalize';
  const API = ROOT + 'api/';

  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const svg = (p, w = 16) => `<svg width="${w}" height="${w}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
  const IC = {
    copy: svg('<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>', 15),
    check: svg('<path d="M20 6 9 17l-5-5"/>', 15), check12: svg('<path d="M20 6 9 17l-5-5"/>', 12),
    up: svg('<path d="M7 10v12"/><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z"/>', 15),
    down: svg('<path d="M17 14V2"/><path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z"/>', 15),
    redo: svg('<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>', 15),
    out: svg('<path d="M7 7h10v10"/><path d="M7 17 17 7"/>', 14),
    arrow: svg('<path d="m5 12 7-7 7 7M12 19V5"/>', 18), stop: svg('<rect x="6" y="6" width="12" height="12" rx="2.5" fill="currentColor"/>', 16),
    plus: svg('<path d="M12 5v14M5 12h14"/>', 18), back: svg('<path d="m12 19-7-7 7-7M19 12H5"/>', 16),
    sun: svg('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>', 18),
    moon: svg('<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>', 18),
    grid: svg('<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>'),
    tool: svg('<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>'),
    award: svg('<circle cx="12" cy="8" r="6"/><path d="M15.48 12.89 17 22l-5-3-5 3 1.52-9.11"/>'),
    mail: svg('<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>'),
    search: svg('<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>'),
    file: svg('<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>', 20),
    pin: svg('<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>', 13),
    down16: svg('<path d="M12 5v14m7-7-7 7-7-7"/>', 16)
  };
  const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const sleep = ms => new Promise(r => setTimeout(r, reduce() ? 0 : ms));
  const hash = s => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h };

  /* ---------- data (JSON from assets/data/, loaded once) ---------- */
  const get = f => fetch(ROOT + 'assets/data/' + f).then(r => r.ok ? r.json() : Promise.reject(r.status)).catch(() => null);
  let D = normalizeData({}), dataP = null;
  const load = () => dataP || (dataP = Promise.all([get('profile.json'), get('projects.json'), get('certifications.json')]).then(([profile, projects, certs]) => { D = normalizeData({ profile, projects, certs }); return D }));

  /* ---------- what the visitor did on the site (kept in this browser by track.js) ---------- */
  const personal = () => { try { return localStorage.getItem(PKEY) !== '0' } catch (e) { return true } };
  const rawTrail = () => (window.asqTrack && window.asqTrack.trail ? window.asqTrack.trail() : []);
  const trail = () => (personal() ? rawTrail() : []);
  const visitor = () => buildVisitor(trail(), D);

  /* ---------- the interface ---------- */
  const avatar = '<span class="ai-av" aria-hidden="true"><span class="ai-ic"></span></span>';
  root.classList.add('ai', 'ai-page', 'is-empty');
  root.innerHTML = `
    <header class="ai-head">
      <a class="ai-back" href="${ROOT}index.html" aria-label="Back to portfolio">${IC.back}<span>Portfolio</span></a>${avatar}
      <div class="ai-ht"><h2 id="aiTitle">ASQ Ai</h2><p><i class="ai-dot"></i>Connecting…</p></div>
      <button class="ai-hbtn" id="aiTheme" type="button" aria-label="Switch light or dark theme" title="Switch theme"><span class="ai-sun">${IC.sun}</span><span class="ai-moon">${IC.moon}</span></button>
      <button class="ai-hbtn" id="aiNew" type="button" aria-label="New chat" title="New chat">${IC.plus}</button>
    </header>
    <div class="ai-main">
      <div class="ai-scroll" id="aiScroll" tabindex="-1">
        <div class="ai-welcome" id="aiWelcome"></div>
        <div class="ai-msgs" id="aiMsgs"></div>
      </div>
      <button class="ai-down" id="aiDown" type="button" hidden aria-label="Jump to latest message">${IC.down16}<span>Latest</span></button>
    </div>
    <form class="ai-composer" id="aiForm" autocomplete="off">
      <div class="ai-box">
        <textarea id="aiInput" rows="1" maxlength="1000" enterkeyhint="send" placeholder="Ask about projects, skills, certificates…" aria-label="Message ASQ Ai"></textarea>
        <button class="ai-send" id="aiSend" type="submit" aria-label="Send message" disabled></button>
      </div>
      <p class="ai-foot"><span class="ai-fn">AI can make mistakes.</span> <a class="ai-pv" href="${ROOT}privacy.html">Privacy</a> <span>Enter to send · Shift+Enter for a new line</span></p>
    </form>
    <div class="ai-sr" id="aiLive" aria-live="polite"></div>`;
  const $ = s => root.querySelector(s);
  const scroll = $('#aiScroll'), msgs = $('#aiMsgs'), welcome = $('#aiWelcome'), form = $('#aiForm'), ta = $('#aiInput'), send = $('#aiSend'), down = $('#aiDown'), live = $('#aiLive');
  let hist = [], busy = false, ctrl = null, stick = true;
  const setEmpty = () => { root.classList.toggle('is-empty', !hist.length); welcome.hidden = !!hist.length };

  /* empty-chat screen: personalised starters when we know what the visitor looked at */
  function paintWelcome() {
    const on = personal(), v = visitor(), act = on && hasActivity(v), first = firstName(D);
    const tags = act ? visitTags(v, D) : [];
    const sugs = suggest(D, act ? v : emptyVisitor());
    const strip = tags.length
      ? `<div class="ai-ctx"><span class="ai-ctx-l">Picking up from your visit</span><span class="ai-ctx-t">${tags.map(t => `<i>${esc(t)}</i>`).join('')}</span><button type="button" data-pz="off">Turn off</button></div>`
      : (!on && hasActivity(buildVisitor(rawTrail(), D)) ? '<div class="ai-ctx off"><span class="ai-ctx-l">Personalised suggestions are off</span><button type="button" data-pz="on">Turn on</button></div>' : '');
    welcome.innerHTML = `<span class="ai-av ai-av-lg" aria-hidden="true"><span class="ai-ic"></span></span>
      <h3>Hi, I’m <span class="grad">ASQ Ai</span></h3>
      <p>Ask me about ${esc(first)}’s projects, skills and certificates, or how to work with him.</p>${strip}
      <div class="ai-sugs">${sugs.map(s => `<button class="ai-sug" type="button" data-q="${esc(s.q)}"><span class="ai-sic">${IC[s.icon] || IC.grid}</span><span class="ai-sq">${esc(s.q)}${s.why ? `<small>${esc(s.why)}</small>` : ''}</span></button>`).join('')}</div>`;
  }

  /* ---------- tiny markdown: **bold**, `code`, [text](link), "- " lists ---------- */
  const link = (l, u) => u[0] === '#' ? `<a href="${ROOT}index.html${u}">${l}</a>`
    : /^(project|about|projects|certifications|privacy)\.html(\?|#|$)/.test(u) ? `<a href="${ROOT}${u}">${l}</a>` : `<a href="${u}" target="_blank" rel="noopener noreferrer">${l}</a>`;
  const inline = t => t.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, l, u) => link(l, u));
  function md(t) {
    let h = '', ul = false;
    for (const raw of esc(t).split('\n')) {
      const li = raw.match(/^\s*-\s+(.*)/);
      if (li) { if (!ul) { h += '<ul>'; ul = true } h += `<li>${inline(li[1])}</li>` }
      else { if (ul) { h += '</ul>'; ul = false } if (raw.trim()) h += `<p>${inline(raw)}</p>` }
    }
    return h + (ul ? '</ul>' : '');
  }

  /* ---------- UI cards (drawn from the JSON, so they are always true) ---------- */
  const fileUrl = (base, v) => !v ? '' : (/^(https?:)?\/\//.test(v) || v.includes('/')) ? v : base + encodeURI(v);
  const mon = d => d ? new Date(d + '-01T00:00:00').toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : '';
  const projThumb = p => {
    const t = typeof p.thumb === 'string' ? { light: p.thumb, dark: p.thumb } : (p.thumb || {});
    const L = fileUrl('assets/images/projects/', t.light || t.dark), Dk = fileUrl('assets/images/projects/', t.dark || t.light);
    if (!L) return '';
    const im = (s, c) => `<img${c ? ` class="${c}"` : ''} src="${esc(s)}" alt="" loading="lazy" decoding="async">`;
    return L === Dk ? im(L) : im(L, 't-light') + im(Dk, 't-dark');
  };
  const ICONS = { python: 'python', pytorch: 'pytorch', tensorflow: 'tensorflow', pandas: 'pandas', numpy: 'numpy', jupyter: 'jupyter', opencv: 'opencv', 'c++': 'cplusplus', fastapi: 'fastapi', bash: 'bash', linux: 'linux', ubuntu: 'ubuntu', git: 'git', gcp: 'googlecloud', docker: 'docker', kubernetes: 'kubernetes', spark: 'spark', postgresql: 'postgresql', pgvector: 'postgresql' };
  const ICLS = { pandas: 'ic-inv', numpy: 'ic-inv', bash: 'ic-inv', linux: 'ic-inv', cplusplus: 'ic-lift', kubernetes: 'ic-lift', postgresql: 'ic-lift' };
  const btn = (href, label, pri, ext) => `<a class="uc-btn${pri ? ' pri' : ''}" href="${esc(href)}"${ext ? ' target="_blank" rel="noopener noreferrer"' : ''}>${esc(label)}${ext ? IC.out : ''}</a>`;

  function projectCard(p, seen, big) {
    return `<a class="uc uc-proj${big ? ' big' : ''}" href="project.html?id=${encodeURIComponent(p.id)}" style="--h:${hash(p.name) % 360}">
      <span class="uc-thumb"><span class="uc-ph">${esc(p.name.slice(0, 1))}</span>${projThumb(p)}</span>
      <span class="uc-body">
        <span class="uc-meta"><span>${esc(p.cat)}</span>${p.lang ? `<span>${esc(p.lang)}</span>` : ''}${seen ? '<span class="uc-seen">Viewed</span>' : ''}</span>
        <b class="uc-title">${esc(p.name)}</b>
        <span class="uc-desc">${esc(p.desc)}</span>
        ${(p.tags || []).length ? `<span class="uc-tags">${p.tags.slice(0, big ? 5 : 3).map(t => `<i>${esc(t)}</i>`).join('')}</span>` : ''}
        <span class="uc-go">View project ${IC.out}</span>
      </span></a>`;
  }
  function certCard(c) {
    const pdf = c.pdf ? fileUrl('assets/docs/certificates/', c.pdf) : '', img = c.image ? fileUrl(c.isBadge ? 'assets/images/badges/' : 'assets/images/certificates/', c.image) : '';
    return `<article class="uc uc-cert" style="--h:${hash(c.title) % 360}">
      <span class="uc-thumb"><span class="uc-ph"><small>${esc(c.issuer)}</small>${esc(c.title)}</span>${img ? `<img src="${esc(img)}" alt="" loading="lazy" decoding="async">` : ''}</span>
      <span class="uc-body">
        <span class="uc-meta"><span>${esc(c.issuer)}</span>${c.date ? `<span>${mon(c.date)}</span>` : ''}${c.isBadge ? '<span>Badge</span>' : ''}</span>
        <b class="uc-title">${esc(c.title)}</b>
        <span class="uc-btns">${c.url ? btn(c.url, 'Verify', true, true) : ''}${pdf ? btn(pdf, 'PDF', false, true) : ''}</span>
      </span></article>`;
  }
  const skillsCard = groups => `<div class="uc uc-skills"><div class="uc-h">${IC.tool}<b>Toolbox</b></div>${groups.map(g => { const a = (D.profile.skills || {})[g]; if (!a) return ''; return `<div class="uc-grp"><small>${esc(g)}</small><span class="uc-chips">${a.map(s => { const f = ICONS[String(s).toLowerCase()]; return `<i>${f ? `<img class="${ICLS[f] || ''}" src="assets/icons/tech/${f}.svg" alt="" width="14" height="14" loading="lazy">` : ''}${esc(s)}</i>` }).join('')}</span></div>` }).join('')}</div>`;
  const profileCard = () => { const P = D.profile; return `<div class="uc uc-prof"><span class="uc-av"><span>${esc((P.name || 'Q').slice(0, 1))}</span><img src="assets/images/profile/me.png" alt="" width="64" height="64" loading="lazy" decoding="async"></span>
    <div class="uc-pb"><b class="uc-title">${esc(P.name)}</b><span class="uc-role">${esc(P.role)}</span><span class="uc-loc">${IC.pin}${esc(P.location)}${P.remote ? ' · remote' : ''}</span></div>
    ${P.bio ? `<p class="uc-bio">${esc(P.bio)}</p>` : ''}<div class="uc-btns">${btn('projects.html', 'See projects', true)}${P.resume ? btn(ROOT + P.resume, 'Resume', false, true) : ''}</div></div>` };
  const contactCard = () => { const P = D.profile; return `<div class="uc uc-ct"><div class="uc-row"><span class="uc-ic">${IC.mail}</span><span class="uc-rt"><small>Email</small><b>${esc(P.email)}</b></span><button class="uc-copy" type="button" data-copy="${esc(P.email)}">${IC.copy}<span>Copy</span></button></div>
    <p class="uc-note">${P.replyTime ? `Usually replies ${esc(P.replyTime)}. ` : ''}${esc(P.location || '')}${P.remote ? ', works remotely' : ''}.</p>
    <div class="uc-btns">${btn('index.html#contact', 'Send a message', true)}${btn('mailto:' + P.email, 'Open mail app', false)}</div></div>` };
  const resumeCard = () => { const P = D.profile, u = ROOT + (P.resume || 'assets/docs/resume.pdf'); return `<a class="uc uc-res" href="${esc(u)}" target="_blank" rel="noopener noreferrer"><span class="uc-ic">${IC.file}</span><span class="uc-rt"><b>${esc(P.short || 'Qasim')}’s resume</b><small>PDF · opens in a new tab</small></span>${IC.out}</a>` };
  const linkCard = c => `<a class="uc uc-res" href="${esc(c.href)}"><span class="uc-ic">${IC.grid}</span><span class="uc-rt"><b>${esc(c.label)}</b><small>${esc(c.text || '')}</small></span>${IC.out}</a>`;

  function uiHTML(ui) {
    if (!Array.isArray(ui) || !ui.length) return '';
    const v = visitor(), byId = new Map(D.projects.map(p => [p.id, p]));
    return `<div class="ai-ui">${ui.map(c => {
      if (c.t === 'project' && byId.has(c.id)) return projectCard(byId.get(c.id), v.projects.includes(c.id), true);
      if (c.t === 'projects') { const L = (c.ids || []).map(id => byId.get(id)).filter(Boolean); return L.length ? `<div class="uc-rail">${L.map(p => projectCard(p, v.projects.includes(p.id))).join('')}</div>${c.more ? `<a class="uc-more" href="${esc(c.more.href)}">${esc(c.more.label)} ${IC.out}</a>` : ''}` : '' }
      if (c.t === 'certs') { const L = (c.idx || []).map(i => D.certs[i]).filter(Boolean); return L.length ? `<div class="uc-rail">${L.map(certCard).join('')}</div><a class="uc-more" href="certifications.html">All certificates ${IC.out}</a>` : '' }
      if (c.t === 'skills') return skillsCard(c.groups || []);
      if (c.t === 'profile') return profileCard();
      if (c.t === 'contact') return contactCard();
      if (c.t === 'resume') return resumeCard();
      if (c.t === 'link') return linkCard(c);
      return '';
    }).join('')}</div>`;
  }

  /* ---------- backend: POST /api/chat (an event with the cards, then streamed text), GET /api/quota ---------- */
  let backend = null, quota = null;
  const clock = iso => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const limitMsg = () => `You've used all ${quota ? quota.limit : 10} free messages for today. The limit resets at ${quota && quota.resetAt ? clock(quota.resetAt) : 'midnight UTC'} (your local time). In the meantime you can browse the [Projects](#projects) or email ${firstName(D)} directly.`;
  const saved = () => (window.asqTrack && window.asqTrack.off ? '' : ' Chats are saved for review.');
  function paintQuota() {
    if (backend !== true || !quota) return;
    $('.ai-ht p').innerHTML = '<i class="ai-dot"></i>Online';
    $('.ai-fn').textContent = (quota.remaining > 0 ? `${quota.remaining} of ${quota.limit} messages left today.` : `Daily limit reached, resets at ${clock(quota.resetAt)}.`) + saved();
  }
  function setQuota(limit, remaining, resetAt) { if (limit == null || remaining == null) return; quota = { limit: +limit, remaining: +remaining, resetAt: resetAt || (quota && quota.resetAt) }; paintQuota() }
  async function initBackend() {
    if (backend !== null) return;
    backend = false;
    try { const r = await fetch(API + 'quota', { cache: 'no-store' }); if (r.ok && (r.headers.get('content-type') || '').includes('json')) { const q = await r.json(); backend = true; setQuota(q.limit, q.remaining, q.resetAt) } } catch (e) { }
    if (!backend) { $('.ai-ht p').innerHTML = '<i class="ai-dot off"></i>Offline'; $('.ai-fn').textContent = 'AI is offline: showing cards only.' }
  }
  async function* say(text) { for (const w of text.split(/(\s+)/)) yield { type: 'token', text: w }; yield { type: 'done', local: true } }

  const OFFLINE = { project: 'Here is that project.', projects: 'Here are some projects that fit.', certs: 'Here are some of the certificates.', skills: 'Here is the toolbox.', profile: 'Here is a quick profile.', contact: 'Here is how to reach him.', resume: 'Here is the resume.', experience: 'The timeline is on the home page.', greet: 'Hi! I’m ASQ Ai. The AI service is not reachable right now, but I can still show cards for projects, skills, certificates, contact and the resume.', thanks: 'You’re welcome!', none: 'The AI service is not reachable right now, so I can only show cards for projects, skills, certificates, contact and the resume. Try one of these:' };
  async function* offline(question) {                                 // no Worker: same routing, cards only
    const r = route(question, D, visitor()); await sleep(450);
    yield { type: 'meta', ui: r.ui, step: r.step, chips: r.chips };
    yield* say(OFFLINE[r.kind] || OFFLINE.none);
  }

  async function* respond(history, signal) {
    await Promise.all([load(), initBackend()]);
    if (!backend) { backend = null; await initBackend() }               // the first check can fail: try once more before going offline
    if (!backend) { yield* offline(history[history.length - 1].text); return }
    if (quota && quota.remaining === 0) { yield* say(limitMsg()); return }
    const messages = history.filter(m => !m.local && m.text).map(m => ({ role: m.role === 'bot' ? 'assistant' : 'user', content: m.text }));
    const body = { messages, ctx: window.asqTrack ? window.asqTrack.ctx() : {}, personalize: personal() };
    if (personal() && !(window.asqTrack && window.asqTrack.off)) body.trail = trail();
    let res;
    try { res = await fetch(API + 'chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal }) }
    catch (e) { if (signal.aborted) return; yield* say('I couldn’t reach the server. Please check your connection and try again.'); return }
    if (res.status === 429) { const j = await res.json().catch(() => ({})); setQuota(j.limit || 10, 0, j.resetAt); yield* say(limitMsg()); return }
    if (!res.ok) { const j = await res.json().catch(() => ({})); yield* say(j.message || 'Something went wrong. Please try again.'); return }
    setQuota(res.headers.get('X-Quota-Limit'), res.headers.get('X-Quota-Remaining'), res.headers.get('X-Quota-Reset'));
    const reader = res.body.getReader(), dec = new TextDecoder(); let buf = '';
    try {
      for (;;) {
        const { done, value } = await reader.read(); if (done) break;
        buf += dec.decode(value, { stream: true });
        let i;
        while ((i = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
          if (!line.startsWith('data:')) continue;
          const p = line.slice(5).trim(); if (!p || p === '[DONE]') continue;
          try {
            const j = JSON.parse(p);
            if (j.ui !== undefined) { yield { type: 'meta', ui: j.ui, step: j.step, chips: j.chips }; continue }
            const t = j.response ?? (j.choices && j.choices[0] && j.choices[0].delta && j.choices[0].delta.content) ?? ''; if (t) yield { type: 'token', text: t }
          } catch (e) { }
        }
      }
    } catch (e) { if (signal.aborted) return; throw e }
    yield { type: 'done' };
  }

  /* ---------- rendering messages ---------- */
  const atEnd = () => scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight < 70;
  const toEnd = force => { if (force || stick) scroll.scrollTop = scroll.scrollHeight };
  scroll.addEventListener('scroll', () => { stick = atEnd(); down.hidden = stick || !hist.length }, { passive: true });
  down.onclick = () => scroll.scrollTo({ top: scroll.scrollHeight, behavior: reduce() ? 'auto' : 'smooth' });
  const stepHTML = t => `<div class="ai-step">${IC.check12}${esc(t)}</div>`;
  const chipsHTML = c => c && c.length ? `<div class="ai-chips">${c.map(x => `<button class="ai-chip" type="button" data-q="${esc(x)}">${esc(x)}</button>`).join('')}</div>` : '';
  const botShell = () => { const el = document.createElement('div'); el.className = 'ai-msg bot'; el.innerHTML = `${avatar}<div class="ai-body"><div class="ai-think"><span class="ai-dots"><i></i><i></i><i></i></span>Thinking…</div></div>`; return el };
  const userEl = text => { const el = document.createElement('div'); el.className = 'ai-msg user'; el.innerHTML = '<div class="ai-b"></div>'; el.firstChild.textContent = text; return el };
  const setLast = () => { msgs.querySelectorAll('.ai-msg.last').forEach(m => m.classList.remove('last')); const l = [...msgs.querySelectorAll('.ai-msg.bot')].pop(); if (l && !busy) l.classList.add('last') };
  function actions(el, m) {
    const a = document.createElement('div'); a.className = 'ai-acts';
    a.innerHTML = `<button class="ai-act" type="button" data-a="copy" aria-label="Copy reply" title="Copy">${IC.copy}</button><button class="ai-act" type="button" data-a="up" aria-label="Good reply" aria-pressed="${m.rating === 'up'}" title="Good reply">${IC.up}</button><button class="ai-act" type="button" data-a="down" aria-label="Bad reply" aria-pressed="${m.rating === 'down'}" title="Bad reply">${IC.down}</button><button class="ai-act" type="button" data-a="redo" aria-label="Regenerate reply" title="Regenerate">${IC.redo}</button>`;
    a.onclick = e => {
      const b = e.target.closest('.ai-act'); if (!b) return; const k = b.dataset.a;
      if (k === 'copy') { navigator.clipboard && navigator.clipboard.writeText(m.text).then(() => { b.innerHTML = IC.check; setTimeout(() => b.innerHTML = IC.copy, 1400) }) }
      else if (k === 'redo') { if (!busy) regenerate() }
      else { const on = b.getAttribute('aria-pressed') !== 'true'; a.querySelectorAll('[data-a=up],[data-a=down]').forEach(x => x.setAttribute('aria-pressed', 'false')); b.setAttribute('aria-pressed', on); m.rating = on ? k : null; save() }
    };
    el.querySelector('.ai-body').appendChild(a);
  }
  function paintBot(el, m, chips) {
    el.querySelector('.ai-body').innerHTML = (m.step ? stepHTML(m.step) : '') +
      (m.text ? `<div class="ai-text">${md(m.text)}${m.stopped ? '<span class="ai-stopped">Stopped</span>' : ''}</div>` : '') + (m.stopped ? '' : uiHTML(m.ui)) + (chips ? chipsHTML(m.chips) : '');
    if (m.text) actions(el, m);
  }
  const save = () => { try { sessionStorage.setItem(KEY, JSON.stringify(hist)) } catch (e) { } };

  async function answer() {
    busy = true; ctrl = new AbortController(); setMode(); setEmpty();
    const el = botShell(); msgs.appendChild(el); setLast(); stick = true; toEnd(true);
    const body = el.querySelector('.ai-body'), m = { role: 'bot', text: '' }; hist.push(m);
    let txt = null;
    try {
      for await (const ev of respond(hist.slice(0, -1), ctrl.signal)) {
        if (ev.type === 'meta') {
          m.ui = ev.ui; m.chips = ev.chips;
          if (ev.step) { m.step = ev.step; body.innerHTML = `<div class="ai-step"><span class="ai-spin"></span>${esc(ev.step)}…</div><div class="ai-think"><span class="ai-dots"><i></i><i></i><i></i></span>Thinking…</div>` }
        }
        if (ev.type === 'token') {
          if (!txt) { body.innerHTML = (m.step ? stepHTML(m.step) : '') + '<div class="ai-text live"></div>'; txt = body.querySelector('.ai-text') }
          m.text += ev.text; txt.innerHTML = md(m.text)
        }
        if (ev.type === 'done' && ev.local) m.local = true;
        toEnd();
      }
      m.stopped = ctrl.signal.aborted;
    } catch (err) { console.error(err); m.text = 'Something went wrong. Please try again.'; m.stopped = false }
    if (!m.chips || !m.chips.length) m.chips = m.local ? undefined : suggest(D, visitor()).slice(0, 3).map(s => s.q);
    paintBot(el, m, !m.stopped);
    if (!m.text && m.stopped) el.querySelector('.ai-body').innerHTML = '<div class="ai-text"><span class="ai-stopped">Stopped</span></div>';
    live.textContent = m.text;
    busy = false; ctrl = null; setMode(); setLast(); toEnd(true); save();
  }
  function ask(text) {
    text = text.trim(); if (!text || busy) return;
    msgs.querySelectorAll('.ai-chips').forEach(c => c.remove());
    hist.push({ role: 'user', text }); msgs.appendChild(userEl(text));
    ta.value = ''; grow(); save(); answer();
  }
  function regenerate() { const bots = msgs.querySelectorAll('.ai-msg.bot'), last = bots[bots.length - 1]; if (!last) return; last.remove(); hist.pop(); answer() }
  function reset() { if (ctrl) ctrl.abort(); hist = []; busy = false; msgs.innerHTML = ''; setEmpty(); paintWelcome(); down.hidden = true; setMode(); ta.value = ''; grow(); scroll.scrollTop = 0; save() }
  function restore() {
    let s = []; try { s = JSON.parse(sessionStorage.getItem(KEY) || '[]') } catch (e) { }
    if (!Array.isArray(s) || !s.length) return;
    hist = s;
    const lastBot = hist.map(m => m.role).lastIndexOf('bot');
    hist.forEach((m, i) => { if (m.role === 'user') msgs.appendChild(userEl(m.text)); else { const el = botShell(); msgs.appendChild(el); paintBot(el, m, i === lastBot && !m.stopped) } });
    setLast();
  }

  /* ---------- composer ---------- */
  function setMode() { send.classList.toggle('stop', busy); send.innerHTML = busy ? IC.stop : IC.arrow; send.setAttribute('aria-label', busy ? 'Stop generating' : 'Send message'); send.disabled = !busy && !ta.value.trim() }
  function grow() { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 144) + 'px'; setMode() }
  ta.addEventListener('input', grow);
  ta.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); form.requestSubmit() } });
  form.addEventListener('submit', e => { e.preventDefault(); if (busy) { ctrl && ctrl.abort(); return } ask(ta.value) });
  $('#aiNew').onclick = () => { reset(); if (matchMedia('(pointer:fine)').matches) ta.focus() };
  $('#aiTheme').onclick = () => { const h = document.documentElement, n = h.dataset.theme === 'dark' ? 'light' : 'dark'; h.dataset.theme = n; try { localStorage.setItem('pf-theme', n) } catch (e) { } };
  root.addEventListener('click', e => {
    const q = e.target.closest('[data-q]'); if (q) { ask(q.dataset.q); return }
    const pz = e.target.closest('[data-pz]'); if (pz) { try { localStorage.setItem(PKEY, pz.dataset.pz === 'on' ? '1' : '0') } catch (x) { } paintWelcome(); return }
    const cp = e.target.closest('[data-copy]');
    if (cp) { navigator.clipboard && navigator.clipboard.writeText(cp.dataset.copy).then(() => { const s = cp.querySelector('span'); s.textContent = 'Copied'; setTimeout(() => s.textContent = 'Copy', 1500) }); if (window.asqTrack) window.asqTrack.event('copy', 'email', { cv: 1 }) }
  });
  root.addEventListener('error', e => { if (e.target && e.target.tagName === 'IMG' && e.target.closest('.uc')) e.target.remove() }, true);   // missing thumbnail: the gradient shows instead

  /* ---------- phone keyboard ----------
     When the keyboard opens, iOS and Android shrink only the *visual* viewport and scroll the page, which pushed the header and chat out of view
     and left a blank band. We pin the app to the visual viewport instead, and switch to a compact layout while the keyboard is up. */
  const vv = window.visualViewport;
  let baseH = Math.max(innerHeight, vv ? vv.height : 0);
  function fit() {
    const h = vv ? vv.height : innerHeight, top = vv ? vv.offsetTop : 0, typing = document.activeElement === ta;
    if (!typing) baseH = Math.max(h, baseH > h + 150 ? 0 : baseH);   // not typing: whatever we see is the full height (also after rotation)
    const kb = typing && h < baseH - 120;
    root.style.height = h + 'px'; root.style.transform = top ? `translateY(${top}px)` : '';
    if (root.classList.contains('kb') !== kb) { root.classList.toggle('kb', kb); if (stick) requestAnimationFrame(() => toEnd(true)) }
    if (top || scrollY) scrollTo(0, 0);
  }
  if (vv) { vv.addEventListener('resize', fit); vv.addEventListener('scroll', fit) }
  addEventListener('resize', fit); addEventListener('orientationchange', () => { baseH = 0; setTimeout(fit, 300) });
  ta.addEventListener('focus', () => { fit(); setTimeout(fit, 250); setTimeout(fit, 600) });
  ta.addEventListener('blur', () => setTimeout(fit, 120));

  /* ---------- start ---------- */
  setMode(); setEmpty(); fit();
  load().then(() => {
    restore(); setEmpty(); paintWelcome(); if (hist.length) setTimeout(() => toEnd(true), 0);
    if (window.asqTrack) window.asqTrack.event('ai_open', 'page');
  });
  initBackend();
  if (matchMedia('(pointer:fine)').matches) ta.focus({ preventScroll: true });      // never auto-focus on phones: it would pop the keyboard up before the visitor asks for it
})();
