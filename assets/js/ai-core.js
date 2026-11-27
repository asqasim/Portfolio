/* ASQ Ai core: the logic shared by the browser (assets/js/chat.js) and the Worker (worker/chat.js).
   Pure functions only: no DOM, no network. One copy means the cards shown in the chat, the follow-up suggestions
   and what the AI is told about the visitor can never drift apart.

   - cleanTrail()      validates the "what did this visitor do" list sent by the browser
   - buildVisitor()    turns that list into interests (projects viewed, searches, categories...), checked against the real data
   - route()           decides which UI cards (project, certificates, skills, profile, contact...) fit a question
   - suggest()         personalised starter questions for the empty chat
   - describeVisitor() / describeUi()  short text blocks for the AI's system prompt */

/* ---------- small helpers ---------- */
const STOP = new Set('a an the and or of for to in on at is are was were be been do does did can could would should will what which who whom whose how why when where his her him he she it its their them they this that these those i me my we our you your about tell show give any some there with from by as if so than then just also please more much many very really'.split(' '));
export const norm = s => String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9+#. ]+/g, ' ').replace(/\s+/g, ' ').trim();
export const slug = s => String(s || '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
export const words = s => norm(s).split(' ').map(w => w.replace(/^\.+|\.+$/g, '')).filter(w => w && !STOP.has(w));
const clean = (s, n = 40) => String(s == null ? '' : s).replace(/[^\w +#.'&-]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const hay = p => norm([p.name, p.desc, p.cat, p.lang, ...(p.tags || [])].join(' '));
const uniq = a => [...new Set(a)];

/* ---------- data ---------- */
/* raw = { profile, projects: <projects.json>, certs: <certifications.json> } (any may be missing) */
export function normalizeData(raw) {
  raw = raw || {};
  const projects = (raw.projects && raw.projects.projects) || [];
  const c = raw.certs || {};
  const certs = [...(c.certificates || []).map(x => ({ ...x, isBadge: false })), ...(c.badges || []).map(x => ({ ...x, isBadge: true }))];
  const cats = uniq([...((raw.projects && raw.projects.categories) || []).map(x => x.name), ...projects.map(p => p.cat)]).filter(n => projects.some(p => p.cat === n));
  return { profile: raw.profile || {}, about: raw.about || {}, focuses: (raw.projects && raw.projects.focuses) || [], projects, categories: cats, certs, certsUrl: c.profileUrl || '' };
}
export const firstName = d => (d.profile && (d.profile.short || String(d.profile.name || '').split(' ').pop())) || 'Qasim';

/* ---------- the visitor's trail ---------- */
const KINDS = new Set(['pageview', 'search', 'filter', 'section', 'click', 'outbound', 'download']);
/* The browser sends [{k:kind, p:path, l:label, g:target, t:timestamp}]. Anything else is dropped and strings are stripped of odd characters
   (the trail ends up inside the AI prompt, so it is treated as untrusted text). */
export function cleanTrail(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const e of raw.slice(-40)) {
    if (!e || typeof e !== 'object' || !KINDS.has(e.k)) continue;
    out.push({ k: e.k, p: typeof e.p === 'string' && e.p[0] === '/' ? e.p.replace(/[^\w./?=&%#:+\-]/g, '').slice(0, 160) : '', l: clean(e.l, 60), g: String(e.g || '').replace(/[^\w./?=&%#:+\-]/g, '').slice(0, 120), t: Number(e.t) || 0 });
  }
  return out;
}

export const emptyVisitor = () => ({ projects: [], cats: [], searches: [], sections: [], pages: [], certs: false, resume: false, terms: [], n: 0 });
const SECTION_NAME = { projects: 'Projects', certifications: 'Certifications', 'tech-stack': 'Toolbox', experience: 'Experience', contact: 'Contact' };

/* trail -> interests. Everything is validated against the real data: unknown project ids, categories etc. are ignored. */
export function buildVisitor(trail, data) {
  const v = emptyVisitor(), list = cleanTrail(trail).reverse();            // most recent first
  const add = (arr, x, max = 6) => { if (x && !arr.includes(x) && arr.length < max) arr.push(x) };
  const byId = new Map(data.projects.map(p => [p.id, p]));
  const catBySlug = new Map(data.categories.map(c => [slug(c), c]));
  const byGit = p => (p.url || '').replace(/^https?:\/\/(www\.)?/, '').toLowerCase();
  v.n = list.length;
  for (const e of list) {
    if (e.k === 'pageview' && e.p) {
      let u; try { u = new URL(e.p, 'https://x.invalid') } catch { continue }
      const path = u.pathname.replace(/\.html$/, '').replace(/\/$/, '') || '/';
      if (path === '/project') { const id = u.searchParams.get('id'); if (byId.has(id)) { add(v.projects, id); add(v.cats, byId.get(id).cat); add(v.pages, 'a project page') } }
      else if (path === '/projects') { add(v.pages, 'the projects page'); const c = catBySlug.get(u.searchParams.get('c') || ''); if (c) add(v.cats, c) }
      else if (path === '/certifications') { v.certs = true; add(v.pages, 'the certifications page') }
      else if (path === '/' || path === '/index') add(v.pages, 'the home page');
    } else if (e.k === 'search' && e.l) add(v.searches, e.l, 4);
    else if (e.k === 'filter') { const c = data.categories.find(c => norm(c) === norm(e.g)) || catBySlug.get(slug(e.g)); if (c) add(v.cats, c) }
    else if (e.k === 'section' && SECTION_NAME[e.l]) { add(v.sections, SECTION_NAME[e.l], 4); if (e.l === 'certifications') v.certs = true }
    else if (e.k === 'click' && e.l) { const p = data.projects.find(p => norm(p.name) === norm(e.l)); if (p) { add(v.projects, p.id); add(v.cats, p.cat) } }
    else if (e.k === 'outbound' && e.g) { const g = e.g.toLowerCase(), p = data.projects.find(p => p.url && g && byGit(p).endsWith(g)); if (p) { add(v.projects, p.id); add(v.cats, p.cat) } }
    else if (e.k === 'download' && /resume|cv/i.test(e.g)) v.resume = true;
    else if (e.k === 'download' && /certificates/i.test(e.g)) v.certs = true;
  }
  const t = [];
  for (const s of v.searches) for (const w of words(s)) if (w.length >= 3 || ['ml', 'ai', 'bi', 'cv', 'c++'].includes(w)) t.push(w);
  for (const id of v.projects.slice(0, 2)) { const p = byId.get(id); if (p) { if (p.lang) t.push(norm(p.lang)); for (const g of (p.tags || []).slice(0, 3)) t.push(norm(g)) } }
  v.terms = uniq(t).slice(0, 12);
  return v;
}
export const hasActivity = v => !!(v && (v.projects.length || v.searches.length || v.cats.length || v.sections.length || v.certs || v.resume));

/* How well a project fits this visitor (and, optionally, the words of their question). */
export function scoreProject(p, v, qw = []) {
  let s = (p.featured ? 1 : 0) + (p.home ? 2 : 0);   // the projects picked for the home page rank first by default
  const i = v.projects.indexOf(p.id); if (i >= 0) s += 6 - Math.min(i, 3);
  if (v.cats.includes(p.cat)) s += 3;
  const h = hay(p);
  for (const t of v.terms) if (t.length >= 2 && h.includes(t)) s += 2;
  for (const w of qw) if (w.length >= 3 && h.includes(w)) s += 4;
  return s;
}
const visitorScore = (p, v) => scoreProject(p, v) - (p.featured ? 1 : 0) - (p.home ? 2 : 0);
export function orderProjects(data, v, qw = []) {
  return data.projects.map((p, i) => ({ p, i, s: scoreProject(p, v, qw) })).sort((a, b) => b.s - a.s || a.i - b.i).map(x => x.p);
}

/* ---------- routing: question -> UI cards ---------- */
const DEFAULTS = d => [`What projects has ${firstName(d)} built?`, 'What is in his toolbox?', 'Which certificates does he have?', 'How can I contact him?'];
const CAT_RX = [[/computer vision|\bvision\b|detect|segment|\bcv\b/, 'Computer Vision'], [/analytic|dashboard|power bi|statistic|sales/, 'Analytics'], [/data engineer|\betl\b|pipeline|warehouse|airflow|spark/, 'Data Engineering'],
  [/\bagent|\bllm\b|\brag\b/, 'AI Agents'], [/\bml\b|machine learning|predict|churn|model/, 'ML'], [/web app|browser|javascript/, 'Web Apps'], [/developer tool|library|pypi|\bcli\b|package|\btui\b/, 'Developer Tools']];
const GROUP_RX = [[/data science|machine learning|\bml\b|deep learning|pytorch|tensorflow/, 'Data Science'], [/backend|core|\bapi\b|fastapi|linux|c\+\+/, 'Core & Backend'], [/cloud|devops|data eng|docker|kubernetes|spark|\bsql\b|gcp/, 'Cloud & Data Eng'], [/agent|\bllm\b|\brag\b|\bai\b/, 'Agentic AI']];
const FOCUS_RX = [[/ (data analy\w*|analyst|analytics|power bi|dashboards?|business intelligence) /, 'analytics'], [/ (data engineer\w*|etl|pipelines?|warehouses?|airflow|spark|snowflake|databricks) /, 'data-engineering'], [/ (agents?|agentic|llm|rag) /, 'agentic-ai']];
const SKIP_NAME = new Set(['research', 'school', 'sales', 'data']);

function findNamed(t, data) {
  const hits = [];
  for (const p of data.projects) {
    const n = norm(p.name), id = norm(String(p.id || '').replace(/-/g, ' ')), f = n.split(' ')[0];
    if (t.includes(' ' + n + ' ') || t.includes(' ' + id + ' ') || (f.length >= 5 && !SKIP_NAME.has(f) && t.includes(' ' + f + ' '))) hits.push(p);
  }
  return hits.slice(0, 2);
}

export function route(question, data, v = emptyVisitor()) {
  const first = firstName(data), t = ' ' + norm(question) + ' ', T = re => re.test(t), qw = words(question), ui = [];
  let step = '', kind = 'none', shown = [];
  const personalNote = list => (list.some(p => visitorScore(p, v) > 0) ? ', starting with what you looked at' : '');

  const named = findNamed(t, data);
  if (T(/^ (hi|hey|hello|salam|assalam|yo|hola|good (morning|evening|afternoon)) /) && qw.length <= 3) kind = 'greet';
  else if (T(/ (thank|thanks|thx|shukria) /) && qw.length <= 3) kind = 'thanks';
  else if (named.length && !T(/ (contact|hire|email) /)) {
    kind = 'project'; shown = named;
    if (named.length === 1) ui.push({ t: 'project', id: named[0].id }); else ui.push({ t: 'projects', ids: named.map(p => p.id) });
    step = named.length === 1 ? `Opened ${named[0].name}` : `Compared ${named.length} projects`;
  } else if (T(/ (contact|hire|hiring|email|e mail|reach|available|availability|freelanc\w*|work with|work together|collaborat\w*|get in touch|opportunit\w*|talk to|call) /)) {
    kind = 'contact'; ui.push({ t: 'contact' }); step = 'Looked up contact details';
    if (T(/ (resume|cv) /)) ui.push({ t: 'resume' });
  } else if (T(/ (resume|cv|curriculum vitae) /)) { kind = 'resume'; ui.push({ t: 'resume' }); step = 'Found the resume' }
  else if (T(/ (certif\w*|badges?|credentials?|courses?|diploma|coursera|udemy|digiskills|pendo|ibm) /)) {
    kind = 'certs';
    const scored = data.certs.map((c, i) => { const h = norm([c.title, c.issuer, c.category].join(' ')); return { i, s: qw.reduce((a, w) => a + (w.length >= 3 && h.includes(w) ? 3 : 0), 0) + v.terms.reduce((a, w) => a + (w.length >= 3 && h.includes(w) ? 1 : 0), 0) - (c.isBadge ? 0.5 : 0) } });
    scored.sort((a, b) => b.s - a.s || a.i - b.i);
    const pick = scored.slice(0, 4).map(x => x.i);
    ui.push({ t: 'certs', idx: pick }); step = `Checked ${data.certs.length || ''} certificates`.replace('  ', ' ');
  } else if (T(/ (skills?|stack|toolbox|tech|technologies|technology|tools|languages?|frameworks?|know|expertise|good at|proficien\w*|specializ\w*|capabilit\w*) /) && !T(/ (projects?|built|build) /)) {
    kind = 'skills';
    const g = GROUP_RX.filter(([re]) => re.test(t)).map(x => x[1]).filter(n => data.profile.skills && data.profile.skills[n]);
    ui.push({ t: 'skills', groups: g.length ? uniq(g) : Object.keys(data.profile.skills || {}) }); step = 'Read the toolbox';
  } else if (aboutRx(t)) {
    kind = 'about';
    const anchor = / (how (do|does|did) (you|he) work|working style|work style|work habits|approach|values|philosoph\w*) /.test(t) ? '#how-i-work' : / (curious|curiosity|learning|exploring|studying) /.test(t.replace(/ (machine|deep|transfer) learning /g, ' ml ')) ? '#learning' : / (hobbies|hobby|interests?|passions?|free time|enjoy\w*|like to do|likes to do|fun) /.test(t) ? '#interests' : '';
    ui.push({ t: 'link', label: `About ${first}`, text: 'How he works, what he enjoys and what he is learning', href: 'about.html' + anchor }); step = 'Opened the About page';
  } else if (T(/ (projects?|built|build|made|created|portfolio|apps?|dashboards?|demos?|github|repos?|repositories|examples?|best work|most impressive|recommend\w*|where to start|show me|work|worked) /) || findTerm(t, data)) {
    kind = 'projects';
    const fslug = FOCUS_RX.map(([re, f]) => (re.test(t) && data.focuses.some(x => x.slug === f) ? f : null)).find(Boolean), fo = data.focuses.find(x => x.slug === fslug);
    const cat = fo ? null : CAT_RX.map(([re, c]) => (re.test(t) && data.categories.includes(c) ? c : null)).find(Boolean), term = findTerm(t, data);
    let list = data.projects;
    if (fo) list = list.filter(p => p.focus === fo.slug);
    if (cat) list = list.filter(p => p.cat === cat);
    if (term) { const f = list.filter(p => hay(p).includes(term)); if (f.length) list = f }
    const ranked = list.map((p, i) => ({ p, i, s: scoreProject(p, v, term ? [] : qw) })).sort((a, b) => b.s - a.s || a.i - b.i);
    shown = ranked.slice(0, cat || term || fo ? 4 : 3).map(x => x.p);
    if (shown.length) {
      ui.push({ t: 'projects', ids: shown.map(p => p.id), more: fo ? { label: `All ${fo.name} projects`, href: `projects.html?focus=${fo.slug}` } : cat ? { label: `All ${cat} projects`, href: `projects.html?c=${slug(cat)}` } : { label: 'Browse all projects', href: 'projects.html' } });
      step = `Searched ${data.projects.length} projects${personalNote(shown)}`;
    } else kind = 'none';
  } else if (T(/ (who|about|introduce|yourself|background|bio|person|based|location|country|live|lives|from) /) && !T(/ (who are you|are you) /)) { kind = 'profile'; ui.push({ t: 'profile' }); step = 'Read the profile' }
  else if (T(/ (experience|intern|internship|job|jobs|career|education|degree|university|studied|study) /)) { kind = 'experience'; ui.push({ t: 'link', label: 'Experience & education', text: 'See the full timeline on the home page', href: 'index.html#experience' }); step = 'Pointed to the timeline' }

  return { ui, step, kind, chips: followups(kind, data, v, shown), personal: shown.some(p => visitorScore(p, v) > 0) };
}

/* "how does he work", hobbies, what he is curious about or learning (checked before the project rules; "machine learning" is not a hobby) */
function aboutRx(t) {
  t = t.replace(/ (machine|deep|transfer|reinforcement) learning /g, ' ml ');
  return /( how (do|does|did) (you|he) work | working style | work style | work habits | hobbies | hobby | interests? | passions? | free time | curious | curiosity | what (is|are) (he|you) (learning|exploring|studying) | currently learning | like to do | likes to do | what (do|does) (he|you) (like|enjoy) | values | philosophy | personality | his story | your story | journey )/.test(t);
}

/* a technology / tool the visitor named, taken from the real data vocabulary (project languages, tags and skills) */
function findTerm(t, data) {
  const vocab = new Set();
  for (const p of data.projects) { if (p.lang) vocab.add(norm(p.lang)); for (const g of p.tags || []) vocab.add(norm(g)) }
  for (const a of Object.values(data.profile.skills || {})) for (const s of a) vocab.add(norm(s));
  const generic = new Set(['web app', 'cli', 'desktop app', 'interactive', 'music', 'windows', 'linux', 'media player', 'ascii', 'pypi', 'gis', 'tui', 'ml', 'ai']);
  let best = null;
  for (const w of vocab) if (w.length >= 2 && !generic.has(w) && t.includes(' ' + w + ' ') && (!best || w.length > best.length)) best = w;
  return best;
}

/* follow-up chips under a reply */
export function followups(kind, data, v, shown = []) {
  const first = firstName(data), out = [], push = q => { if (q && !out.includes(q) && out.length < 3) out.push(q) };
  const next = orderProjects(data, v).find(p => !shown.some(s => s.id === p.id));
  if (kind === 'projects' || kind === 'project') { if (shown[0]) push(`Which tools were used in ${shown[0].name}?`); if (next) push(`Tell me about ${next.name}`); push('Which certificates does he have?'); push('How can I contact him?') }
  else if (kind === 'certs') { push(`What projects has ${first} built?`); push('What is in his toolbox?'); push('How can I contact him?') }
  else if (kind === 'skills') { push(`Which projects use Python?`); push('Which certificates does he have?'); push('How can I contact him?') }
  else if (kind === 'about') { push(`What projects has ${first} built?`); push('What is in his toolbox?'); push('How can I contact him?') }
  else if (kind === 'contact' || kind === 'resume') { push(`What projects has ${first} built?`); push('What is in his toolbox?'); push(kind === 'contact' ? 'Can I see his resume?' : 'How can I contact him?') }
  else { if (next && hasActivity(v)) push(`Tell me about ${next.name}`); for (const q of DEFAULTS(data)) push(q) }
  return out;
}

/* ---------- the empty chat: starter questions that follow the visitor's visit ---------- */
export function suggest(data, v) {
  const first = firstName(data), out = [], byId = new Map(data.projects.map(p => [p.id, p]));
  const push = (q, icon, why) => { if (q && out.length < 4 && !out.some(o => o.q === q)) out.push({ q, icon, why: why || '' }) };
  const p0 = byId.get(v.projects[0]);
  if (p0) push(`Tell me about ${p0.name}`, 'grid', 'You viewed it');
  if (v.searches[0]) push(`What does ${first} have on "${v.searches[0]}"?`, 'search', 'You searched for it');
  const c0 = v.cats.find(c => !p0 || c !== p0.cat) || (p0 && p0.cat);
  if (c0) push(`Show me ${c0} work`, 'grid', 'You were browsing it');
  if (v.certs) push('Which certificates does he have?', 'award', 'You looked at them');
  if (v.resume) push('How can I contact him?', 'mail', 'You opened the resume');
  const ic = ['grid', 'tool', 'award', 'mail'];
  DEFAULTS(data).forEach((q, i) => push(q, ic[i]));
  return out;
}
/* short tags for the "picking up from your visit" strip */
export function visitTags(v, data) {
  const byId = new Map(data.projects.map(p => [p.id, p])), tags = [];
  for (const id of v.projects.slice(0, 2)) if (byId.has(id)) tags.push(`Viewed ${byId.get(id).name}`);
  if (v.searches[0]) tags.push(`Searched “${v.searches[0]}”`);
  if (!v.projects.length && v.cats[0]) tags.push(`Browsing ${v.cats[0]}`);
  if (v.certs) tags.push('Looked at certificates');
  if (v.resume) tags.push('Opened the resume');
  if (!tags.length && v.sections[0]) tags.push(`Read ${v.sections[0]}`);
  return tags.slice(0, 3);
}

/* ---------- text for the AI's system prompt ---------- */
export function describeVisitor(v, data) {
  const byId = new Map(data.projects.map(p => [p.id, p])), L = [];
  if (v.projects.length) L.push('- Opened these project pages (latest first): ' + v.projects.slice(0, 4).map(id => byId.get(id).name).join(', '));
  if (v.searches.length) L.push('- Searched this site for: ' + v.searches.slice(0, 3).map(s => `"${s}"`).join(', '));
  if (v.cats.length) L.push('- Browsed project categories: ' + v.cats.slice(0, 3).join(', '));
  if (v.sections.length) L.push('- Spent time on these home-page sections: ' + v.sections.slice(0, 3).join(', '));
  if (v.certs) L.push('- Looked at the certifications');
  if (v.resume) L.push('- Opened the resume');
  return L.join('\n');
}
export function describeUi(ui, data) {
  const byId = new Map(data.projects.map(p => [p.id, p])), L = [];
  for (const c of ui) {
    if (c.t === 'project' && byId.has(c.id)) L.push(`- a project card for ${byId.get(c.id).name} (name, category, language, description, tags, "View project" button)`);
    else if (c.t === 'projects') L.push(`- project cards, in this order: ${c.ids.map(id => (byId.get(id) || {}).name).filter(Boolean).join(', ')}`);
    else if (c.t === 'certs') L.push(`- certificate cards: ${c.idx.map(i => (data.certs[i] || {}).title).filter(Boolean).join('; ')}`);
    else if (c.t === 'skills') L.push(`- a toolbox card with the skills (${c.groups.join(', ')}) as icon chips`);
    else if (c.t === 'profile') L.push('- a profile card (photo, role, location, short bio, buttons)');
    else if (c.t === 'contact') L.push('- a contact card (email with a copy button, usual reply time, a message-form button)');
    else if (c.t === 'resume') L.push('- a resume card with a button that opens the PDF');
    else if (c.t === 'link') L.push(`- a link card: ${c.label}`);
  }
  return L.join('\n');
}
