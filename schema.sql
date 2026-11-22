-- Portfolio database (Cloudflare D1). Safe to re-run: every statement is IF NOT EXISTS.
-- Retention: a daily cron job deletes rows older than RETENTION_DAYS (90).  See ANALYTICS.md for every column.

-- Chat quota + abuse counters. k = hashed IP key, 'GLOBAL' (chats), 'EVENTS' (tracked events), 'D1_READS' (admin read budget), 'ev:<ip>' / 'sec:<ip>'.
CREATE TABLE IF NOT EXISTS usage (
  day TEXT NOT NULL, k TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, k)
) WITHOUT ROWID;

-- One row per visit (a session ends after 30 idle minutes).
CREATE TABLE IF NOT EXISTS sessions (
  sid TEXT PRIMARY KEY, vid TEXT NOT NULL, visit_no INTEGER NOT NULL DEFAULT 1,
  started INTEGER NOT NULL, last_seen INTEGER NOT NULL,               -- ms since epoch (UTC)
  country TEXT, region TEXT, city TEXT, continent TEXT, tz TEXT, lat REAL, lon REAL, isp TEXT, asn INTEGER, colo TEXT,
  device TEXT, browser TEXT, browser_v TEXT, os TEXT, os_v TEXT, in_app TEXT,
  screen TEXT, viewport TEXT, dpr REAL, lang TEXT, langs TEXT, touch INTEGER, scheme TEXT, theme TEXT, conn TEXT,
  landing TEXT, referrer TEXT, source TEXT, via TEXT, medium TEXT, campaign TEXT,
  pageviews INTEGER NOT NULL DEFAULT 0, clicks INTEGER NOT NULL DEFAULT 0, events INTEGER NOT NULL DEFAULT 0,
  ai_msgs INTEGER NOT NULL DEFAULT 0, active_ms INTEGER NOT NULL DEFAULT 0, max_scroll INTEGER NOT NULL DEFAULT 0,
  converted INTEGER NOT NULL DEFAULT 0                                -- 1 = contact intent (mailto, WhatsApp, copy email, form submit, resume download)
);
CREATE INDEX IF NOT EXISTS idx_sessions_started ON sessions(started);
CREATE INDEX IF NOT EXISTS idx_sessions_vid ON sessions(vid, started);

-- Everything a visitor does: pageview, click, outbound, download, section, search, filter, copy, form_start, form_submit, media, rage_click, error, perf, leave, ai_open.
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER NOT NULL, sid TEXT NOT NULL, vid TEXT NOT NULL,
  type TEXT NOT NULL, path TEXT, label TEXT, target TEXT, section TEXT, value INTEGER, meta TEXT
);
CREATE INDEX IF NOT EXISTS idx_events_sid ON events(sid, ts);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(type, ts);

-- Every AI conversation turn (saved by the server, so it can't be faked from the browser).
CREATE TABLE IF NOT EXISTS chats (
  id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER NOT NULL, sid TEXT, vid TEXT, country TEXT, city TEXT, page TEXT,
  turn INTEGER, question TEXT, answer TEXT, status TEXT NOT NULL,     -- ok | limited | busy | ai_error
  model TEXT, ttfb_ms INTEGER, total_ms INTEGER, q_chars INTEGER, a_chars INTEGER, quota_used INTEGER
);
CREATE INDEX IF NOT EXISTS idx_chats_ts ON chats(ts);
CREATE INDEX IF NOT EXISTS idx_chats_vid ON chats(vid, ts);

-- Admin logins and blocked/abusive requests.
CREATE TABLE IF NOT EXISTS security_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER NOT NULL, type TEXT NOT NULL,
  ip TEXT, country TEXT, city TEXT, asn INTEGER, ua TEXT, path TEXT, detail TEXT
);
CREATE INDEX IF NOT EXISTS idx_sec_ts ON security_log(ts);
CREATE INDEX IF NOT EXISTS idx_sec_ip ON security_log(ip, type, ts);

-- Admin login sessions (only a hash of the cookie token is stored).
CREATE TABLE IF NOT EXISTS admin_sessions (
  h TEXT PRIMARY KEY, created INTEGER NOT NULL, expires INTEGER NOT NULL, ip TEXT, ua TEXT, country TEXT, city TEXT
);

CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT);

-- Messages sent through the contact form (kept MESSAGE_RETENTION_DAYS, default 365; spam is purged after 30 days).
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER NOT NULL, name TEXT, email TEXT, message TEXT,
  vid TEXT, sid TEXT, country TEXT, city TEXT, page TEXT,            -- vid/sid link the message to the visitor's journey (empty if they opted out)
  status TEXT NOT NULL DEFAULT 'new',                                -- new | read | archived | spam
  notified INTEGER NOT NULL DEFAULT 0, notify_error TEXT,            -- did the email notification (Apps Script) go out?
  fp TEXT                                                            -- hash used to ignore accidental double-submits
);
CREATE INDEX IF NOT EXISTS idx_messages_ts ON messages(ts);
CREATE INDEX IF NOT EXISTS idx_messages_status ON messages(status, ts);
