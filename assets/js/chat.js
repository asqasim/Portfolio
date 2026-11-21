/* ASQ Ai chat, shared by index.html (pop-up sheet) and ai.html (standalone page).
   Answers come from the Cloudflare Worker (worker/index.js) via /api/chat. If that backend is not reachable (e.g. the site is opened as plain files) the scripted demo below takes over.
   It yields {type:'step',text}, {type:'token',text} and finally {type:'done',cards,chips}; nothing else needs to change.
   Content comes from assets/data/ (profile.json, projects.json, certifications.json). Needs assets/css/base.css + chat.css. */
(function () {
  'use strict';
  const me = document.currentScript;
  const ROOT = (me && me.dataset.root) || '';            // set data-root="../" if a page lives in a sub-folder
  const mount = document.getElementById('aiRoot');       // present on ai.html only
  const PAGE = !!mount;
  const KEY = 'asq-ai-chat';

  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const svg = (p, w = 16) => `<svg width="${w}" height="${w}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
  const IC = {
    copy: svg('<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>', 15),
    check: svg('<path d="M20 6 9 17l-5-5"/>', 15),
    check12: svg('<path d="M20 6 9 17l-5-5"/>', 12),
    up: svg('<path d="M7 10v12"/><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z"/>', 15),
    down: svg('<path d="M17 14V2"/><path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z"/>', 15),
    redo: svg('<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>', 15),
    out: svg('<path d="M7 7h10v10"/><path d="M7 17 17 7"/>', 14),
    arrow: svg('<path d="m5 12 7-7 7 7M12 19V5"/>', 18),
    stop: svg('<rect x="6" y="6" width="12" height="12" rx="2.5" fill="currentColor"/>', 16),
    plus: svg('<path d="M12 5v14M5 12h14"/>', 18),
    close: svg('<path d="M18 6 6 18M6 6l12 12"/>', 18),
    expand: svg('<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>', 17),
    back: svg('<path d="m12 19-7-7 7-7M19 12H5"/>', 16),
    sun: svg('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>', 18),
    moon: svg('<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>', 18),
    grid: svg('<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>'),
    tool: svg('<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>'),
    award: svg('<circle cx="12" cy="8" r="6"/><path d="M15.48 12.89 17 22l-5-3-5 3 1.52-9.11"/>'),
    mail: svg('<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>'),
    down16: svg('<path d="M12 5v14m7-7-7 7-7-7"/>', 16)
  };
  const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const sleep = ms => new Promise(r => setTimeout(r, reduce() ? 0 : ms));

  /* ---------- data (loaded once, only when the chat is first used) ---------- */
  const get = f => fetch(ROOT + 'assets/data/' + f).then(r => r.ok ? r.json() : Promise.reject(r.status));
  let dataP = null;
  const load = () => dataP || (dataP = Promise.all([
    get('projects.json').catch(() => ({ projects: [] })),
    get('certifications.json').catch(() => null),
    get('profile.json').catch(() => ({}))
  ]).then(([p, c, f]) => ({ projects: p.projects || [], certs: c, profile: f || {} })));

  /* ---------- build the interface ---------- */
  const sug = (q, ic) => `<button class="ai-sug" type="button" data-q="${q}"><span class="ai-sic">${ic}</span><span>${q}</span></button>`;
  const status = '<p><i class="ai-dot"></i>Connecting…</p>';
  const avatar = '<span class="ai-av" aria-hidden="true"><span class="ai-ic"></span></span>';
  const title = `<div class="ai-ht"><h2 id="aiTitle">ASQ Ai</h2>${status}</div>`;
  const header = PAGE
    ? `<a class="ai-back" href="${ROOT}index.html" aria-label="Back to portfolio">${IC.back}<span>Portfolio</span></a>${avatar}${title}
       <button class="ai-hbtn" id="aiTheme" type="button" aria-label="Switch light or dark theme" title="Switch theme"><span class="ai-sun">${IC.sun}</span><span class="ai-moon">${IC.moon}</span></button>
       <button class="ai-hbtn" id="aiNew" type="button" aria-label="New chat" title="New chat">${IC.plus}</button>`
    : `${avatar}${title}
       <a class="ai-hbtn" href="${ROOT}ai.html" aria-label="Open as a full page" title="Open as a full page">${IC.expand}</a>
       <button class="ai-hbtn" id="aiNew" type="button" aria-label="New chat" title="New chat">${IC.plus}</button>
       <button class="ai-hbtn" type="button" data-ai-close aria-label="Close chat" title="Close (Esc)">${IC.close}</button>`;
  const inner = `
    <header class="ai-head">${header}</header>
    <div class="ai-main">
      <div class="ai-scroll" id="aiScroll" tabindex="-1">
        <div class="ai-welcome" id="aiWelcome">
          <span class="ai-av ai-av-lg" aria-hidden="true"><span class="ai-ic"></span></span>
          <h3>Hi, I’m <span class="grad">ASQ Ai</span></h3>
          <p>Ask me about Qasim’s projects, skills and certificates, or how to work with him.</p>
          <div class="ai-sugs">${sug('What projects has Qasim built?', IC.grid)}${sug('What is in his toolbox?', IC.tool)}${sug('Which certificates does he have?', IC.award)}${sug('How can I contact him?', IC.mail)}</div>
        </div>
        <div class="ai-msgs" id="aiMsgs"></div>
      </div>
      <button class="ai-down" id="aiDown" type="button" hidden aria-label="Jump to latest message">${IC.down16}<span>Latest</span></button>
    </div>
    <form class="ai-composer" id="aiForm" autocomplete="off">
      <div class="ai-box">
        <textarea id="aiInput" rows="1" maxlength="1000" placeholder="Ask about projects, skills, certificates…" aria-label="Message ASQ Ai"></textarea>
        <button class="ai-send" id="aiSend" type="submit" aria-label="Send message" disabled></button>
      </div>
      <p class="ai-foot"><span class="ai-fn">AI can make mistakes.</span> <a class="ai-pv" href="${ROOT}privacy.html">Privacy</a> <span>Enter to send · Shift+Enter for a new line</span></p>
    </form>
    <div class="ai-sr" id="aiLive" aria-live="polite"></div>`;

  let root;
  if (PAGE) { root = mount; root.classList.add('ai', 'ai-page'); root.innerHTML = inner; }
  else { root = document.createElement('dialog'); root.className = 'ai'; root.id = 'aiChat'; root.setAttribute('aria-labelledby', 'aiTitle'); root.innerHTML = inner; document.body.appendChild(root); }
  const $ = s => root.querySelector(s);
  const scroll = $('#aiScroll'), msgs = $('#aiMsgs'), welcome = $('#aiWelcome'), form = $('#aiForm'), ta = $('#aiInput'), send = $('#aiSend'), down = $('#aiDown'), live = $('#aiLive');

  let hist = [], busy = false, ctrl = null, opener = null, stick = true;

  /* ---------- tiny markdown: **bold**, `code`, [text](link), "- " lists ---------- */
  const link = (l, u) => u[0] === '#'
    ? (PAGE ? `<a href="${ROOT}index.html${u}">${l}</a>` : `<a href="${u}" data-go>${l}</a>`)
    : /^project\.html(\?|$)/.test(u) ? `<a href="${ROOT}${u}">${l}</a>`
    : `<a href="${u}" target="_blank" rel="noopener noreferrer">${l}</a>`;
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

  /* ---------- the scripted brain (reads the real site data, so answers stay right when you edit the JSON files) ---------- */
  const has = (t, ...w) => w.some(x => t.includes(x));
  const projCard = p => ({ title: p.name, meta: [p.cat, p.lang].filter(Boolean).join(' · '), desc: p.desc, href: p.url || '#projects' });
  function plan(q, d) {
    const t = q.toLowerCase(), projects = d.projects, certs = d.certs, pr = d.profile || {};
    const first = (pr.short || 'Qasim');
    const named = projects.find(p => { const n = p.name.toLowerCase(), f = n.split(/[\s:&]+/)[0]; return t.includes(n) || (f.length >= 4 && t.includes(f)) });
    if (named) return { step: `Looked up ${named.name}`, text: `**${named.name}** is a ${String(named.cat).toLowerCase()} project${named.lang ? ` built with ${named.lang}` : ''}.\n${named.desc}`, cards: [projCard(named)], chips: ['Show other projects', 'What is in his toolbox?'] };
    if (has(t, 'project', 'built', 'build', 'portfolio', 'work') && !has(t, 'work with', 'work together', 'working')) {
      const feat = projects.filter(p => p.featured), list = (feat.length ? feat : projects).slice(0, 3);
      return { step: `Searched ${projects.length || 'all'} projects`, text: 'Here are a few highlights. Browse everything in the [Projects](#projects) section, where you can filter by category.', cards: list.map(projCard), chips: ['Tell me about termflix', 'Which certificates does he have?'] };
    }
    if (has(t, 'certif', 'badge', 'credential', 'course')) {
      const c = (certs && certs.certificates) || [], b = (certs && certs.badges) || [];
      return { step: 'Checked certifications', text: `${first} has ${c.length} featured certificates and ${b.length} more badges. A few of them:\n${c.slice(0, 3).map(x => `- **${x.title}** (${x.issuer})`).join('\n')}\nOpen any of them in [Certifications](#certifications) to view the full certificate and PDF.`, chips: ['What projects has Qasim built?', 'How can I contact him?'] };
    }
    if (has(t, 'skill', 'stack', 'tool', 'tech', 'toolbox', 'python', 'know', 'language')) {
      const rows = Object.entries(pr.skills || {}).map(([k, v]) => `- **${k}:** ${v.join(', ')}`);
      return { step: 'Read the Toolbox', text: `His toolbox is split into ${rows.length} areas:\n${rows.join('\n')}`, chips: ['What projects has Qasim built?', 'Which certificates does he have?'] };
    }
    if (has(t, 'resume', 'cv')) return { step: 'Found the resume', text: `You can read his resume here: [View resume (PDF)](${ROOT}${pr.resume || 'assets/docs/resume.pdf'}).`, chips: ['How can I contact him?', 'What projects has Qasim built?'] };
    if (has(t, 'contact', 'hire', 'email', 'reach', 'available', 'availability', 'freelance', 'work with', 'work together', 'talk', 'call'))
      return { step: 'Looked up contact details', text: `The quickest way is email: **${pr.email || ''}**. He is based in ${pr.location || 'Pakistan'}${pr.remote ? ', works remotely' : ''}, and usually replies ${pr.replyTime || 'within a day'}.\nYou can also use the form in the [Contact](#contact) section.`, chips: ['View resume', 'What projects has Qasim built?'] };
    if (has(t, 'who', 'about', 'background', 'experience', 'yourself'))
      return { step: 'Read the profile', text: `${pr.bio || ''}\nSee [Experience](#experience) for the timeline.`, chips: ['What projects has Qasim built?', 'What is in his toolbox?'] };
    if (/^(hi|hey|hello|salam|yo|hola)\b/.test(t)) return { text: 'Hi! I’m ASQ Ai, Qasim’s portfolio assistant. Ask me about his projects, skills, certificates, or how to get in touch.', chips: ['What projects has Qasim built?', 'What is in his toolbox?'] };
    if (has(t, 'thank')) return { text: 'You’re welcome! Anything else you’d like to know?', chips: ['How can I contact him?'] };
    return { text: 'I’m in demo mode, so I only understand a few topics for now: **projects**, **skills**, **certificates**, **contact** and **resume**. Real AI answers will be connected soon.', chips: ['What projects has Qasim built?', 'What is in his toolbox?', 'Which certificates does he have?'] };
  }
  /* scripted fallback (demo mode) */
  async function* demoRespond(history, signal) {
    const d = await load();
    const r = plan(history[history.length - 1].text, d);
    await sleep(550); if (signal.aborted) return;
    if (r.step) { yield { type: 'step', text: r.step }; await sleep(650); if (signal.aborted) return }
    for (const w of r.text.split(/(\s+)/)) { if (signal.aborted) return; yield { type: 'token', text: w }; if (w.trim()) await sleep(16 + Math.random() * 26) }
    yield { type: 'done', cards: r.cards, chips: r.chips };
  }


  /* ---------- live backend: POST /api/chat (streams text), GET /api/quota ---------- */
  const API = ROOT + 'api/';
  let backend = null;                                     // null = not checked yet, true = Worker answers, false = use the scripted demo
  let quota = null;                                       // { limit, remaining, resetAt }
  const clock = iso => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const limitMsg = () => `You've used all ${quota ? quota.limit : 10} free messages for today. The limit resets at ${quota && quota.resetAt ? clock(quota.resetAt) : 'midnight UTC'} (your local time). In the meantime you can browse the [Projects](#projects) or email Qasim directly.`;
  function paintQuota() {
    const s = root.querySelector('.ai-ht p'), f = root.querySelector('.ai-foot');
    if (backend !== true || !quota) return;
    s.innerHTML = '<i class="ai-dot"></i>Online';
    f.querySelector('.ai-fn').textContent = (quota.remaining > 0 ? `${quota.remaining} of ${quota.limit} messages left today.` : `Daily limit reached, resets at ${clock(quota.resetAt)}.`) + saved();
  }
  function setQuota(limit, remaining, resetAt) { if (limit == null || remaining == null) return; quota = { limit: +limit, remaining: +remaining, resetAt: resetAt || (quota && quota.resetAt) }; paintQuota() }
  const saved = () => (window.asqTrack && window.asqTrack.off ? '' : ' Chats are saved for review.');
  async function initBackend() {
    if (backend !== null) return;
    backend = false;
    const st = root.querySelector('.ai-ht p'); 
    try {
      const r = await fetch(API + 'quota', { cache: 'no-store' });
      if (r.ok && (r.headers.get('content-type') || '').includes('json')) { const q = await r.json(); backend = true; setQuota(q.limit, q.remaining, q.resetAt) }
    } catch (e) { /* no backend: stay in demo mode */ }
    if (!backend && st && /Connecting/.test(st.textContent)) st.innerHTML = '<i class="ai-dot"></i>Offline'
  }
  async function* say(text) { for (const w of text.split(/(\s+)/)) yield { type: 'token', text: w }; yield { type: 'done', local: true } }

  async function* respond(history, signal) {
    await initBackend();
    if (!backend) {                                    // no Worker reachable (plain files / local static server): scripted answers
      const s = root.querySelector('.ai-ht p'), f = root.querySelector('.ai-foot');
      s.innerHTML = '<i class="ai-dot"></i>Demo mode · scripted replies'; f.querySelector('.ai-fn').textContent = 'Demo only: replies are scripted.';
      yield* demoRespond(history, signal); return
    }
    if (quota && quota.remaining === 0) { yield* say(limitMsg()); return }
    const messages = history.filter(m => !m.local && m.text).map(m => ({ role: m.role === 'bot' ? 'assistant' : 'user', content: m.text }));
    let res;
    try { res = await fetch(API + 'chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ messages, ctx: window.asqTrack ? window.asqTrack.ctx() : {} }), signal }) }
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
          try { const j = JSON.parse(p), t = j.response ?? (j.choices && j.choices[0] && j.choices[0].delta && j.choices[0].delta.content) ?? ''; if (t) yield { type: 'token', text: t } } catch (e) { }
        }
      }
    } catch (e) { if (signal.aborted) return; throw e }
    yield { type: 'done', chips: ['What projects has Qasim built?', 'How can I contact him?'] };
  }

  /* ---------- rendering ---------- */
  const atEnd = () => scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight < 70;
  const toEnd = force => { if (force || stick) scroll.scrollTop = scroll.scrollHeight };
  scroll.addEventListener('scroll', () => { stick = atEnd(); down.hidden = stick || !hist.length }, { passive: true });
  down.onclick = () => scroll.scrollTo({ top: scroll.scrollHeight, behavior: reduce() ? 'auto' : 'smooth' });
  const stepHTML = t => `<div class="ai-step">${IC.check12}${esc(t)}</div>`;
  const cardsHTML = c => c && c.length ? `<div class="ai-cards">${c.map(x => {
    const internal = x.href[0] === '#', href = internal ? (PAGE ? ROOT + 'index.html' + x.href : x.href) : x.href;
    return `<a class="ai-card" href="${esc(href)}" ${internal && !PAGE ? 'data-go' : 'target="_blank" rel="noopener noreferrer"'}><b><span>${esc(x.title)}</span>${IC.out}</b>${x.meta ? `<small>${esc(x.meta)}</small>` : ''}${x.desc ? `<p>${esc(x.desc)}</p>` : ''}</a>`;
  }).join('')}</div>` : '';
  const chipsHTML = c => c && c.length ? `<div class="ai-chips">${c.map(x => `<button class="ai-chip" type="button" data-q="${esc(x)}">${esc(x)}</button>`).join('')}</div>` : '';
  const botShell = () => { const el = document.createElement('div'); el.className = 'ai-msg bot'; el.innerHTML = `${avatar}<div class="ai-body"><div class="ai-think"><span class="ai-dots"><i></i><i></i><i></i></span>Thinking…</div></div>`; return el };
  const userEl = text => { const el = document.createElement('div'); el.className = 'ai-msg user'; el.innerHTML = '<div class="ai-b"></div>'; el.firstChild.textContent = text; return el };
  function setLast() { msgs.querySelectorAll('.ai-msg.last').forEach(m => m.classList.remove('last')); const l = [...msgs.querySelectorAll('.ai-msg.bot')].pop(); if (l && !busy) l.classList.add('last') }
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
      `<div class="ai-text">${md(m.text)}${m.stopped ? '<span class="ai-stopped">Stopped</span>' : ''}</div>` + cardsHTML(m.cards) + (chips ? chipsHTML(m.chips) : '');
    if (m.text) actions(el, m);
  }
  const save = () => { try { sessionStorage.setItem(KEY, JSON.stringify(hist)) } catch (e) { } };

  async function answer() {
    busy = true; ctrl = new AbortController(); setMode(); welcome.hidden = true;
    const el = botShell(); msgs.appendChild(el); setLast(); stick = true; toEnd(true);
    const body = el.querySelector('.ai-body'), m = { role: 'bot', text: '' }; hist.push(m);
    let txt = null;
    try {
      for await (const ev of respond(hist.slice(0, -1), ctrl.signal)) {
        if (ev.type === 'step') { m.step = ev.text; body.innerHTML = `<div class="ai-step"><span class="ai-spin"></span>${esc(ev.text)}…</div><div class="ai-think"><span class="ai-dots"><i></i><i></i><i></i></span>Thinking…</div>` }
        if (ev.type === 'token') {
          if (!txt) { body.innerHTML = (m.step ? stepHTML(m.step) : '') + '<div class="ai-text live"></div>'; txt = body.querySelector('.ai-text') }
          m.text += ev.text; txt.innerHTML = md(m.text)
        }
        if (ev.type === 'done') { m.cards = ev.cards; m.chips = ev.chips; if (ev.local) m.local = true }
        toEnd();
      }
      m.stopped = ctrl.signal.aborted;
    } catch (err) { console.error(err); m.text = 'Something went wrong. Please try again.'; m.stopped = false }
    paintBot(el, m, !m.stopped);
    if (!m.text && m.stopped) el.querySelector('.ai-body').innerHTML = '<div class="ai-text"><span class="ai-stopped">Stopped</span></div>';
    live.textContent = m.text;
    busy = false; ctrl = null; setMode(); setLast(); toEnd(); save();
  }
  function ask(text) {
    text = text.trim(); if (!text || busy) return;
    msgs.querySelectorAll('.ai-chips').forEach(c => c.remove());
    hist.push({ role: 'user', text }); msgs.appendChild(userEl(text));
    ta.value = ''; grow(); save(); answer();
  }
  function regenerate() { const bots = msgs.querySelectorAll('.ai-msg.bot'), last = bots[bots.length - 1]; if (!last) return; last.remove(); hist.pop(); answer() }
  function reset() { if (ctrl) ctrl.abort(); hist = []; busy = false; msgs.innerHTML = ''; welcome.hidden = false; down.hidden = true; setMode(); ta.value = ''; grow(); scroll.scrollTop = 0; save(); ta.focus() }
  function restore() {
    let saved = []; try { saved = JSON.parse(sessionStorage.getItem(KEY) || '[]') } catch (e) { }
    if (!Array.isArray(saved) || !saved.length) return;
    hist = saved; welcome.hidden = true;
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
  $('#aiNew').onclick = reset;
  root.addEventListener('click', e => {
    if (!PAGE && (e.target === root || e.target.closest('[data-ai-close]'))) { root.close(); return }
    const q = e.target.closest('[data-q]'); if (q) { ask(q.dataset.q); return }
    const go = e.target.closest('a[data-go]');
    if (go) { e.preventDefault(); const t = document.getElementById(go.getAttribute('href').slice(1)); root.close(); if (t) setTimeout(() => (window.pfGoTo || (y => scrollTo({ top: y, behavior: 'smooth' })))(t.getBoundingClientRect().top + scrollY - 8), 60) }
  });

  /* ---------- open / close (pop-up only) and the page's theme button ---------- */
  function open(from) { opener = from || document.activeElement; if (!root.open) { root.showModal(); if (window.asqTrack) window.asqTrack.event('ai_open', 'popup') } load(); initBackend(); grow(); toEnd(true); setTimeout(() => ta.focus(), 30) }
  if (!PAGE) {
    document.querySelectorAll('[data-ai-open]').forEach(a => a.addEventListener('click', e => { e.preventDefault(); open(a) }));
    root.addEventListener('close', () => { if (opener && opener.focus) opener.focus() });
    addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'j') { e.preventDefault(); root.open ? root.close() : open() } });
  } else {
    $('#aiTheme').onclick = () => { const h = document.documentElement, n = h.dataset.theme === 'dark' ? 'light' : 'dark'; h.dataset.theme = n; try { localStorage.setItem('pf-theme', n) } catch (e) { } };
    load(); initBackend(); ta.focus();
  }
  restore(); setMode(); if (hist.length) setTimeout(() => toEnd(true), 0);
})();
