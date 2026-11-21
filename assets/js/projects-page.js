/* projects.html: featured fan, search, sticky category row and the selected category's grid.
   All content comes from assets/data/projects.json (edit that file, not this one):
   "featured": true  -> the first three featured projects are pinned at the top, whatever you search or select
   "categories"      -> order of the category row (the first one is selected when the page opens) */
(function () {
  'use strict';
  const $ = s => document.querySelector(s);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const hash = s => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h };
  const slug = s => s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const fmt = d => new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const IMG = 'assets/images/projects/';
  const file = v => !v ? '' : (/^(https?:)?\/\//.test(v) || v.includes('/')) ? v : IMG + v;
  const svg = (p, w) => `<svg width="${w}" height="${w}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
  const star = svg('<path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>', 13);
  const ext = svg('<path d="M7 7h10v10"/><path d="M7 17 17 7"/>', 14);

  /* thumbnails: "name.png" lives in assets/images/projects/. {light,dark} gives a version per theme (CSS shows the matching one).
     A missing file falls back to the other theme's image, then to the gradient. */
  window.thumbErr = img => { const t = img.parentNode; img.remove(); const left = t.querySelector('img'); if (left) left.className = '' };
  function thumb(p) {
    const t = typeof p.thumb === 'string' ? { light: p.thumb, dark: p.thumb } : (p.thumb || {});
    const L = file(t.light || t.dark), D = file(t.dark || t.light);
    if (!L) return '';
    const im = (src, c) => `<img${c ? ` class="${c}"` : ''} src="${esc(src)}" alt="" loading="lazy" onerror="thumbErr(this)">`;
    return L === D ? im(L, '') : im(L, 't-light') + im(D, 't-dark');
  }
  /* every project opens its own page: project.html?id=<id> (the GitHub / website links live on that page) */
  const open = p => ` href="project.html?id=${encodeURIComponent(p.id || slug(p.name))}"`;

  const featCard = p => `<a class="fp-card"${open(p)} style="--h:${hash(p.name) % 360}" aria-label="${esc(p.name)}">
    <div class="fp-in"><div class="fp-thumb">${thumb(p)}</div>
    <div class="fp-body"><div><span class="fp-cat">${esc(p.cat)}</span><h3>${esc(p.name)}</h3></div><span class="fp-go">${ext}</span></div></div></a>`;
  const card = (p, i) => `<article class="pc" style="--h:${hash(p.name) % 360};--i:${i}">
    <div class="pc-thumb">${thumb(p)}</div>
    <div class="pc-body">
      <div class="pc-badges">${p.featured ? '<span class="pc-badge feat">Featured</span>' : ''}${p.lang ? `<span class="pc-badge">${esc(p.lang)}</span>` : ''}</div>
      <h3><a class="pc-link"${open(p)}>${esc(p.name)}</a></h3>
      <p class="pc-desc">${esc(p.desc || '')}</p>
      ${(p.tags || []).length ? `<div class="pc-tags">${p.tags.slice(0, 4).map(t => `<span>${esc(t)}</span>`).join('')}${p.tags.length > 4 ? `<span>+${p.tags.length - 4}</span>` : ''}</div>` : ''}
      <div class="pc-foot"><span class="pc-meta">${p.stars != null ? `${star}${p.stars}` : ''}${p.updated ? `<span>Updated ${fmt(p.updated)}</span>` : ''}</span><span class="pc-open">View project ${ext}</span></div>
    </div></article>`;

  fetch('assets/data/projects.json').then(r => { if (!r.ok) throw new Error(r.status); return r.json() }).then(d => {
    const P = d.projects || [];
    const order = [...(d.categories || []).map(c => c.name), ...[...new Set(P.map(p => p.cat))].sort()];
    const cats = [...new Set(order)].filter(n => P.some(p => p.cat === n));
    const q = $('#ppQ'), tabs = $('#ppCats'), main = $('#ppMain'), feat = $('#ppFeat'), bar = $('#ppBar');
    const params = new URLSearchParams(location.search);
    let cur = cats.find(c => slug(c) === params.get('c')) || cats[0];

    /* featured: pinned above everything, never filtered */
    const top = P.filter(p => p.featured).slice(0, 3);
    if (top.length) { feat.innerHTML = top.map(featCard).join(''); feat.hidden = false }

    tabs.innerHTML = cats.map(c => `<button class="pp-cat" type="button" role="tab" data-c="${esc(c)}"><span>${esc(c)}</span><em></em></button>`).join('');
    const btns = [...tabs.querySelectorAll('.pp-cat')];

    const words = () => q.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const matches = (p, w) => { const hay = [p.name, p.desc, p.cat, p.lang, ...(p.tags || [])].join(' ').toLowerCase(); return w.every(x => hay.includes(x)) };

    function render() {
      const w = words(), counts = Object.fromEntries(cats.map(c => [c, P.filter(p => p.cat === c && matches(p, w)).length]));
      btns.forEach(b => { const c = b.dataset.c; b.setAttribute('aria-selected', c === cur); b.tabIndex = c === cur ? 0 : -1; b.classList.toggle('none', !counts[c]); b.querySelector('em').textContent = counts[c] });
      const list = P.filter(p => p.cat === cur && matches(p, w));
      if (list.length) { main.innerHTML = `<div class="pp-grid">${list.map(card).join('')}</div>` }
      else {
        const elsewhere = cats.filter(c => c !== cur && counts[c]);
        main.innerHTML = `<div class="pp-empty"><b>${w.length ? `No matches in ${esc(cur)}` : 'Nothing here yet'}</b>${w.length ? 'Nothing in this category matches your search.' : ''}` +
          (elsewhere.length ? `<br>Found in:<br>${elsewhere.map(c => `<button type="button" data-go="${esc(c)}">${esc(c)} (${counts[c]})</button>`).join('')}` : '') +
          (w.length ? '<br><button type="button" data-clear>Clear search</button>' : '') + '</div>';
      }
      const u = new URLSearchParams(); if (cur !== cats[0]) u.set('c', slug(cur)); if (q.value.trim()) u.set('q', q.value.trim());
      history.replaceState(null, '', location.pathname + (u.toString() ? '?' + u : ''));
    }
    /* when the category row is stuck to the top, jump back up so the new grid starts right under it */
    function toGridTop() { const y = $('#ppSentinel').getBoundingClientRect().top + scrollY; if (scrollY > y) scrollTo({ top: y, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }) }
    function select(c, focus) { cur = c; render(); if (focus) btns.find(b => b.dataset.c === c).focus(); toGridTop() }

    tabs.addEventListener('click', e => { const b = e.target.closest('.pp-cat'); if (b) { select(b.dataset.c); b.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' }) } });
    tabs.addEventListener('keydown', e => {
      if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(e.key)) return; e.preventDefault();
      const i = cats.indexOf(cur), n = e.key === 'Home' ? 0 : e.key === 'End' ? cats.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + cats.length) % cats.length;
      select(cats[n], true);
    });
    main.addEventListener('click', e => {
      const g = e.target.closest('[data-go]'); if (g) { select(g.dataset.go); return }
      if (e.target.closest('[data-clear]')) { q.value = ''; render(); q.focus() }
    });
    q.addEventListener('input', () => render());
    addEventListener('keydown', e => {
      const typing = /^(input|textarea)$/i.test(document.activeElement.tagName);
      if ((e.key === '/' && !typing) || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k')) { e.preventDefault(); q.focus(); q.select() }
      if (e.key === 'Escape' && document.activeElement === q) { q.value = ''; render(); q.blur() }
    });
    if (params.get('q')) q.value = params.get('q');
    render();

    /* soft background + border appear once the category row sticks */
    if ('IntersectionObserver' in window) new IntersectionObserver(([e]) => bar.classList.toggle('stuck', !e.isIntersecting && e.boundingClientRect.top < 0)).observe($('#ppSentinel'));
  }).catch(err => {
    console.error('projects.json could not be loaded', err);
    $('#ppMain').innerHTML = '<p class="pp-empty">Projects could not be loaded. If you opened this file straight from a folder, serve the site instead (for example <code>python3 -m http.server</code>) so the browser can read <code>assets/data/projects.json</code>.</p>';
  });
})();
