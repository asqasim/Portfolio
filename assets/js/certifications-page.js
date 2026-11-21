/* certifications.html: reads the certificates from assets/data/certifications.json, then filters by search text and category. */
(() => {
  const DATA = 'assets/data/certifications.json', IMG = 'assets/images/certificates/', PDF = 'assets/docs/certificates/', BADGE = 'assets/images/badges/';
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const file = (base, v) => !v ? '' : (/^(https?:)?\/\//.test(v) || v.includes('/')) ? v : base + encodeURI(v);
  const hash = s => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };
  const mon = d => d ? new Date(d + '-01T00:00:00').toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : '';
  const ext = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 7h10v10"/><path d="M7 17 17 7"/></svg>';
  const pdfIc = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z"/><path d="M14 3v5h5M9 13h6M9 17h6"/></svg>';

  const q = $('#cpQ'), sel = $('#cpCat'), grid = $('#cpGrid'), count = $('#cpCount');
  let ALL = [];

  const card = c => {
    const pdf = c.pdf ? file(PDF, c.pdf) : '';
    const img = c.image ? file(c.isBadge ? BADGE : IMG, c.image) : '';
    const thumbInner = `<span class="cc-fallback"><small>${esc(c.issuer)}</small><b>${esc(c.title)}</b></span>${img ? `<img src="${esc(img)}" alt="" loading="lazy" onload="this.parentNode.classList.add('has-img')" onerror="this.remove()">` : ''}`;
    const thumb = pdf
      ? `<a class="cc-thumb" href="${esc(pdf)}" target="_blank" rel="noopener noreferrer" aria-label="Open ${esc(c.title)} PDF" tabindex="-1">${thumbInner}</a>`
      : `<div class="cc-thumb">${thumbInner}</div>`;
    return `<article class="cc${c.isBadge ? ' badge' : ''}" style="--h:${hash(c.title) % 360}">${thumb}
      <div class="cc-body">
        <div class="cc-meta"><span>${esc(c.issuer)}</span>${c.date ? `<span>${mon(c.date)}</span>` : ''}${c.isBadge ? '<span class="cc-tag">Badge</span>' : ''}</div>
        <h3>${esc(c.title)}</h3>
        <div class="cc-actions">${c.url ? `<a class="cc-btn pri" href="${esc(c.url)}" target="_blank" rel="noopener noreferrer">Verify ${ext}</a>` : ''}${pdf ? `<a class="cc-btn" href="${esc(pdf)}" target="_blank" rel="noopener noreferrer">${pdfIc} PDF</a>` : ''}</div>
      </div></article>`;
  };

  function update() {
    const t = q.value.trim().toLowerCase(), cat = sel.value;
    const list = ALL.filter(c => (!cat || c.category === cat) && (!t || [c.title, c.issuer, c.category, c.id].join(' ').toLowerCase().includes(t)));
    grid.innerHTML = list.length ? list.map(card).join('') : '<p class="cp-empty">No certificates match your search.</p>';
    count.textContent = `${list.length} of ${ALL.length} certificates`;
  }

  fetch(DATA).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); }).then(d => {
    ALL = [...(d.certificates || [])]      /* certificates only: badges stay on the home page */
      .map(c => ({ ...c, category: c.category || 'Other' }))
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''));      /* newest first, undated last */
    [...new Set(ALL.map(c => c.category))].sort().forEach(c => sel.add(new Option(c, c)));
    update();
  }).catch(err => {
    console.error('certifications.json could not be loaded', err);
    grid.innerHTML = '<p class="cp-err">Certificates could not be loaded. If you opened this page straight from a folder, serve the site instead (for example <code>python3 -m http.server</code>).</p>';
  });

  q.addEventListener('input', update);
  sel.addEventListener('change', update);
  addEventListener('keydown', e => { if (e.key === '/' && document.activeElement !== q && !/^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement.tagName)) { e.preventDefault(); q.focus(); } });
})();
