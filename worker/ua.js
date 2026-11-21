/* Tiny user-agent reader: device, browser, OS, in-app browser, bot. (No dependencies.) */
export function parseUA(ua = '') {
  const u = String(ua);
  const bot = /bot|crawl|spider|slurp|headless|lighthouse|pagespeed|preview|facebookexternalhit|embedly|python-requests|curl\/|wget\/|go-http|okhttp|axios|node-fetch|monitor|uptime|checker/i.test(u);
  let in_app = null;
  if (/LinkedInApp/i.test(u)) in_app = 'linkedin';
  else if (/FBAN|FBAV|FB_IAB/i.test(u)) in_app = 'facebook';
  else if (/Instagram/i.test(u)) in_app = 'instagram';
  else if (/Twitter(for| )|TwitterAndroid/i.test(u)) in_app = 'x';
  else if (/WhatsApp/i.test(u)) in_app = 'whatsapp';
  else if (/Snapchat/i.test(u)) in_app = 'snapchat';
  else if (/MicroMessenger/i.test(u)) in_app = 'wechat';
  else if (/musical_ly|TikTok/i.test(u)) in_app = 'tiktok';

  let os = 'Other', os_v = null, m;
  if ((m = u.match(/Windows NT ([\d.]+)/))) { os = 'Windows'; os_v = ({ '10.0': '10/11', '6.3': '8.1', '6.2': '8', '6.1': '7' })[m[1]] || m[1] }
  else if ((m = u.match(/(?:iPhone|CPU) OS ([\d_]+)/)) && /iPhone|iPad|iPod/.test(u)) { os = 'iOS'; os_v = m[1].replace(/_/g, '.') }
  else if (/iPad/.test(u)) os = 'iPadOS';
  else if ((m = u.match(/Android ([\d.]+)/))) { os = 'Android'; os_v = m[1] }
  else if ((m = u.match(/Mac OS X ([\d_.]+)/))) { os = 'macOS'; os_v = m[1].replace(/_/g, '.') }
  else if (/CrOS/.test(u)) os = 'ChromeOS';
  else if (/Linux/.test(u)) os = 'Linux';

  let browser = 'Other', browser_v = null;
  const pick = (re, name) => { const r = u.match(re); if (r) { browser = name; browser_v = r[1].split('.')[0]; return true } return false };
  pick(/Edg(?:e|A|iOS)?\/([\d.]+)/, 'Edge') || pick(/OPR\/([\d.]+)/, 'Opera') || pick(/SamsungBrowser\/([\d.]+)/, 'Samsung Internet') ||
    pick(/(?:Firefox|FxiOS)\/([\d.]+)/, 'Firefox') || pick(/(?:Chrome|CriOS)\/([\d.]+)/, 'Chrome') || pick(/Version\/([\d.]+).*Safari/, 'Safari');

  const device = /iPad|Tablet|PlayBook|Silk/i.test(u) || (/Android/.test(u) && !/Mobile/.test(u)) ? 'tablet' : /Mobi|iPhone|iPod|Android/i.test(u) ? 'mobile' : 'desktop';
  return { bot, in_app, os, os_v, browser, browser_v, device };
}

/* Where did the visit come from? Priority: ?ref= / utm_source, then the referrer site, then the in-app browser, else direct. */
const HOSTS = [
  [/(^|\.)linkedin\.com$|(^|\.)lnkd\.in$/, 'linkedin'], [/(^|\.)github\.com$|(^|\.)github\.io$/, 'github'], [/(^|\.)google\.[a-z.]+$/, 'google'],
  [/(^|\.)bing\.com$/, 'bing'], [/(^|\.)duckduckgo\.com$/, 'duckduckgo'], [/(^|\.)yahoo\.com$/, 'yahoo'], [/(^|\.)t\.co$|(^|\.)twitter\.com$|(^|\.)x\.com$/, 'x'],
  [/(^|\.)facebook\.com$|(^|\.)fb\.com$/, 'facebook'], [/(^|\.)instagram\.com$/, 'instagram'], [/(^|\.)wa\.me$|(^|\.)whatsapp\.com$/, 'whatsapp'],
  [/(^|\.)t\.me$|(^|\.)telegram\.org$/, 'telegram'], [/(^|\.)reddit\.com$/, 'reddit'], [/(^|\.)youtube\.com$|(^|\.)youtu\.be$/, 'youtube'],
  [/(^|\.)medium\.com$/, 'medium'], [/(^|\.)dev\.to$/, 'dev.to'], [/(^|\.)kaggle\.com$/, 'kaggle'], [/(^|\.)stackoverflow\.com$/, 'stackoverflow'],
  [/(^|\.)discord\.com$/, 'discord'], [/(^|\.)mail\.google\.com$|(^|\.)outlook\.(live|office)\.com$/, 'email']
];
const tag = s => { const v = String(s || '').toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, 40); return v || null };
export function classifySource({ ref, utmSource, referrer }, uaInfo, ownHost) {
  const explicit = tag(ref) || tag(utmSource);
  let host = null, refPath = null;
  if (referrer) { try { const u = new URL(referrer); host = u.hostname.replace(/^www\./, ''); refPath = (host + u.pathname).replace(/\/$/, '').slice(0, 160); if (u.host === ownHost) host = null } catch { host = null } }
  if (explicit) return { source: explicit, via: 'tag', referrer: host ? refPath : null };
  if (host) { const hit = HOSTS.find(([re]) => re.test(host)); return { source: hit ? hit[1] : host, via: 'referrer', referrer: refPath } }
  if (uaInfo.in_app) return { source: uaInfo.in_app, via: 'app', referrer: null };
  return { source: 'direct', via: 'direct', referrer: null };
}
