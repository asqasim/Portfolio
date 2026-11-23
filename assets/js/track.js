/* First-party analytics: sends small batches of events to /api/track (see ANALYTICS.md for every field).
   Respects Do Not Track and Global Privacy Control. Add ?asq_ignore=1 to any page URL once to exclude your own browser (?asq_ignore=0 turns it back on). */
(() => {
  'use strict';
  if (window.asqTrack) return;
  const LS = { get: k => { try { return localStorage.getItem(k) } catch (e) { return null } }, set: (k, v) => { try { localStorage.setItem(k, v) } catch (e) { } }, del: k => { try { localStorage.removeItem(k) } catch (e) { } } };
  const flag = new URLSearchParams(location.search).get('asq_ignore');
  if (flag === '1') LS.set('asq_ignore', '1'); else if (flag === '0') LS.del('asq_ignore');
  const dnt = navigator.doNotTrack === '1' || window.doNotTrack === '1' || navigator.globalPrivacyControl === true;
  const off = dnt || LS.get('asq_ignore') === '1';

  const rid = () => Array.from(crypto.getRandomValues(new Uint8Array(12)), b => b.toString(16).padStart(2, '0')).join('');
  let vid = LS.get('asq_vid'); if (!/^[a-f0-9]{24}$/.test(vid || '')) { vid = rid(); LS.set('asq_vid', vid) }
  let sid; const IDLE = 30 * 60e3;
  const session = () => {                                           // a visit ends after 30 idle minutes
    let s = null; try { s = JSON.parse(LS.get('asq_sid')) } catch (e) { }
    const now = Date.now();
    if (!s || !/^[a-f0-9]{24}$/.test(s.id || '') || now - s.t > IDLE) s = { id: rid(), t: now };
    s.t = now; LS.set('asq_sid', JSON.stringify(s)); sid = s.id;
  };
  session();

  const api = { off, vid, get sid() { return sid }, ctx: () => (off ? { ignore: true } : { vid, sid, page: pagePath(), ignore: false }), event: () => { }, trail: () => [] };
  window.asqTrack = api;
  if (off) return;

  /* ---------- helpers ---------- */

  const DROP = /^(utm_|fbclid|gclid|ref$|asq_)/;
  function pagePath() {
    const q = new URLSearchParams(location.search); for (const k of [...q.keys()]) if (DROP.test(k)) q.delete(k);
    const s = q.toString(); return location.pathname + (s ? '?' + s : '');
  }
  const clip = (s, n) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, n);

  /* ---------- the visit trail: a short list of what this visitor looked at, kept only in this browser ----------
     ASQ Ai reads it (api.trail()) so it can put relevant projects first. It is sent only with a chat message, and not at all when
     tracking is off. It expires 3 hours after the last entry. */
  const TRAIL = 'asq_trail', TRAIL_KINDS = { pageview: 1, search: 1, filter: 1, section: 1, outbound: 1, download: 1 };
  const readTrail = () => { try { const o = JSON.parse(LS.get(TRAIL)); return o && Date.now() - o.t < 3 * 3600e3 && Array.isArray(o.e) ? o.e : [] } catch (e) { return [] } };
  function remember(type, label, target) {
    if (!TRAIL_KINDS[type]) return;
    const path = pagePath(); if (/^\/ai(\.html)?\/?(\?|$)/.test(path)) return;      // the chat page itself says nothing about interests
    const e = { k: type, p: type === 'pageview' ? path : '', l: clip(label, 60), g: target ? clip(target, 120) : '', t: Date.now() }, list = readTrail(), last = list[list.length - 1];
    if (last && last.k === e.k && last.p === e.p && last.l === e.l && last.g === e.g) return;
    list.push(e); LS.set(TRAIL, JSON.stringify({ t: Date.now(), e: list.slice(-30) }));
  }
  api.trail = () => readTrail();
  const t0 = Date.now();
  let queue = [], first = true, activeMs = 0, sentActive = 0, sentScroll = 0, lastInput = Date.now(), maxScroll = 0, count = 0, perfSent = false, errors = 0;

  function push(type, label, meta, target, section, at, value) {
    if (count++ > 400) return;
    session();
    remember(type, label, target);
    queue.push({ t: type, at: at || Date.now(), p: pagePath(), l: label == null ? undefined : clip(label, 120), tg: target ? clip(target, 200) : undefined, s: section || undefined, v: value, m: meta });
    if (queue.length >= 15) flush();
  }
  api.event = (type, label, meta, target) => push(type, label, meta, target, undefined);

  function flush(beacon) {
    if (!queue.length) return;
    const now = Date.now(), batch = queue.splice(0, 30).map(e => ({ t: e.t, ago: Math.max(0, now - e.at), p: e.p, l: e.l, tg: e.tg, s: e.s, v: e.v, m: e.m }));
    const body = { v: 1, vid, sid, events: batch };
    if (first) { body.ctx = context(); first = false }
    const json = JSON.stringify(body);
    try {
      if (beacon && navigator.sendBeacon) navigator.sendBeacon('/api/track', new Blob([json], { type: 'application/json' }));
      else fetch('/api/track', { method: 'POST', headers: { 'content-type': 'application/json' }, body: json, keepalive: true }).catch(() => { });
    } catch (e) { }
    if (queue.length) flush(beacon);
  }

  function context() {
    const q = new URLSearchParams(location.search), c = navigator.connection || {};
    return { u: pagePath(), r: document.referrer || '', ref: q.get('ref') || '', us: q.get('utm_source') || '', um: q.get('utm_medium') || '', uc: q.get('utm_campaign') || '',
      sc: screen.width + 'x' + screen.height, vp: innerWidth + 'x' + innerHeight, dpr: window.devicePixelRatio || 1, l: navigator.language || '', ls: (navigator.languages || []).slice(0, 3).join(','),
      tch: navigator.maxTouchPoints > 0 ? 1 : 0, cs: matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light', th: document.documentElement.dataset.theme || '',
      cn: c.effectiveType ? c.effectiveType + (c.saveData ? '+save' : '') : '' };
  }

  /* ---------- page view ---------- */
  push('pageview', document.title);

  /* ---------- clicks, outbound links, downloads, contact intent ---------- */
  const labelOf = el => clip(el.getAttribute('data-track') || el.getAttribute('aria-label') || (el.querySelector('h1,h2,h3,h4') || {}).textContent || el.getAttribute('title') ||
    el.innerText || el.textContent || el.id || (el.querySelector('img') || {}).alt || el.tagName.toLowerCase(), 80);
  const sectionOf = el => { const s = el.closest('[data-section],section[id],footer[id]'); if (s) return s.dataset.section || s.id; if (el.closest('dialog,.ai')) return 'ai-chat'; if (el.closest('nav,header')) return 'nav'; return undefined };
  let recent = [];
  document.addEventListener('click', e => {
    const now = Date.now(); recent = recent.filter(c => now - c.t < 800); recent.push({ t: now, x: e.clientX, y: e.clientY });
    if (recent.length >= 3 && recent.every(c => Math.abs(c.x - e.clientX) < 30 && Math.abs(c.y - e.clientY) < 30)) { recent = []; push('rage_click', labelOf(e.target.closest('a,button') || e.target), { x: Math.round(e.pageX), y: Math.round(e.pageY) }, undefined, sectionOf(e.target)) }
    const el = e.target.closest && e.target.closest('a,button,summary,[role="button"],[data-track],input[type="submit"]'); if (!el) return;
    const meta = { x: Math.round((e.pageX / Math.max(1, document.documentElement.scrollWidth)) * 1000) / 10, y: Math.round(e.pageY) };
    let type = 'click', target = '', label = labelOf(el);
    if (el.id === 'copyMail') { type = 'copy'; label = 'email'; meta.cv = 1 }
    else if (el.tagName === 'A' && el.getAttribute('href')) {
      const href = el.getAttribute('href');
      if (/^mailto:/i.test(href)) { type = 'outbound'; target = 'mailto'; meta.cv = 1 }
      else if (/^tel:/i.test(href)) { type = 'outbound'; target = 'tel'; meta.cv = 1 }
      else { let u; try { u = new URL(el.href, location.href) } catch (x) { u = null }
        if (u && u.origin !== location.origin) { type = 'outbound'; target = u.host.replace(/^www\./, '') + (u.pathname === '/' ? '' : u.pathname); if (/(^|\.)wa\.me$/.test(u.host)) meta.cv = 1 }
        else if (u && /\.(pdf|docx?|xlsx?|zip|csv)$/i.test(u.pathname)) { type = 'download'; target = u.pathname; if (/resume|cv/i.test(u.pathname)) meta.cv = 1 }
        else if (u) target = u.pathname + u.search + u.hash }
    }
    push(type, label, meta, target, sectionOf(el));
  }, true);

  /* ---------- searches, filters, forms, copy, video, errors ---------- */
  let st; document.addEventListener('input', e => {
    const el = e.target; if (!el.matches || !el.matches('input[type="search"],input[data-track-search]')) return;
    clearTimeout(st); st = setTimeout(() => { const v = clip(el.value, 80); if (v.length >= 2) push('search', v, undefined, undefined, sectionOf(el)) }, 900);
  });
  document.addEventListener('change', e => { const el = e.target; if (el.matches && el.matches('select')) push('filter', el.id || el.name || 'select', undefined, el.value, sectionOf(el)) });
  const isContact = f => !!f && (f.id === 'contactForm' || f.hasAttribute('data-track-form'));          // only the contact form counts (not the AI chat box)
  let formStarted = false;
  document.addEventListener('focusin', e => { const f = e.target.closest && e.target.closest('form'); if (isContact(f) && !formStarted && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName) && !e.target.matches('input[type="search"]')) { formStarted = true; push('form_start', f.id || 'form', undefined, undefined, sectionOf(f)) } });
  document.addEventListener('submit', e => { const f = e.target; if (isContact(f)) { push('form_submit', f.id || 'form', { cv: 1 }, undefined, sectionOf(f)); flush() } }, true);
  document.addEventListener('copy', () => { const n = String(getSelection() || '').length; push('copy', 'selection', { len: n }) });
  document.addEventListener('play', e => { if (e.target.tagName === 'VIDEO') push('media', 'play', undefined, (e.target.currentSrc || '').split('/').pop()) }, true);
  const onErr = (msg, src, line) => { if (errors++ < 5) push('error', msg, { src: clip(src, 100), line: line || 0 }) };
  addEventListener('error', e => onErr(e.message || 'error', e.filename, e.lineno));
  addEventListener('unhandledrejection', e => onErr('promise: ' + clip(e.reason && (e.reason.message || e.reason), 100)));

  /* ---------- time on page, scroll depth, sections ---------- */
  ['pointermove', 'keydown', 'scroll', 'touchstart', 'click'].forEach(n => addEventListener(n, () => { lastInput = Date.now() }, { passive: true, capture: true }));
  setInterval(() => { if (document.visibilityState === 'visible' && Date.now() - lastInput < 15000) activeMs += 1000 }, 1000);
  let raf; addEventListener('scroll', () => { if (raf) return; raf = requestAnimationFrame(() => { raf = 0; const h = document.documentElement.scrollHeight; if (h > 0) maxScroll = Math.max(maxScroll, Math.min(100, Math.round(((scrollY + innerHeight) / h) * 100))) }) }, { passive: true });

  const seen = new Map();                                           // section id -> time it came into view
  const closeSection = (id, now) => { const s = seen.get(id); if (s == null) return; seen.delete(id); const d = now - s; if (d >= 1500) push('section', id, undefined, undefined, id, s, d) };
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(es => es.forEach(en => {
      const id = en.target.dataset.section || en.target.id, now = Date.now();
      const vis = en.isIntersecting && (en.intersectionRatio >= 0.3 || en.intersectionRect.height >= innerHeight * 0.4);
      if (vis) { if (!seen.has(id)) seen.set(id, now) } else closeSection(id, now);
    }), { threshold: [0, 0.1, 0.2, 0.3, 0.5, 0.75, 1] });
    document.querySelectorAll('section[id],footer[id],[data-section]').forEach(el => io.observe(el));
  }

  /* ---------- speed (Core Web Vitals-style) ---------- */
  let lcp = 0, cls = 0, fcp = 0;
  try { new PerformanceObserver(l => { for (const e of l.getEntries()) lcp = e.startTime }).observe({ type: 'largest-contentful-paint', buffered: true }) } catch (e) { }
  try { new PerformanceObserver(l => { for (const e of l.getEntries()) if (!e.hadRecentInput) cls += e.value }).observe({ type: 'layout-shift', buffered: true }) } catch (e) { }
  try { new PerformanceObserver(l => { for (const e of l.getEntries()) if (e.name === 'first-contentful-paint') fcp = e.startTime }).observe({ type: 'paint', buffered: true }) } catch (e) { }
  const sendPerf = () => {
    if (perfSent) return; const n = (performance.getEntriesByType('navigation') || [])[0]; if (!n || !n.loadEventEnd) return; perfSent = true;
    push('perf', 'page', { ttfb: Math.round(n.responseStart), fcp: Math.round(fcp), dcl: Math.round(n.domContentLoadedEventEnd), load: Math.round(n.loadEventEnd), cls: Math.round(cls * 1000) / 1000, kb: Math.round((n.transferSize || 0) / 1024) }, undefined, undefined, undefined, Math.round(lcp));
  };

  /* ---------- leaving ---------- */
  function leave() {
    const now = Date.now(), d = activeMs - sentActive; sentActive = activeMs;
    for (const id of [...seen.keys()]) { const s = seen.get(id); closeSection(id, now); seen.set(id, now) }   // close the visible ones, keep counting if the tab returns
    sendPerf();
    if (d > 0 || maxScroll > sentScroll) { sentScroll = maxScroll; push('leave', undefined, { scroll: maxScroll, total: now - t0 }, undefined, undefined, undefined, d) }
    flush(true);
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') leave() });
  addEventListener('pagehide', leave);
  setInterval(() => flush(), 5000);
})();
