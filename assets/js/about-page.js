/* about.html: builds the page from assets/data/about.json (the wording you edit) plus profile.json, projects.json and
   certifications.json (counts, dates, links and the certificate timeline are worked out from those, so they never go stale). */
(function () {
  'use strict';
  const root = document.getElementById('abRoot');
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const get = f => fetch('assets/data/' + f).then(r => r.ok ? r.json() : null).catch(() => null);
  const slug = s => String(s || '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const mon = d => d ? new Date(d + '-01T00:00:00').toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : '';
  const svg = (p, w = 16) => `<svg width="${w}" height="${w}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
  const OUT = svg('<path d="M7 7h10v10"/><path d="M7 17 17 7"/>', 13), PIN = svg('<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>', 14);
  const ICONS = { python: 'python', pytorch: 'pytorch', tensorflow: 'tensorflow', pandas: 'pandas', numpy: 'numpy', jupyter: 'jupyter', opencv: 'opencv', 'c++': 'cplusplus', fastapi: 'fastapi', bash: 'bash', linux: 'linux', ubuntu: 'ubuntu', git: 'git', gcp: 'googlecloud', docker: 'docker', kubernetes: 'kubernetes', spark: 'spark', postgresql: 'postgresql', pgvector: 'postgresql' };
  const ICLS = { pandas: 'ic-inv', numpy: 'ic-inv', bash: 'ic-inv', linux: 'ic-inv', cplusplus: 'ic-lift', kubernetes: 'ic-lift', postgresql: 'ic-lift' };

  Promise.all([get('about.json'), get('profile.json'), get('projects.json'), get('certifications.json')]).then(([A, P, PJ, CE]) => {
    if (!A || !P) { root.innerHTML = '<p class="ab-lead" style="text-align:center;padding:6rem 0">Couldn’t load this page. Please refresh, or go back to the <a href="index.html">home page</a>.</p>'; return }
    const projects = (PJ && PJ.projects) || [], byId = new Map(projects.map(p => [p.id, p]));
    const certs = [...((CE && CE.certificates) || []), ...((CE && CE.badges) || [])];
    const first = P.short || 'Qasim';

    /* small pieces */
    const ev = ids => { const L = (ids || []).map(id => byId.get(id)).filter(Boolean); return L.length ? `<p class="ab-ev"><span>See</span>${L.map(p => `<a href="project.html?id=${encodeURIComponent(p.id)}">${esc(p.name)}</a>`).join('')}</p>` : '' };
    const head = (id, n, title, sub) => `<header class="ab-sh rv"><p class="ab-eyebrow">${n}</p><h2>${title}</h2>${sub ? `<p class="ab-sub">${sub}</p>` : ''}</header>`;
    const btn = (href, label, pri, ext) => `<a class="ab-btn${pri ? ' pri' : ''}" href="${esc(href)}"${ext ? ' target="_blank" rel="noopener noreferrer"' : ''}>${esc(label)}${ext ? OUT : ''}</a>`;

    /* ---- hero ---- */
    const facts = [['Based in', P.location + (P.remote ? ', remote' : '')], ['Role', P.role], ['Replies', P.replyTime || 'quickly'], ['Projects', projects.length + ' built'], ['Certificates', certs.length + ' earned']];
    const hero = `<header class="ab-hero">
      <div class="ab-hero-t">
        <p class="ab-eyebrow">About</p>
        <h1><span class="grad">About me</span></h1>
        <p class="ab-lead">${esc(A.intro.lead)}</p>
        ${(A.intro.body || []).map(t => `<p class="ab-p">${esc(t)}</p>`).join('')}
        <div class="ab-cta">${btn('index.html#contact', 'Get in touch', true)}${P.resume ? btn(P.resume, 'Resume', false, true) : ''}${btn('ai.html', 'Ask ASQ Ai')}</div>
      </div>
      <figure class="ab-portrait"><span class="ab-ph">${esc((P.name || 'Q').slice(0, 1))}</span><img src="assets/images/profile/me.png" alt="Portrait of ${esc(P.name)}" width="480" height="480" decoding="async"><figcaption>${PIN}${esc(P.location)}</figcaption></figure>
    </header>
    <dl class="ab-facts rv">${facts.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>`;

    /* ---- right now ---- */
    const now = A.now && A.now.items && A.now.items.length ? `<aside class="ab-now rv" aria-label="What I'm doing right now">
      <p class="ab-now-h"><i></i>Right now${A.now.updated ? `<span>Updated ${esc(mon(A.now.updated))}</span>` : ''}</p>
      <ul>${A.now.items.map(i => `<li>${esc(i.text)}${i.projects && byId.get(i.projects[0]) ? ` <a href="project.html?id=${encodeURIComponent(i.projects[0])}">${esc(byId.get(i.projects[0]).name)}</a>` : ''}</li>`).join('')}</ul></aside>` : '';

    /* ---- how I work ---- */
    const how = `<section id="how-i-work" class="ab-sec">${head('how-i-work', '01', 'How I <em>work</em>', 'The habits behind the projects.')}
      <div class="ab-grid g3">${A.principles.map((p, i) => `<article class="ab-card rv"><span class="ab-n">${String(i + 1).padStart(2, '0')}</span><h3>${esc(p.title)}</h3><p>${esc(p.text)}</p>${ev(p.projects)}</article>`).join('')}</div></section>`;

    /* ---- strengths ---- */
    const skills = P.skills || {};
    const chip = s => { const f = ICONS[String(s).toLowerCase()]; return `<i>${f ? `<img class="${ICLS[f] || ''}" src="assets/icons/tech/${f}.svg" alt="" width="14" height="14" loading="lazy">` : ''}${esc(s)}</i>` };
    const byTitle = t => certs.find(c => c.title.toLowerCase() === String(t).toLowerCase());
    const proof = (A.proof || []).map(byTitle).filter(Boolean);
    const strengths = `<section id="strengths" class="ab-sec">${head('strengths', '02', 'What I’m <em>good at</em>', 'Where I’m strongest, and where you can see it.')}
      <div class="ab-grid g2">${A.strengths.map(s => `<article class="ab-card rv"><h3>${esc(s.group)}</h3><p>${esc(s.text)}</p><span class="ab-chips">${(s.chips || skills[s.group] || []).map(chip).join('')}</span>${ev(s.projects)}</article>`).join('')}</div>
      ${proof.length ? `<div class="ab-proof rv"><p>Backed by</p>${proof.map(c => `<a href="${esc(c.url || 'certifications.html')}"${c.url ? ' target="_blank" rel="noopener noreferrer"' : ''}><b>${esc(c.title)}</b><span>${esc(c.issuer)}${c.date ? ' · ' + mon(c.date) : ''}</span></a>`).join('')}</div>` : ''}</section>`;

    /* ---- interests ---- */
    const interests = `<section id="interests" class="ab-sec">${head('interests', '03', 'What I <em>like to do</em>', 'The parts of the work I would do for free.')}
      <div class="ab-grid g2">${A.interests.map(c => `<article class="ab-card big rv"><h3>${esc(c.title)}</h3><p>${esc(c.text)}</p>${ev(c.projects)}</article>`).join('')}</div></section>`;

    /* ---- learning ---- */
    const recent = certs.filter(c => c.date).sort((a, b) => b.date.localeCompare(a.date));
    const years = [...new Set(recent.map(c => c.date.slice(0, 4)))];
    const learning = `<section id="learning" class="ab-sec">${head('learning', '04', 'Curious about, and <em>learning</em>', 'What I’m working through at the moment.')}
      <div class="ab-two">
        <div class="ab-grid g1">${A.learning.map(l => `<article class="ab-card row rv"><span class="ab-st">${esc(l.status)}</span><div><h3>${esc(l.title)}</h3><p>${esc(l.text)}</p>${ev(l.projects)}</div></article>`).join('')}</div>
        <aside class="ab-q rv"><h3>Questions I enjoy</h3><ul>${(A.questions || []).map(q => `<li>${esc(q)}</li>`).join('')}</ul></aside>
      </div>
      ${years.length ? `<div class="ab-tl rv"><h3>Learning timeline <small>from my certificates</small></h3>${years.map(y => `<div class="ab-ty"><b>${y}</b><ul>${recent.filter(c => c.date.startsWith(y)).map(c => `<li><span>${esc(mon(c.date).split(' ')[0])}</span>${c.url ? `<a href="${esc(c.url)}" target="_blank" rel="noopener noreferrer">${esc(c.title)}</a>` : esc(c.title)}<em>${esc(c.issuer)}</em></li>`).join('')}</ul></div>`).join('')}<a class="ab-more" href="certifications.html">All certificates ${OUT}</a></div>` : ''}</section>`;

    /* ---- working together ---- */
    const cats = (PJ && PJ.categories || []).map(c => ({ name: c.name, n: projects.filter(p => p.cat === c.name).length })).filter(c => c.n);
    const together = `<section id="together" class="ab-sec">${head('together', '05', 'Working <em>together</em>', esc(A.together.text))}
      <div class="ab-grid g3">${A.together.steps.map((s, i) => `<article class="ab-card rv"><span class="ab-n">${i + 1}</span><h3>${esc(s.title)}</h3><p>${esc(s.text)}</p></article>`).join('')}</div>
      <div class="ab-help rv"><p>Things I have built</p><span class="ab-chips">${cats.map(c => `<a href="projects.html?c=${slug(c.name)}">${esc(c.name)}<b>${c.n}</b></a>`).join('')}</span></div>
      <div class="ab-cta center rv">${btn('index.html#contact', 'Send a message', true)}${btn('mailto:' + P.email, P.email)}${P.resume ? btn(P.resume, 'Resume', false, true) : ''}</div></section>`;

    /* ---- FAQ ---- */
    const faq = `<section id="faq" class="ab-sec">${head('faq', '06', 'Good <em>questions</em>')}
      <div class="ab-faq rv">${[{ q: 'Where are you based?', a: `${P.location}${P.remote ? '. I work remotely' : ''}${P.replyTime ? ` and usually reply ${P.replyTime}` : ''}.` }, ...A.faq].map(f => `<details><summary>${esc(f.q)}</summary><p>${esc(f.a)} ${f.q.startsWith('Do you track') ? '<a href="privacy.html">Privacy</a>' : f.q.startsWith('What should') ? '<a href="projects.html">All projects</a>' : ''}</p></details>`).join('')}</div></section>`;

    /* ---- elsewhere + colophon ---- */
    const links = [['GitHub', 'https://github.com/asqasim'], ['LinkedIn', 'https://linkedin.com/in/asqasim'], ['Kaggle', 'https://www.kaggle.com/asqasim'], ['Hugging Face', 'https://huggingface.co/asqasim'], ['Credly', 'https://www.credly.com/users/asqasim']];
    const foot = `<footer class="ab-foot rv"><p class="ab-eyebrow">Elsewhere</p><div class="ab-cta center">${links.map(([l, h]) => btn(h, l, false, true)).join('')}</div>
      <p class="ab-site">${esc(A.site || '')}</p><p class="ab-site"><a href="index.html">Home</a> · <a href="projects.html">Projects</a> · <a href="certifications.html">Certifications</a> · <a href="privacy.html">Privacy</a></p></footer>`;

    /* ---- in-page menu ---- */
    const nav = [['how-i-work', 'How I work'], ['strengths', 'Good at'], ['interests', 'Enjoy'], ['learning', 'Learning'], ['together', 'Together'], ['faq', 'FAQ']];
    const bar = `<nav class="ab-nav" aria-label="On this page"><div>${nav.map(([id, l]) => `<a href="#${id}" data-id="${id}">${l}</a>`).join('')}</div></nav>`;

    root.innerHTML = hero + now + bar + how + strengths + interests + learning + together + faq + foot;
    document.title = `About | ${first}`;

    /* thumbnails/portrait that fail to load: the gradient initial shows instead */
    root.querySelectorAll('.ab-portrait img').forEach(i => i.addEventListener('error', () => i.remove()));
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

    /* reveal on scroll */
    const rv = root.querySelectorAll('.rv');
    if (reduce || !('IntersectionObserver' in window)) rv.forEach(e => e.classList.add('in'));
    else { const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target) } }), { rootMargin: '0px 0px -8% 0px', threshold: .08 }); rv.forEach(e => io.observe(e)) }

    /* highlight the section being read in the menu */
    const links2 = [...root.querySelectorAll('.ab-nav a')];
    if ('IntersectionObserver' in window) {
      const so = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) links2.forEach(a => a.setAttribute('aria-current', a.dataset.id === e.target.id ? 'true' : 'false')) }), { rootMargin: '-30% 0px -60% 0px' });
      root.querySelectorAll('section.ab-sec').forEach(s => so.observe(s));
    }
    if (location.hash) { const t = document.getElementById(location.hash.slice(1)); if (t) setTimeout(() => t.scrollIntoView(), 60) }
  });
})();
