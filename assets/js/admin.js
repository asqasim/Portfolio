/* admin.html: the analytics panel. All data comes from /api/admin/* (needs the login cookie). No inline styles anywhere (strict CSP). */
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nf = n => (n == null || n === '' ? '–' : Number(n).toLocaleString());
  const pct = (a, b) => (b ? Math.round((a / b) * 100) + '%' : '–');
  const dur = ms => { ms = Math.round((ms || 0) / 1000); return ms < 60 ? ms + 's' : ms < 3600 ? Math.floor(ms / 60) + 'm ' + (ms % 60) + 's' : Math.floor(ms / 3600) + 'h ' + Math.floor((ms % 3600) / 60) + 'm' };
  const when = ts => new Date(ts).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  const clock = ts => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  let regions; try { regions = new Intl.DisplayNames(['en'], { type: 'region' }) } catch (e) { }
  const country = cc => (cc ? `${esc(cc)}${regions ? ' · ' + esc((() => { try { return regions.of(cc) } catch (e) { return '' } })()) : ''}` : '–');
  const where = s => [s.city, s.country].filter(Boolean).map(esc).join(', ') || '–';
  const vshort = v => (v || '').slice(0, 6);
  const DAY = 864e5, tzOff = -new Date().getTimezoneOffset();
  const jparse = s => { try { return JSON.parse(s) } catch (e) { return {} } };
  const toast = m => { const t = $('#toast'); t.textContent = m; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => t.hidden = true, 2600) };
  const fit = root => root.querySelectorAll('[data-w]').forEach(e => { e.style.width = e.dataset.w + '%' });   // widths via CSSOM (inline style attributes are blocked by CSP)

  /* ---------- API ---------- */
  async function api(path, params, opts = {}) {
    const qs = params ? '?' + new URLSearchParams(Object.entries(params).filter(([, v]) => v !== '' && v != null && v !== false)) : '';
    const r = await fetch('/api/admin/' + path + qs, { method: opts.method || 'GET', credentials: 'same-origin',
      headers: { 'X-Requested-With': 'asq-admin', ...(opts.body ? { 'content-type': 'application/json' } : {}) }, body: opts.body ? JSON.stringify(opts.body) : undefined });
    const j = await r.json().catch(() => ({}));
    if (r.status === 401 && path !== 'login') { showLogin(); throw new Error('unauthorized') }
    if (!r.ok) { const e = new Error(j.message || j.error || 'Error ' + r.status); e.status = r.status; throw e }
    return j;
  }

  /* ---------- login ---------- */
  function showLogin() { $('#app').hidden = true; $('#login').hidden = false; $('#lgKey').focus() }
  $('#lgForm').addEventListener('submit', async e => {
    e.preventDefault(); const err = $('#lgErr'); err.textContent = '';
    try { await api('login', null, { method: 'POST', body: { key: $('#lgKey').value, code: $('#lgCode').value } }); $('#lgKey').value = ''; $('#lgCode').value = ''; start() }
    catch (x) { err.textContent = x.message; $('#lgCode').value = '' }
  });
  $('#logoutBtn').addEventListener('click', async () => { try { await api('logout', null, { method: 'POST' }) } catch (e) { } showLogin() });
  $('#themeBtn').addEventListener('click', () => { const d = document.documentElement, n = d.dataset.theme === 'dark' ? 'light' : 'dark'; d.dataset.theme = n; try { localStorage.setItem('pf-theme', n) } catch (e) { } });

  const setUnread = n => { const b = $('#unread'); b.textContent = n; b.hidden = !n };
  const refreshUnread = () => api('me').then(m => setUnread(m.unread || 0)).catch(() => { });

  /* ---------- UI pieces ---------- */
  const kpi = (label, value, sub) => `<div class="card kpi"><span>${label}</span><b>${value}</b>${sub ? `<i>${sub}</i>` : ''}</div>`;
  function barList(title, rows, { label = r => r.k, value = r => r.visits, fmt = nf, sub = '', empty = 'No data yet' } = {}) {
    const max = Math.max(1, ...rows.map(value));
    return `<div class="card"><h3>${title}${sub ? `<small>${sub}</small>` : ''}</h3>` + (rows.length ? `<ul class="bl">${rows.map(r =>
      `<li><span class="n" title="${esc(label(r))}">${label(r) || '<span class="muted">(none)</span>'}</span><span class="v">${fmt(value(r))}</span><span class="bar"><i data-w="${(value(r) / max * 100).toFixed(1)}"></i></span></li>`).join('')}</ul>` : `<div class="empty">${empty}</div>`) + '</div>';
  }
  function bars(items, { w = 720, h = 150, two = false } = {}) {                 // grouped SVG bars; items = [{label, a, b, tip}]
    const max = Math.max(1, ...items.map(i => Math.max(i.a, two ? i.b : 0))), n = items.length || 1, pad = 18, bw = (w - 10) / n, gw = Math.max(2, bw * (two ? .38 : .7));
    const every = Math.ceil(n / 14);
    return `<svg class="chart" viewBox="0 0 ${w} ${h + pad}" role="img">` + `<line class="ax" x1="0" x2="${w}" y1="${h}" y2="${h}"/>` + items.map((it, i) => {
      const x = 5 + i * bw, ha = it.a / max * (h - 6), hb = two ? it.b / max * (h - 6) : 0;
      return `<g><title>${esc(it.tip || it.label)}</title><rect class="b1" x="${(x + (two ? bw * .08 : bw * .15)).toFixed(1)}" y="${(h - ha).toFixed(1)}" width="${gw.toFixed(1)}" height="${ha.toFixed(1)}" rx="2"/>` +
        (two ? `<rect class="b2" x="${(x + bw * .08 + gw + 1).toFixed(1)}" y="${(h - hb).toFixed(1)}" width="${gw.toFixed(1)}" height="${hb.toFixed(1)}" rx="2"/>` : '') +
        (i % every === 0 ? `<text x="${(x + bw / 2).toFixed(1)}" y="${h + 13}" text-anchor="middle">${esc(it.label)}</text>` : '') + '</g>';
    }).join('') + '</svg>';
  }
  function table(cols, rows, { onclick = false, empty = 'Nothing here yet' } = {}) {
    if (!rows.length) return `<div class="empty">${empty}</div>`;
    return `<div class="tw"><table><thead><tr>${cols.map(c => `<th class="${c.num ? 'num' : ''}">${c.h}</th>`).join('')}</tr></thead><tbody>` +
      rows.map((r, i) => `<tr class="${onclick ? 'click' : ''}" data-i="${i}">${cols.map(c => `<td class="${c.num ? 'num' : ''} ${c.wrap ? 'wrap' : ''}">${c.f(r)}</td>`).join('')}</tr>`).join('') + '</tbody></table></div>';
  }
  const pager = (total, limit, offset) => `<div class="pager"><button class="btn sm" data-pg="${Math.max(0, offset - limit)}" ${offset ? '' : 'disabled'}>← Newer</button>
    <span>${total ? offset + 1 : 0}–${Math.min(offset + limit, total)} of ${nf(total)}</span><button class="btn sm" data-pg="${offset + limit}" ${offset + limit < total ? '' : 'disabled'}>Older →</button></div>`;

  /* ---------- date range ---------- */
  let rng = { p: '7d' };
  const PRESETS = { '24h': 1, '7d': 7, '30d': 30, '90d': 90 };
  const rangeParams = () => ({ from: Date.now() - PRESETS[rng.p] * DAY, to: Date.now(), tz: tzOff });
  const pills = () => `<div class="pills" role="group" aria-label="Date range">${Object.keys(PRESETS).map(k => `<button data-r="${k}" class="${rng.p === k ? 'on' : ''}">${k === '24h' ? '24 hours' : k.replace('d', ' days')}</button>`).join('')}</div>`;
  function bindPills(root, again) { root.querySelectorAll('[data-r]').forEach(b => b.addEventListener('click', () => { rng.p = b.dataset.r; again() })) }

  /* ---------- views ---------- */
  const views = {};
  const main = $('#main');
  const loading = () => { main.innerHTML = '<p class="muted">Loading…</p>' };
  const fail = e => { if (e.message !== 'unauthorized') main.innerHTML = `<div class="card"><h3>Couldn’t load</h3><p class="err">${esc(e.message)}</p></div>` };

  views.overview = async () => {
    loading(); let s; try { s = await api('summary', rangeParams()) } catch (e) { return fail(e) }
    const t = s.totals, c = s.chats, f = s.funnel, days = PRESETS[rng.p];
    $('#live').textContent = `${s.live.n} active now`; $('#live').classList.toggle('on', s.live.n > 0);
    const byDay = new Map(s.daily.map(d => [d.d, d])), series = [];
    if (days > 1) for (let i = days - 1; i >= 0; i--) { const dt = new Date(Date.now() - i * DAY), k = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`, d = byDay.get(k) || {};
      series.push({ label: k.slice(5), a: d.visits || 0, b: d.visitors || 0, tip: `${k}: ${d.visits || 0} visits, ${d.visitors || 0} visitors, ${d.pageviews || 0} pageviews, ${d.ai || 0} AI messages` }) }
    const hrs = Array.from({ length: 24 }, (_, h) => ({ label: String(h), a: (s.hours.find(x => x.k === h) || {}).visits || 0, tip: '' })).map(x => ({ ...x, tip: `${x.label}:00 → ${x.a} visits` }));
    const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((n, i) => { const v = (s.weekdays.find(x => x.k === i) || {}).visits || 0; return { label: n, a: v, tip: `${n}: ${v} visits` } });
    const steps = [['Visited', f.visits], ['Reached Projects section', f.saw_projects], ['Opened a project page', f.viewed_project], ['Opened ASQ Ai', f.opened_ai], ['Sent an AI message', f.sent_ai], ['Contact intent*', f.converted]];
    main.innerHTML = `<div class="head"><h2>Overview</h2>${pills()}<span class="grow"></span><button class="btn" id="rf">Refresh</button></div>
      <div class="grid kpis">${kpi('Visits', nf(t.visits), `${nf(t.visitors)} unique visitors`)}${kpi('Pageviews', nf(t.pageviews), `${(t.avg_pages || 0).toFixed(1)} per visit`)}
        ${kpi('New vs returning', pct(s.new_visitors.n, t.visitors) + ' new', `${nf(t.returning_sessions)} return visits`)}${kpi('Avg active time', dur(t.avg_active_ms), `scroll depth ${Math.round(t.avg_scroll || 0)}%`)}
        ${kpi('Bounce rate', pct(t.bounces, t.visits), 'one page, no click')}${kpi('Clicks', nf(t.clicks), `${t.visits ? (t.clicks / t.visits).toFixed(1) : 0} per visit`)}
        ${kpi('AI users', pct(t.ai_sessions, t.visits), `${nf(t.ai_msgs)} messages · ${nf(c.askers)} people`)}${kpi('Contact intent', nf(t.converted), pct(t.converted, t.visits) + ' of visits')}${kpi('Messages received', nf(s.messages.total), s.messages.unread ? s.messages.unread + ' unread' : 'all read')}</div>
      <div class="card"><h3>Visits per day <small>days in your local time</small></h3>${days > 1 ? bars(series, { two: true }) + '<div class="legend"><span><i class="l1"></i>visits</span><span><i class="l2"></i>unique visitors</span></div>' : '<div class="empty">Pick 7 days or more for the daily chart.</div>'}</div>
      <div class="grid two mt"><div class="card"><h3>Busiest hours <small>your local time</small></h3>${bars(hrs, { h: 110 })}</div><div class="card"><h3>Weekdays</h3>${bars(wd, { h: 110 })}</div></div>
      <div class="card"><h3>Journey funnel <small>share of visits</small></h3><div class="funnel">${steps.map(([n, v]) => `<div><span>${n}</span><span class="bar"><i data-w="${f.visits ? (v / f.visits * 100).toFixed(1) : 0}"></i></span><span class="v">${nf(v)} · ${pct(v, f.visits)}</span></div>`).join('')}</div>
        <p class="muted mt0">*Contact intent = email/WhatsApp click, copied email, contact form submit or resume download.</p></div>
      <div class="grid three mt">
        ${barList('Countries', s.countries, { label: r => country(r.k) })}${barList('Cities', s.cities, { label: r => esc(r.k) + ' <span class="muted">' + esc(r.country || '') + '</span>' })}
        ${barList('Traffic sources', s.sources)}${barList('Pages viewed', s.pages, { value: r => r.n, label: r => esc(r.k) })}
        ${barList('Most clicked', s.clicks, { value: r => r.n, label: r => esc(r.k) + (r.section ? ' <span class="muted">· ' + esc(r.section) + '</span>' : '') })}
        ${barList('Sections: reach', s.sections, { value: r => r.reach, label: r => esc(r.k), fmt: v => nf(v) + ' visits' })}
        ${barList('Sections: avg time in view', s.sections, { value: r => r.avg_ms, label: r => esc(r.k), fmt: dur })}
        ${barList('Outbound links', s.outbound, { value: r => r.n, label: r => esc(r.k) })}${barList('Downloads', s.downloads, { value: r => r.n, label: r => esc(r.k) })}
        ${barList('Searches on the site', s.searches, { value: r => r.n, label: r => esc(r.k) })}${barList('Filters used', s.filters, { value: r => r.n, label: r => esc(r.k) })}
        ${barList('Landing pages', s.landing, { label: r => esc(r.k) })}${barList('Referrers', s.referrers, { label: r => esc(r.k) })}
        ${barList('Devices', s.devices)}${barList('Browsers', s.browsers)}${barList('Operating systems', s.os)}
        ${barList('Languages', s.langs)}${barList('Screen sizes', s.screens)}${barList('Time zones', s.tzs)}${barList('Internet providers', s.isps, { label: r => esc(r.k) })}
        ${barList('Top AI questions', s.questions, { value: r => r.n, label: r => esc(r.k), sub: `${nf(c.total)} total` })}
        ${barList('JS errors', s.errors, { value: r => r.n, label: r => esc(r.k) + ' <span class="muted">' + esc(r.path || '') + '</span>', empty: 'None 🎉' })}${barList('Rage clicks', s.rage, { value: r => r.n, label: r => esc(r.k) + ' <span class="muted">' + esc(r.path || '') + '</span>', empty: 'None' })}</div>
      <div class="card"><h3>AI assistant</h3><p class="m0">${nf(c.total)} messages: <span class="tag ok">${nf(c.ok)} answered</span> <span class="tag warn">${nf(c.limited)} hit the daily limit</span> <span class="tag">${nf(c.busy)} busy</span> <span class="tag bad">${nf(c.errors)} errors</span> · avg reply ${((c.avg_ms || 0) / 1000).toFixed(1)}s · avg length ${Math.round(c.avg_chars || 0)} chars</p></div>
      <div class="card mt"><h3>Page speed <small>averages per page</small></h3>${table([{ h: 'Page', f: r => esc(r.k) }, { h: 'Loads', num: 1, f: r => nf(r.n) }, { h: 'Time to first byte', num: 1, f: r => Math.round(r.ttfb || 0) + ' ms' }, { h: 'Largest paint (LCP)', num: 1, f: r => Math.round(r.lcp || 0) + ' ms' }, { h: 'Fully loaded', num: 1, f: r => Math.round(r.load || 0) + ' ms' }, { h: 'Layout shift', num: 1, f: r => (r.cls || 0).toFixed(3) }], s.perf)}</div>`;
    fit(main); bindPills(main, views.overview); $('#rf').addEventListener('click', views.overview);
  };

  /* ----- visitors list + journey ----- */
  let vf = { q: '', source: '', device: '', converted: false, ai: false, returning: false, offset: 0 };
  views.visitors = async () => {
    loading(); let r; try { r = await api('sessions', { ...rangeParams(), ...vf, converted: vf.converted ? 1 : '', ai: vf.ai ? 1 : '', returning: vf.returning ? 1 : '', limit: 50 }) } catch (e) { return fail(e) }
    main.innerHTML = `<div class="head"><h2>Visitors</h2>${pills()}</div>
      <div class="bar-tools"><input id="vq" placeholder="Search city, country, source, page, ID…" value="${esc(vf.q)}" size="34"><select id="vdev"><option value="">All devices</option>${['desktop', 'mobile', 'tablet'].map(d => `<option ${vf.device === d ? 'selected' : ''}>${d}</option>`).join('')}</select>
        <label class="chk"><input type="checkbox" id="vc" ${vf.converted ? 'checked' : ''}> contact intent</label><label class="chk"><input type="checkbox" id="va" ${vf.ai ? 'checked' : ''}> used AI</label><label class="chk"><input type="checkbox" id="vr" ${vf.returning ? 'checked' : ''}> returning</label>
        ${vf.source ? `<button class="btn sm" id="vs">source: ${esc(vf.source)} ✕</button>` : ''}</div>
      ${table([{ h: 'When', f: s => when(s.started) }, { h: 'Visitor', f: s => `<span class="mono">${vshort(s.vid)}</span>${s.visit_no > 1 ? ` <span class="tag">visit #${s.visit_no}</span>` : ' <span class="tag acc">new</span>'}` },
        { h: 'Where', f: s => where(s) }, { h: 'Source', f: s => `${esc(s.source)}${s.campaign ? ' <span class="muted">· ' + esc(s.campaign) + '</span>' : ''}` }, { h: 'Device', f: s => `${esc(s.device)} · ${esc(s.browser)} · ${esc(s.os)}` },
        { h: 'Landing', f: s => esc(s.landing) }, { h: 'Pages', num: 1, f: s => s.pageviews }, { h: 'Clicks', num: 1, f: s => s.clicks }, { h: 'Active', num: 1, f: s => dur(s.active_ms) },
        { h: 'AI', num: 1, f: s => s.ai_msgs || '' }, { h: '', f: s => (s.converted ? '<span class="tag ok">contact</span>' : '') }], r.rows, { onclick: true, empty: 'No visits match.' })}${pager(r.total, r.limit, r.offset)}`;
    bindPills(main, () => { vf.offset = 0; views.visitors() });
    const re = () => { vf.offset = 0; views.visitors() };
    let tm; $('#vq').addEventListener('input', e => { clearTimeout(tm); tm = setTimeout(() => { vf.q = e.target.value.trim(); re() }, 400) });
    $('#vdev').addEventListener('change', e => { vf.device = e.target.value; re() });
    [['#vc', 'converted'], ['#va', 'ai'], ['#vr', 'returning']].forEach(([id, k]) => $(id).addEventListener('change', e => { vf[k] = e.target.checked; re() }));
    if ($('#vs')) $('#vs').addEventListener('click', () => { vf.source = ''; re() });
    main.querySelectorAll('tbody tr').forEach(tr => tr.addEventListener('click', () => openJourney({ sid: r.rows[tr.dataset.i].sid })));
    main.querySelectorAll('[data-pg]').forEach(b => b.addEventListener('click', () => { vf.offset = +b.dataset.pg; views.visitors() }));
  };

  const CHIP = { pageview: 'page', click: 'click', outbound: 'link', download: 'file', search: 'search', filter: 'filter', copy: 'copy', form_start: 'form', form_submit: 'form', media: 'video', rage_click: 'rage', error: 'error', perf: 'speed', section: 'section', leave: 'exit', ai_open: 'ai', chat: 'ai chat' };
  const TECH = new Set(['perf', 'section']);
  function describe(e) {
    const m = jparse(e.meta), L = e.label ? `“${esc(e.label)}”` : '', sec = e.section ? ` <small>in ${esc(e.section)}</small>` : '';
    switch (e.type) {
      case 'pageview': return `Opened <b>${esc(e.path)}</b>${e.label ? ` <small>${esc(e.label)}</small>` : ''}`;
      case 'click': return `Clicked ${L}${sec}${e.target ? ` <small>→ ${esc(e.target)}</small>` : ''}`;
      case 'outbound': return `Clicked external link ${L}${sec} <small>→ ${esc(e.target)}</small>`;
      case 'download': return `Downloaded <b>${esc(e.target)}</b>${sec}`;
      case 'search': return `Searched ${L} <small>on ${esc(e.path)}</small>`;
      case 'filter': return `Changed filter <b>${esc(e.label)}</b> to <b>${esc(e.target)}</b>`;
      case 'copy': return e.label === 'email' ? 'Copied the email address' : `Copied text <small>(${m.len || 0} characters)</small>`;
      case 'form_start': return 'Started filling the contact form';
      case 'form_submit': return 'Submitted the contact form';
      case 'media': return `Played video <small>${esc(e.target)}</small>`;
      case 'rage_click': return `Rage-clicked ${L}${sec}`;
      case 'error': return `JavaScript error: ${esc(e.label)}`;
      case 'perf': return `Page speed: LCP ${e.value || 0} ms · loaded ${m.load || 0} ms · layout shift ${m.cls || 0}`;
      case 'section': return `Viewed <b>${esc(e.label)}</b> section for ${dur(e.value)}`;
      case 'leave': return `Left <b>${esc(e.path)}</b> after ${dur(e.value)} active · scrolled ${m.scroll || 0}%`;
      case 'ai_open': return 'Opened the ASQ Ai chat';
      default: return esc(e.type);
    }
  }
  const isConv = e => e.type === 'form_submit' || (e.meta && /"cv":1/.test(e.meta));
  async function openJourney(q) {
    const dr = $('#drawer'); dr.hidden = false; $('#drBody').innerHTML = '<p class="muted">Loading…</p>'; $('#drTitle').textContent = q.vid ? 'Visitor ' + vshort(q.vid) : 'Visit';
    let j; try { j = await api('journey', q) } catch (e) { $('#drBody').innerHTML = `<p class="err">${esc(e.message)}</p>`; return }
    const render = () => {
      const tech = $('#drTech').checked, byS = new Map(j.sessions.map(s => [s.sid, { s, items: [] }]));
      j.events.forEach(e => { if (byS.has(e.sid) && (tech || !TECH.has(e.type))) byS.get(e.sid).items.push({ ts: e.ts, e }) });
      j.chats.forEach(c => { if (byS.has(c.sid)) byS.get(c.sid).items.push({ ts: c.ts, c }) });
      (j.messages || []).forEach(m => { if (byS.has(m.sid)) byS.get(m.sid).items.push({ ts: m.ts, m }) });
      const vid = j.sessions[0] && j.sessions[0].vid;
      $('#drBody').innerHTML = (q.sid && vid ? `<p><button class="btn sm" id="allv">Show all visits of visitor ${vshort(vid)}</button></p>` : '') + [...byS.values()].map(({ s, items }) => {
        items.sort((a, b) => a.ts - b.ts);
        return `<section class="sess"><div class="sess-h"><b>${when(s.started)} · ${where(s)}</b><span>${esc(s.device)} · ${esc(s.browser)} ${esc(s.browser_v || '')} · ${esc(s.os)} ${esc(s.os_v || '')} · ${esc(s.screen || '')} · ${esc(s.lang || '')}${s.in_app ? ' · in-app: ' + esc(s.in_app) : ''}<br>
          Source: <b>${esc(s.source)}</b> (${esc(s.via || '')})${s.referrer ? ' from ' + esc(s.referrer) : ''}${s.campaign ? ' · campaign ' + esc(s.campaign) : ''} · visit #${s.visit_no} · ${esc(s.isp || '')} · ${esc(s.tz || '')}<br>
          ${s.pageviews} pages · ${s.clicks} clicks · ${dur(s.active_ms)} active · scrolled ${s.max_scroll}% · ID <span class="mono">${esc(s.sid)}</span></span></div>
          <ul class="tl">${items.map(({ ts, e, c, m }) => m
            ? `<li><time>${clock(ts)}</time><span class="dot conv"></span><div class="t"><span class="tag ok">message</span> Sent you a message as <b>${esc(m.name)}</b> <small>(${esc(m.email)})</small><details open><summary>Message</summary><div class="qa">${esc(m.message)}</div></details></div></li>`
            : c
            ? `<li><time>${clock(ts)}</time><span class="dot chat"></span><div class="t"><span class="tag acc">ai chat</span> Asked ASQ Ai${c.status !== 'ok' ? ` <span class="tag warn">${esc(c.status)}</span>` : ''}: <b>“${esc(c.question)}”</b><details><summary>Reply${c.total_ms ? ` · ${(c.total_ms / 1000).toFixed(1)}s` : ''}</summary><div class="qa">${esc(c.answer || '(no answer)')}</div></details></div></li>`
            : `<li><time>${clock(ts)}</time><span class="dot ${isConv(e) ? 'conv' : e.type}"></span><div class="t"><span class="tag">${CHIP[e.type] || esc(e.type)}</span> ${describe(e)}</div></li>`).join('') || '<li><div class="t muted">No events</div></li>'}</ul></section>`;
      }).join('') || '<p class="muted">No data (it may have been deleted).</p>';
      if ($('#allv')) $('#allv').addEventListener('click', () => openJourney({ vid }));
    };
    $('#drTech').onchange = render; render();
  }
  $('#drClose').addEventListener('click', () => { $('#drawer').hidden = true });
  addEventListener('keydown', e => { if (e.key === 'Escape') $('#drawer').hidden = true });

  /* ----- AI chats ----- */
  let cf = { q: '', status: '', offset: 0 };
  views.chats = async () => {
    loading(); let r; try { r = await api('chats', { ...rangeParams(), ...cf, limit: 30 }) } catch (e) { return fail(e) }
    main.innerHTML = `<div class="head"><h2>AI chats</h2>${pills()}</div><div class="bar-tools"><input id="cq" placeholder="Search questions and answers…" value="${esc(cf.q)}" size="34">
      <select id="cs"><option value="">All outcomes</option>${['ok', 'limited', 'busy', 'ai_error'].map(x => `<option ${cf.status === x ? 'selected' : ''}>${x}</option>`).join('')}</select></div>
      ${r.rows.map(c => `<div class="card chat"><div class="meta"><span>${when(c.ts)}</span><a href="#visitors" data-sid="${esc(c.sid || '')}" class="vj">visitor ${vshort(c.vid) || '?'}</a><span>${[c.city, c.country].filter(Boolean).map(esc).join(', ')}</span><span>turn ${c.turn || 1}</span>
        <span class="tag ${c.status === 'ok' ? 'ok' : c.status === 'limited' ? 'warn' : 'bad'}">${esc(c.status)}</span>${c.total_ms ? `<span>${(c.total_ms / 1000).toFixed(1)}s</span>` : ''}${c.page ? `<span>${esc(c.page)}</span>` : ''}</div>
        <div class="q">${esc(c.question)}</div><div class="a">${esc(c.answer || '—')}</div></div>`).join('') || '<div class="empty">No chats in this range.</div>'}${pager(r.total, r.limit, r.offset)}`;
    bindPills(main, () => { cf.offset = 0; views.chats() });
    let tm; $('#cq').addEventListener('input', e => { clearTimeout(tm); tm = setTimeout(() => { cf.q = e.target.value.trim(); cf.offset = 0; views.chats() }, 400) });
    $('#cs').addEventListener('change', e => { cf.status = e.target.value; cf.offset = 0; views.chats() });
    main.querySelectorAll('.vj').forEach(a => a.addEventListener('click', ev => { ev.preventDefault(); if (a.dataset.sid) openJourney({ sid: a.dataset.sid }) }));
    main.querySelectorAll('[data-pg]').forEach(b => b.addEventListener('click', () => { cf.offset = +b.dataset.pg; views.chats() }));
  };

  /* ----- contact messages ----- */
  let mf = { status: 'inbox', q: '', offset: 0 };
  views.messages = async () => {
    loading(); let r; try { r = await api('messages', { ...mf, limit: 20 }) } catch (e) { return fail(e) }
    const cn = r.counts || {}, tabs = [['inbox', 'Inbox', (cn.new || 0) + (cn.read || 0)], ['new', 'Unread', cn.new || 0], ['archived', 'Archived', cn.archived || 0], ['spam', 'Spam', cn.spam || 0], ['all', 'All', Object.values(cn).reduce((a, b) => a + b, 0)]];
    const btn = (act, id, label, cls = '') => `<button class="btn sm ${cls}" data-act="${act}" data-id="${id}">${label}</button>`;
    main.innerHTML = `<div class="head"><h2>Messages</h2><div class="pills" role="group" aria-label="Filter">${tabs.map(([k, n, c]) => `<button data-st="${k}" class="${mf.status === k ? 'on' : ''}">${n} ${c ? '(' + c + ')' : ''}</button>`).join('')}</div></div>
      <div class="bar-tools"><input id="mq" placeholder="Search name, email or text…" value="${esc(mf.q)}" size="34"></div>
      ${r.rows.map(m => { const sub = encodeURIComponent('Re: your message on my portfolio'), body = encodeURIComponent(`\n\n--- ${m.name} wrote on ${new Date(m.ts).toLocaleString()}:\n` + m.message.split('\n').map(l => '> ' + l).join('\n'));
        return `<div class="card msg ${m.status === 'new' ? 'unread' : ''}"><div class="meta"><b>${esc(m.name)}</b><a href="mailto:${esc(m.email)}?subject=${sub}&body=${body}" data-reply="${m.id}">${esc(m.email)}</a><span>${when(m.ts)}</span>
          ${m.city || m.country ? `<span>${[m.city, m.country].filter(Boolean).map(esc).join(', ')}</span>` : ''}${m.source ? `<span class="tag">from ${esc(m.source)}</span>` : ''}
          ${m.status === 'new' ? '<span class="tag acc">new</span>' : m.status !== 'read' ? `<span class="tag warn">${esc(m.status)}</span>` : ''}
          ${m.notified ? '<span class="tag ok" title="Email notification sent">emailed to you</span>' : `<span class="tag bad" title="${esc(m.notify_error || '')}">email failed${m.notify_error ? ': ' + esc(m.notify_error) : ''}</span>`}</div>
          <div class="body">${esc(m.message)}</div>
          <div class="acts"><a class="btn sm pri" href="mailto:${esc(m.email)}?subject=${sub}&body=${body}" data-reply="${m.id}">Reply</a>
            ${m.status === 'new' ? btn('read', m.id, 'Mark read') : btn('unread', m.id, 'Mark unread')}${m.status === 'archived' ? btn('inbox', m.id, 'Move to inbox') : btn('archive', m.id, 'Archive')}${m.status === 'spam' ? btn('inbox', m.id, 'Not spam') : btn('spam', m.id, 'Spam')}
            ${m.notified ? '' : btn('resend', m.id, 'Retry email')}${m.sid ? btn('journey', m.sid, 'View journey') : ''}${btn('delete', m.id, 'Delete')}</div></div>`}).join('') || '<div class="empty">No messages here yet.</div>'}${pager(r.total, r.limit, r.offset)}`;
    main.querySelectorAll('[data-st]').forEach(b => b.addEventListener('click', () => { mf.status = b.dataset.st; mf.offset = 0; views.messages() }));
    let tm; $('#mq').addEventListener('input', e => { clearTimeout(tm); tm = setTimeout(() => { mf.q = e.target.value.trim(); mf.offset = 0; views.messages() }, 400) });
    main.querySelectorAll('[data-pg]').forEach(b => b.addEventListener('click', () => { mf.offset = +b.dataset.pg; views.messages() }));
    main.querySelectorAll('[data-reply]').forEach(a => a.addEventListener('click', () => { api('message', null, { method: 'POST', body: { id: +a.dataset.reply, action: 'read' } }).then(refreshUnread).catch(() => { }) }));
    main.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', async () => {
      const act = b.dataset.act, id = b.dataset.id;
      if (act === 'journey') return openJourney({ sid: id });
      if (act === 'delete' && !confirm('Delete this message permanently?')) return;
      b.disabled = true;
      try { const x = await api('message', null, { method: 'POST', body: { id: +id, action: act } }); if (act === 'resend') toast(x.ok ? 'Email sent' : 'Email failed: ' + x.error); views.messages(); refreshUnread() } catch (e) { toast(e.message); b.disabled = false }
    }));
  };

  /* ----- sources + tracked-link builder ----- */
  views.sources = async () => {
    loading(); let s; try { s = await api('summary', rangeParams()) } catch (e) { return fail(e) }
    const base = location.origin + '/';
    main.innerHTML = `<div class="head"><h2>Sources</h2>${pills()}</div>
      <div class="card"><h3>Where visitors come from</h3>${table([{ h: 'Source', f: r => `<b>${esc(r.k)}</b>` }, { h: 'Visits', num: 1, f: r => nf(r.visits) }, { h: 'Visitors', num: 1, f: r => nf(r.visitors) }, { h: 'Pages / visit', num: 1, f: r => (r.pageviews / r.visits).toFixed(1) },
        { h: 'Avg active', num: 1, f: r => dur(r.avg_active_ms) }, { h: 'Bounce', num: 1, f: r => pct(r.bounces, r.visits) }, { h: 'AI messages', num: 1, f: r => nf(r.ai_msgs) }, { h: 'Contact intent', num: 1, f: r => `${nf(r.converted)} · ${pct(r.converted, r.visits)}` }, { h: '', f: r => `<button class="btn sm" data-src="${esc(r.k)}">View visits</button>` }], s.sources)}</div>
      <div class="grid two mt"><div class="card"><h3>Tagged campaigns</h3>${table([{ h: 'Source', f: r => esc(r.source) }, { h: 'Medium', f: r => esc(r.medium || '') }, { h: 'Campaign', f: r => esc(r.campaign || '') }, { h: 'Visits', num: 1, f: r => nf(r.visits) }], s.campaigns, { empty: 'No tagged links used yet.' })}</div>
      <div class="card"><h3>Make a trackable link</h3><p class="muted">Share these instead of the plain address. LinkedIn’s app often hides the referrer, so untagged shares look like “direct”.</p>
        <div class="form-row"><label>Source<select id="lbS">${['linkedin', 'github', 'resume', 'twitter', 'whatsapp', 'email', 'telegram', 'medium', 'other'].map(x => `<option>${x}</option>`).join('')}</select></label><label>Campaign (optional)<input id="lbC" placeholder="e.g. launch-post" size="18"></label><label>Open at<select id="lbP"><option value="">Home</option><option value="projects.html">All projects</option><option value="certifications.html">Certifications</option><option value="ai.html">ASQ Ai</option></select></label></div>
        <div class="linkout"><input id="lbOut" readonly><button class="btn pri" id="lbCopy">Copy</button></div></div></div>`;
    bindPills(main, views.sources);
    const build = () => { const p = new URLSearchParams({ ref: $('#lbS').value }); const c = $('#lbC').value.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-'); if (c) p.set('utm_campaign', c); $('#lbOut').value = base + $('#lbP').value + '?' + p }; build();
    ['#lbS', '#lbC', '#lbP'].forEach(i => $(i).addEventListener('input', build));
    $('#lbCopy').addEventListener('click', async () => { try { await navigator.clipboard.writeText($('#lbOut').value); toast('Link copied') } catch (e) { $('#lbOut').select(); toast('Press Ctrl+C to copy') } });
    main.querySelectorAll('[data-src]').forEach(b => b.addEventListener('click', () => { vf = { q: '', source: b.dataset.src, device: '', converted: false, ai: false, returning: false, offset: 0 }; location.hash = '#visitors' }));
  };

  /* ----- raw logs ----- */
  const TYPES = ['pageview', 'click', 'outbound', 'download', 'section', 'search', 'filter', 'copy', 'form_start', 'form_submit', 'media', 'rage_click', 'error', 'perf', 'leave', 'ai_open'];
  let lf = { type: '', q: '' };
  views.logs = async () => {
    loading(); let r; try { r = await api('logs', { ...rangeParams(), ...lf }) } catch (e) { return fail(e) }
    let rows = r.rows, next = r.next;
    const draw = () => {
      $('#lgTable').innerHTML = table([{ h: 'Time', f: e => when(e.ts) + ':' + String(new Date(e.ts).getSeconds()).padStart(2, '0') }, { h: 'Type', f: e => `<span class="tag">${esc(e.type)}</span>` }, { h: 'Page', f: e => esc(e.path) }, { h: 'Label', wrap: 1, f: e => esc(e.label) }, { h: 'Target', f: e => esc(e.target) }, { h: 'Section', f: e => esc(e.section) },
        { h: 'Value', num: 1, f: e => (e.value == null ? '' : nf(e.value)) }, { h: 'Where', f: e => where(e) }, { h: 'Source', f: e => esc(e.source) }, { h: 'Visitor', f: e => `<span class="mono">${vshort(e.vid)}</span>` }, { h: 'Extra', wrap: 1, f: e => `<span class="mono muted">${esc(e.meta || '')}</span>` }], rows, { onclick: true, empty: 'No events match.' });
      $('#lgMore').hidden = !next;
      $('#lgTable').querySelectorAll('tbody tr').forEach(tr => tr.addEventListener('click', () => openJourney({ sid: rows[tr.dataset.i].sid })));
    };
    main.innerHTML = `<div class="head"><h2>Logs</h2>${pills()}</div><div class="bar-tools"><select id="lt"><option value="">All event types</option>${TYPES.map(t => `<option ${lf.type === t ? 'selected' : ''}>${t}</option>`).join('')}</select>
      <input id="lq" placeholder="Search label, page, target…" value="${esc(lf.q)}" size="30"></div><div id="lgTable"></div><p><button class="btn" id="lgMore" hidden>Load more</button></p>`;
    draw(); bindPills(main, views.logs);
    $('#lt').addEventListener('change', e => { lf.type = e.target.value; views.logs() });
    let tm; $('#lq').addEventListener('input', e => { clearTimeout(tm); tm = setTimeout(() => { lf.q = e.target.value.trim(); views.logs() }, 400) });
    $('#lgMore').addEventListener('click', async () => { try { const m = await api('logs', { ...rangeParams(), ...lf, before: next }); rows = rows.concat(m.rows); next = m.next; draw() } catch (e) { toast(e.message) } });
  };

  /* ----- security log ----- */
  views.security = async () => {
    loading(); let r; try { r = await api('security', rangeParams()) } catch (e) { return fail(e) }
    const bad = t => /fail|locked|forbidden|purge/.test(t) ? 'bad' : t === 'login_ok' ? 'ok' : '';
    main.innerHTML = `<div class="head"><h2>Security</h2>${pills()}</div>
      <div class="grid kpis">${r.types.map(t => `<div class="card kpi"><span>${esc(t.k)}</span><b>${nf(t.n)}</b></div>`).join('') || '<div class="card kpi"><span>No security events</span><b>0</b></div>'}</div>
      <div class="card"><h3>Active admin sessions</h3>${table([{ h: 'Signed in', f: s => when(s.created) }, { h: 'Expires', f: s => when(s.expires) }, { h: 'Where', f: s => where(s) }, { h: 'Browser', f: s => esc(s.ua) }], r.active_sessions)}</div>
      <h3 class="mt">Events</h3>${table([{ h: 'Time', f: e => when(e.ts) }, { h: 'Type', f: e => `<span class="tag ${bad(e.type)}">${esc(e.type)}</span>` }, { h: 'Where', f: e => where(e) }, { h: 'Visitor hash', f: e => `<span class="mono">${esc((e.ip || '').slice(0, 8))}</span>` }, { h: 'Path', f: e => esc(e.path) }, { h: 'Detail', wrap: 1, f: e => esc(e.detail) }, { h: 'Browser', wrap: 1, f: e => `<span class="muted">${esc(e.ua)}</span>` }], r.rows)}`;
    bindPills(main, views.security);
  };

  /* ----- export (for your own analysis in Excel / Python / Power BI) ----- */
  const csvCell = v => { if (v == null) return ''; const s = String(v); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s };
  views.export = () => {
    main.innerHTML = `<div class="head"><h2>Export</h2></div><div class="card"><h3>Download your data</h3><p class="muted">Keep a copy before the 90-day cleanup. Every table is exported with all columns (see ANALYTICS.md for what each column means).</p>
      <div class="form-row"><label>Dataset<select id="xt"><option value="sessions">Sessions (one row per visit)</option><option value="events">Events (every click, view, search…)</option><option value="chats">AI chats (questions and answers)</option><option value="messages">Contact messages</option><option value="security">Security log</option></select></label>
      <label>Period<select id="xr"><option value="90">All kept data (90 days)</option><option value="30">Last 30 days</option><option value="7">Last 7 days</option><option value="1">Last 24 hours</option></select></label>
      <label>Format<select id="xf"><option value="csv">CSV</option><option value="json">JSON</option></select></label><button class="btn pri" id="xg">Download</button></div><p id="xs" class="muted"></p></div>`;
    $('#xg').addEventListener('click', async () => {
      const table_ = $('#xt').value, days = +$('#xr').value, fmt = $('#xf').value, from = Date.now() - days * DAY, to = Date.now(); let after = 0, rows = [], btn = $('#xg'); btn.disabled = true;
      try { for (;;) { const r = await api('export', { table: table_, from, to, after, limit: 1000 }); rows = rows.concat(r.rows); $('#xs').textContent = `Fetched ${nf(rows.length)} rows…`; if (!r.next) break; after = r.next }
        const name = `portfolio-${table_}-${new Date().toISOString().slice(0, 10)}.${fmt}`; let body;
        if (fmt === 'json') body = JSON.stringify(rows, null, 1); else { const cols = rows.length ? Object.keys(rows[0]) : []; body = '\ufeff' + [cols.join(',')].concat(rows.map(r => cols.map(c => csvCell(r[c])).join(','))).join('\r\n') }
        const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([body], { type: fmt === 'json' ? 'application/json' : 'text/csv' })); a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
        $('#xs').textContent = `Done: ${nf(rows.length)} rows saved as ${name}.` } catch (e) { $('#xs').textContent = 'Failed: ' + e.message } finally { btn.disabled = false }
    });
  };

  /* ----- system ----- */
  views.system = async () => {
    loading(); let s; try { s = await api('system') } catch (e) { return fail(e) }
    const m = (label, used, free, extra) => `<div class="card"><h3>${label}</h3><b>${nf(used)}</b> <span class="muted">of ${nf(free)} free per day</span><div class="meter ${used / free > .7 ? 'hot' : ''}"><i data-w="${Math.min(100, used / free * 100).toFixed(1)}"></i></div><span class="muted">${extra || ''}</span></div>`;
    const ignored = (() => { try { return localStorage.getItem('asq_ignore') === '1' } catch (e) { return false } })();
    main.innerHTML = `<div class="head"><h2>System</h2></div>
      <div class="grid three">${m('AI usage today (estimate)', s.today.est_neurons, s.today.neuron_free, `${s.today.chats} of ${s.today.chat_cap} chats allowed today (≈25 neurons each)`)}${m('Database reads today (admin guard)', s.today.d1_reads, s.today.d1_read_free, `Admin panel stops at ${nf(s.today.read_budget)}`)}${m('Tracked events today', s.today.events, s.today.event_cap, 'site-wide safety cap')}</div>
      <div class="grid two"><div class="card"><h3>Stored data</h3>${table([{ h: 'Table', f: r => r[0] }, { h: 'Rows', num: 1, f: r => nf(r[1]) }], Object.entries(s.tables))}<p class="muted">Oldest visit: ${s.oldest ? when(s.oldest) : '–'} · newest: ${s.newest ? when(s.newest) : '–'} · cleanup keeps ${s.config.retention_days} days (runs nightly 03:23 UTC).</p></div>
      <div class="card"><h3>Settings in effect</h3><p>Messages per visitor per day: <b>${s.config.daily_limit}</b><br>AI models, tried in order: <span class="mono">${esc(s.config.model)}</span><br>Change limits in <span class="mono">wrangler.jsonc</span>, then run <span class="mono">wrangler deploy</span>.</p></div></div>
      <div class="card"><h3>Contact form email notifications</h3><p class="m0">${s.contact.email_notifications ? '<span class="tag ok">connected</span> Every new message is also emailed to you through your Google Apps Script.' : '<span class="tag warn">not connected</span> Messages are still saved here in the Messages tab. To also get an email, set up your Apps Script (see DEPLOY.md, “Contact form emails”).'}</p>
        <p class="muted">Limit: ${s.contact.daily_limit} messages per visitor per day · messages kept ${s.contact.retention_days} days.</p>${s.contact.email_notifications ? '<button class="btn" id="tn">Send a test email</button>' : ''}</div>
      <div class="grid two mt"><div class="card"><h3>Your own visits</h3><p class="muted">Exclude this browser from analytics and chat logs (so your testing doesn’t pollute the numbers). Works on this device only; you can also open any page once with <span class="mono">?asq_ignore=1</span>.</p><button class="btn ${ignored ? '' : 'pri'}" id="ig">${ignored ? 'Start tracking this browser again' : 'Ignore this browser'}</button></div>
      <div class="card"><h3>Delete a visitor’s data</h3><p class="muted">For privacy requests: paste the visitor’s full anonymous ID (shown in a journey’s session ID row is a visit ID; the visitor ID is the <span class="mono">asq_vid</span> they send you).</p><div class="form-row"><input id="pv" placeholder="visitor ID" size="28"><button class="btn" id="pb">Delete</button></div></div></div>`;
    fit(main);
    if ($('#tn')) $('#tn').addEventListener('click', async e => { e.target.disabled = true; try { const x = await api('test-notify', null, { method: 'POST', body: {} }); toast(x.ok ? 'Test email sent. Check your inbox (and spam).' : 'Failed: ' + x.error) } catch (err) { toast(err.message) } e.target.disabled = false });
    $('#ig').addEventListener('click', () => { try { ignored ? localStorage.removeItem('asq_ignore') : localStorage.setItem('asq_ignore', '1') } catch (e) { } views.system() });
    $('#pb').addEventListener('click', async () => { const v = $('#pv').value.trim(); if (!v || !confirm('Delete all data for this visitor? This cannot be undone.')) return; try { const r = await api('purge', null, { method: 'POST', body: { vid: v } }); toast(`Deleted ${r.deleted.events} events, ${r.deleted.chats} chats, ${r.deleted.sessions} visits`) } catch (e) { toast(e.message) } });
  };

  /* ---------- router ---------- */
  function route() {
    const name = (location.hash || '#overview').slice(1).split('/')[0], v = views[name] ? name : 'overview';
    document.querySelectorAll('#tabs a').forEach(a => a.classList.toggle('on', a.getAttribute('href') === '#' + v));
    $('#drawer').hidden = true; views[v](); refreshUnread();
  }
  addEventListener('hashchange', route);
  async function start() { $('#login').hidden = true; $('#app').hidden = false; route() }
  (async () => { try { await api('me'); start() } catch (e) { if (e.message !== 'unauthorized') { showLogin(); $('#lgErr').textContent = e.status === 503 ? e.message : '' } } })();
})();
