/* project.html: renders ONE project page.
   The page address is project.html?id=<id>, where <id> is the "id" of a project in assets/data/projects.json.
   - Listing facts (name, category, language, description, tags, link, thumbnail) come from assets/data/projects.json.
   - The write-up comes from assets/data/projects/<id>.json (optional: without it a simple page is built from projects.json).
   Edit those JSON files, not this script. A new block type = one function in BLOCKS below. */
(function () {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const slug = t => String(t).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const hash = s => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h };
  const date = d => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
  const params = new URLSearchParams(location.search);
  const id = params.get('id') || params.get('p') || '';
  const app = $('#app');

  /* ---------- file locations: a bare file name is looked up in this project's folder; a path or URL is used as given ---------- */
  const isPath = v => /^(https?:)?\/\//.test(v) || v.includes('/');
  const imgSrc = v => !v ? '' : isPath(v) ? v : `assets/images/projects/${id}/${v}`;
  const vidSrc = v => !v ? '' : isPath(v) ? v : `assets/videos/projects/${id}/${v}`;
  const THUMBS = 'assets/images/projects/';
  const thumbSrc = v => !v ? '' : isPath(v) ? v : THUMBS + v;
  const text = v => Array.isArray(v) ? v.join('\n\n') : String(v ?? '');     // md as a list = paragraphs
  const codeText = v => Array.isArray(v) ? v.join('\n') : String(v ?? '');    // code as a list = lines
  const placeholder = v => typeof v === 'string' && v.trim().startsWith('[');  // "[prompt]" values are hidden in the facts

  /* ---------- icons ---------- */
  const svg = (p, w = 16) => `<svg width="${w}" height="${w}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
  const EXT = svg('<path d="M7 17 17 7M8 7h9v9"/>', 12);
  const LI = {
    github: svg('<path d="M9 19c-4.3 1.4-4.3-2.5-6-3m12 5v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.2 4.2 0 0 0-.1-3.2s-1.1-.3-3.5 1.3a12.3 12.3 0 0 0-6.2 0C6.5 2.8 5.4 3.1 5.4 3.1a4.2 4.2 0 0 0-.1 3.2A4.6 4.6 0 0 0 4 9.5c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21"/>'),
    globe: svg('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>'),
    play: svg('<circle cx="12" cy="12" r="9"/><path d="m10 8.5 5 3.5-5 3.5z"/>'),
    book: svg('<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 19V5"/>'),
    box: svg('<path d="m21 8-9-5-9 5 9 5z"/><path d="M3 8v8l9 5 9-5V8M12 13v8"/>'),
    bag: svg('<path d="M5 8h14l-1 12H6z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>')
  };
  const LINKS = [['website', u => host(u), 'globe'], ['demo', u => host(u), 'play'], ['github', () => 'GitHub', 'github'], ['pypi', () => 'PyPI', 'box'], ['npm', () => 'npm', 'box'], ['docker', () => 'Docker Hub', 'box'], ['store', () => 'Store', 'bag'], ['docs', () => 'Documentation', 'book']];
  const host = u => { try { return new URL(u).hostname.replace(/^www\./, '') } catch { return u } };
  /* tech-stack icons: local files in assets/icons/tech (devicon). Names without a file simply show as text. */
  const TECH = { python: 'python', pytorch: 'pytorch', tensorflow: 'tensorflow', pandas: 'pandas', numpy: 'numpy', jupyter: 'jupyter', opencv: 'opencv', 'c++': 'cplusplus', fastapi: 'fastapi', bash: 'bash', linux: 'linux', ubuntu: 'ubuntu', git: 'git', gcp: 'googlecloud', 'google cloud': 'googlecloud', docker: 'docker', kubernetes: 'kubernetes', spark: 'spark', 'apache spark': 'spark', postgresql: 'postgresql', postgres: 'postgresql' };
  const INV = new Set(['pandas', 'numpy', 'bash', 'linux']), LIFT = new Set(['cplusplus', 'kubernetes', 'postgresql']);
  const techIcon = n => { const f = TECH[String(n).toLowerCase().trim()]; return f ? `<img class="${INV.has(f) ? 'ic-inv' : LIFT.has(f) ? 'ic-lift' : ''}" src="assets/icons/tech/${f}.svg" alt="" width="14" height="14" onerror="this.remove()">` : '' };

  /* ---------- tiny markdown: **bold**, `code`, [text](link), "- " and "1. " lists ---------- */
  const inline = s => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+|\/[^)\s]*|#[^)\s]*|[\w./-]+\.html[^)\s]*)\)/g, (m, t, u) => `<a href="${u}"${/^https?:/.test(u) ? ' target="_blank" rel="noopener noreferrer"' : ''}>${t}</a>`);
  const md = t => String(t).trim().split(/\n\s*\n/).map(b => {
    const L = b.split('\n');
    if (L.every(l => /^\s*[-*] /.test(l))) return '<ul>' + L.map(l => `<li>${inline(l.replace(/^\s*[-*] /, ''))}</li>`).join('') + '</ul>';
    if (L.every(l => /^\s*\d+\. /.test(l))) return '<ol>' + L.map(l => `<li>${inline(l.replace(/^\s*\d+\. /, ''))}</li>`).join('') + '</ol>';
    return `<p>${inline(L.join(' '))}</p>`;
  }).join('');

  /* ---------- small code highlighter (comments, strings, numbers, keywords) ---------- */
  const KW = {
    python: 'def class return import from as if elif else for while in not and or is None True False try except finally with lambda yield raise pass break continue async await',
    js: 'const let var function return if else for while new class import export from default async await try catch throw typeof true false null undefined',
    bash: 'if then else fi for do done while case esac function sudo cd export'
  };
  const LANG = { py: 'python', python: 'python', js: 'js', javascript: 'js', ts: 'js', typescript: 'js', json: 'js', sh: 'bash', bash: 'bash', shell: 'bash', zsh: 'bash' };
  function highlight(code, lang) {
    const l = LANG[String(lang).toLowerCase()]; if (!l) return esc(code);
    const kw = KW[l] ? `\\b(?:${KW[l].split(' ').join('|')})\\b` : '(?!)';
    const re = new RegExp(`(${l === 'js' ? '\\/\\/.*' : '#.*'})|("(?:\\\\.|[^"\\\\])*"|'(?:\\\\.|[^'\\\\])*')|(\\b\\d+(?:\\.\\d+)?\\b)|(${kw}${l === 'bash' ? '|(?<=\\s)--?[a-zA-Z][\\w-]*' : ''})`, 'g');
    let out = '', last = 0, m;
    while ((m = re.exec(code))) {
      out += esc(code.slice(last, m.index));
      const c = m[1] ? 'tk-c' : m[2] ? 'tk-s' : m[3] ? 'tk-n' : 'tk-k';
      out += `<span class="${c}">${esc(m[0])}</span>`; last = m.index + m[0].length;
      if (m[0] === '') re.lastIndex++;
    }
    return out + esc(code.slice(last));
  }

  /* ---------- content blocks ---------- */
  window.pdImgErr = img => { const f = img.closest('figure'), sp = img.closest('.split'); if (f) f.remove(); if (sp) { const h = sp.querySelector('.sp-i'); if (h && !h.querySelector('figure')) h.remove(); sp.classList.add('solo') } };
  const media = (inner, cap, ratio) => `<figure><div class="hatch"><div class="mi${ratio ? ' fixed' : ''}"${ratio ? ` style="aspect-ratio:${esc(ratio)}"` : ''}>${inner}</div></div>${cap ? `<figcaption>${esc(cap)}</figcaption>` : ''}</figure>`;
  const BLOCKS = {
    h3: b => `<h3 class="b-h3">${esc(b.text)}</h3>`,
    text: b => `<div class="prose">${md(text(b.md))}</div>`,
    list: b => { const t = b.ordered ? 'ol' : 'ul'; return `<div class="prose"><${t}>${b.items.map(i => `<li>${inline(i)}</li>`).join('')}</${t}></div>` },
    features: b => `<div class="feat">${b.items.map(i => `<div><b>${esc(i.title)}</b><span>${inline(i.text)}</span></div>`).join('')}</div>`,
    code: b => { const c = codeText(b.code).replace(/^\n|\n\s*$/g, ''); return `<div class="code"><header><span>${esc(b.file || b.lang || '')}</span><button type="button" data-copy>Copy</button></header><pre><code>${highlight(c, b.lang)}</code></pre></div>` },
    table: b => `<div class="tw"><div class="ts"><table><thead><tr>${b.headers.map(h => `<th><span>${esc(h)}</span></th>`).join('')}</tr></thead><tbody>${b.rows.map(r => `<tr>${r.map(c => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div></div>`,
    image: b => b.src ? media(`<img src="${esc(imgSrc(b.src))}" alt="${esc(b.alt || '')}" loading="lazy" onerror="pdImgErr(this)">`, b.caption, b.ratio) : '',
    split: b => {
      const t = `<div class="prose">${b.title ? `<h3>${esc(b.title)}</h3>` : ''}${md(text(b.md || ''))}</div>`;
      return b.image && b.image.src ? `<div class="split${b.side === 'left' ? ' rev' : ''}">${t}<div class="sp-i">${BLOCKS.image({ ...b.image, ratio: b.image.ratio })}</div></div>` : t;
    },
    gallery: b => `<div class="gal">${b.images.map(i => BLOCKS.image(i)).join('')}</div>`,
    video: b => !(b.src || b.youtube) ? '' : media(b.youtube
      ? `<iframe src="https://www.youtube-nocookie.com/embed/${esc(b.youtube)}" allowfullscreen loading="lazy" title="${esc(b.caption || 'Video')}"></iframe>`
      : b.loop ? `<video autoplay muted loop playsinline ${b.poster ? `poster="${esc(imgSrc(b.poster))}"` : ''} src="${esc(vidSrc(b.src))}"></video>`
        : `<video controls preload="metadata" ${b.poster ? `poster="${esc(imgSrc(b.poster))}"` : ''} src="${esc(vidSrc(b.src))}"></video>`, b.caption, '16/9'),
    callout: b => `<div class="note"><b>${esc(b.title || 'Note')}</b>${md(text(b.text))}</div>`,
    faq: b => `<div class="faq">${b.items.map((q, i) => `<details><summary><span class="q">Q.${String(i + 1).padStart(2, '0')}</span><span class="t">${esc(q.q)}</span><span class="pm"></span></summary><div class="a"><p>${inline(q.a)}</p></div></details>`).join('')}</div>`
  };
  const NARROW = { h3: 'prose', text: 'prose', list: 'prose', code: 'narrow', callout: 'narrow' };
  const block = b => BLOCKS[b.type] ? `<div class="b ${NARROW[b.type] || ''}">${BLOCKS[b.type](b)}</div>` : '';

  /* ---------- related projects ---------- */
  function relThumb(p) {
    const t = typeof p.thumb === 'string' ? { light: p.thumb, dark: p.thumb } : (p.thumb || {});
    const L = thumbSrc(t.light || t.dark), D = thumbSrc(t.dark || t.light); if (!L) return '';
    const im = (s, c) => `<img${c ? ` class="${c}"` : ''} src="${esc(s)}" alt="" loading="lazy" onerror="this.remove()">`;
    return L === D ? im(L, '') : im(L, 't-light') + im(D, 't-dark');
  }
  const pid = p => p.id || slug(p.name);
  const relCard = p => `<a class="rc" href="project.html?id=${encodeURIComponent(pid(p))}" style="--h:${hash(p.name) % 360}"><div class="rc-t">${relThumb(p)}</div><div class="rc-b"><small>${esc(p.cat || '')}</small><b>${esc(p.name)}</b><p>${esc(p.desc || '')}</p></div></a>`;
  function related(p, all, wanted) {
    const pick = (wanted || []).map(s => all.find(x => pid(x) === s)).filter(Boolean);
    const rest = all.filter(x => pid(x) !== p.id && !pick.includes(x)).map(x => [x, (x.cat === p.category) * 2 + (x.tags || []).filter(t => (p.tags || []).includes(t)).length]).sort((a, b) => b[1] - a[1]).map(a => a[0]);
    return [...pick, ...rest].slice(0, 3);
  }

  /* ---------- the page ---------- */
  function page(p, all) {
    const facts = [['Type', p.type], ['Role', p.role], ['Category', p.category], ['Language', p.lang], ['Compatible OS', p.os && p.os.length ? { os: p.os } : ''], ['Built', p.built], ['Latest version', p.version], ['Updated', date(p.updated)], ['Status', p.status], ['License', p.license], ['Stars', p.stars != null ? String(p.stars) : '']]
      .filter(r => r[1] && !placeholder(r[1]))
      .map(([k, v]) => `<div><p class="pd-l">${k}</p>${v.os ? `<p class="pd-v pd-os">${v.os.map(o => `<span>${esc(o)}</span>`).join('')}</p>` : `<p class="pd-v">${esc(v)}</p>`}</div>`).join('');
    const known = new Set(LINKS.map(l => l[0]));
    const linkRows = [...LINKS.filter(l => p.links[l[0]]), ...Object.keys(p.links).filter(k => !known.has(k) && p.links[k]).map(k => [k, () => k[0].toUpperCase() + k.slice(1), 'globe'])];
    const links = linkRows.map(([k, txt, ic]) => `<a class="pd-lk" href="${esc(p.links[k])}" target="_blank" rel="noopener noreferrer"><span>${LI[ic]}${esc(txt(p.links[k]))}</span>${EXT}</a>`).join('');
    const stack = (p.stack && p.stack.length ? p.stack : p.tags || []).filter(s => !placeholder(typeof s === 'string' ? s : s.name))
      .map(s => { const o = typeof s === 'string' ? { name: s } : s; return `<span>${techIcon(o.name)}${esc(o.name)}</span>` }).join('');

    const secs = []; let cur = { h: '', bs: [] }; secs.push(cur);
    (p.content || []).forEach(b => b.type === 'h2' ? secs.push(cur = { h: b.text, bs: [] }) : cur.bs.push(b));
    let n = 0;
    const live = secs.filter(s => s.h || s.bs.length);
    const body = live.map(s => `<section class="sec"${s.h ? ` id="${slug(s.h)}"` : ''}>${s.h ? `<div class="sh"><p class="sn"><span>${String(++n).padStart(2, '0')}</span><i></i></p><h2>${esc(s.h)}</h2></div>` : ''}${s.bs.map(block).join('')}</section>`).join('')
      || `<section class="sec"><div class="b prose"><p>${esc(p.summary)}</p><p class="soon">A detailed write-up for this project is coming soon.</p></div></section>`;
    let k = 0; const toc = live.filter(s => s.h).map(s => `<li><a href="#${slug(s.h)}"><span>${String(++k).padStart(2, '0')}</span>${esc(s.h)}</a></li>`).join('');
    const rel = related(p, all, p.related);

    document.title = `${p.title} | Qasim`;
    const md2 = $('meta[name=description]'); if (md2) md2.setAttribute('content', p.summary || '');
    return `<header class="pd-banner" style="--h:${hash(p.id) % 360}">
        ${p.banner ? `<img class="pd-bimg" src="${esc(imgSrc(p.banner))}" alt="" onerror="this.remove()">` : ''}
        <div class="pd-top pd-w"><a class="pd-glass pd-home" href="index.html" aria-label="Home" title="Home">${svg('<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>', 22)}</a>
          <a class="pd-glass pd-back" href="projects.html">${svg('<path d="m12 19-7-7 7-7M19 12H5"/>', 16)}<span>All projects</span></a></div>
        <div class="pd-ttl pd-w"><h1>${esc(p.title)}</h1><p>${esc(p.tagline || p.summary)}</p></div>
      </header>
      <main>
        <div class="pd-w"><div class="pd-meta">${links ? `<nav class="pd-links" aria-label="Project links">${links}</nav>` : '<span></span>'}<div class="pd-fields">${facts}</div></div>
          ${stack ? `<div class="pd-stack"><p class="pd-l">Tech stack</p><div class="pd-pills">${stack}</div></div>` : ''}</div>
        <div class="pd-w pd-body${toc ? ' has-toc' : ''}"><div class="pd-main">${body}
          ${rel.length ? `<section class="sec"><div class="sh"><h2>Keep reading</h2></div><div class="pd-rel">${rel.map(relCard).join('')}</div></section>` : ''}</div>
          ${toc ? `<aside class="pd-toc" aria-label="On this page"><p class="pd-l">On this page</p><ol>${toc}</ol></aside>` : ''}</div>
      </main><div class="pd-end"></div>`;
  }
  const notFound = () => { document.title = 'Project not found | Qasim'; return `<div class="pd-empty"><h1>Project not found</h1><p><a href="projects.html">Back to all projects</a></p></div>` };

  /* ---------- boot ---------- */
  const getJSON = u => fetch(u).then(r => r.ok ? r.json() : Promise.reject(r.status));
  Promise.all([getJSON('assets/data/projects.json'), id ? getJSON(`assets/data/projects/${encodeURIComponent(id)}.json`).catch(() => null) : null]).then(([list, detail]) => {
    const all = list.projects || [], meta = all.find(x => pid(x) === id);
    if (!id || (!meta && !detail)) { app.innerHTML = notFound(); return }
    const d = detail || {}, m = meta || {};
    const links = { ...(m.url ? { [/github\.com/.test(m.url) ? 'github' : 'website']: m.url } : {}), ...(d.links || {}) };
    const p = { id, title: d.title || m.name || id, summary: d.summary || m.desc || '', category: d.category || m.cat || '', lang: m.lang || '', tags: m.tags || [], stars: m.stars, updated: d.updated || m.updated, thumb: m.thumb, ...d, links };
    app.innerHTML = page(p, all);

    /* copy buttons */
    app.addEventListener('click', e => { const b = e.target.closest('[data-copy]'); if (!b) return; navigator.clipboard && navigator.clipboard.writeText(b.closest('.code').querySelector('code').textContent).catch(() => { }); b.textContent = 'Copied'; setTimeout(() => b.textContent = 'Copy', 1400) });
    /* image viewer */
    const lb = document.createElement('dialog'); lb.className = 'lb'; lb.innerHTML = '<button type="button" aria-label="Close">×</button><img alt="">'; document.body.appendChild(lb);
    app.addEventListener('click', e => { const i = e.target.closest('.mi img'); if (!i) return; lb.querySelector('img').src = i.currentSrc || i.src; lb.querySelector('img').alt = i.alt; lb.showModal() });
    lb.addEventListener('click', e => { if (e.target === lb || e.target.tagName === 'BUTTON') lb.close() });
    /* "on this page" highlight */
    const links2 = [...document.querySelectorAll('.pd-toc a')];
    if (links2.length && 'IntersectionObserver' in window) {
      const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) links2.forEach(a => a.classList.toggle('on', a.getAttribute('href') === '#' + e.target.id)) }), { rootMargin: '-15% 0px -70% 0px' });
      document.querySelectorAll('.sec[id]').forEach(s => io.observe(s));
    }
    if (location.hash) { const t = document.getElementById(location.hash.slice(1)); if (t) setTimeout(() => t.scrollIntoView(), 50) }
  }).catch(err => {
    console.error('project data could not be loaded', err);
    app.innerHTML = '<div class="pd-empty"><h1>Could not load this project</h1><p>If you opened the file straight from a folder, serve the site instead (for example <code>python3 -m http.server</code>) so the browser can read the JSON files.</p></div>';
  });
})();