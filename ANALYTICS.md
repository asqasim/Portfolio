# Analytics guide and data dictionary

Everything is first-party: a small script (`assets/js/track.js`) sends events to your own Worker, which stores them in your own D1 database.
Nothing goes to Google, Meta or any other third party. Open `/admin` to see it, or export CSV/JSON for your own analysis.

## Concepts
- **Visitor** (`vid`): a random ID stored in the browser (`localStorage.asq_vid`). Same browser = same visitor. Not linked to a name.
- **Visit / session** (`sid`): one stay on the site. A new visit starts after 30 idle minutes.
- **Event**: one thing that happened (page opened, click, search...).
- **Bounce**: a visit with one page view and no click.
- **Contact intent** (`converted = 1`): email or WhatsApp link clicked, email copied, contact form submitted, or resume downloaded.
- **Active time**: seconds the tab was visible and the person was interacting (mouse, keys, scroll, touch) within the last 15 s.
- All timestamps are milliseconds since 1970 in UTC. In Excel: `=A2/86400000+25569`. In pandas: `pd.to_datetime(df.ts, unit="ms")`.

## Table `sessions` (one row per visit)
| Column | Meaning |
|---|---|
| sid, vid | visit ID, visitor ID |
| visit_no | 1 = visitor's first visit (within retention), 2 = second... |
| started, last_seen | first and last activity |
| country, region, city, continent, tz | approximate location from the IP (Cloudflare); `tz` is the IP's time zone |
| lat, lon | city-level coordinates rounded to 2 decimals (not precise) |
| isp, asn, colo | internet provider, its number, Cloudflare data centre that served the visit |
| device, browser, browser_v, os, os_v | mobile / tablet / desktop, browser and major version, operating system |
| in_app | in-app browser if any (linkedin, facebook, instagram, x, whatsapp...) |
| screen, viewport, dpr | screen size, window size, pixel ratio |
| lang, langs | browser language, first three languages |
| touch, scheme, theme, conn | touch screen (0/1), OS dark/light preference, theme on the site, connection type (4g, 3g...) |
| landing | first page of the visit |
| referrer, source, via | referring site; **source** = linkedin / github / google / direct / ...; **via** = how it was decided: `tag` (your `?ref=`), `referrer`, `app` (in-app browser), `direct` |
| medium, campaign | from `utm_medium`, `utm_campaign` |
| pageviews, clicks, events | counters |
| ai_msgs | AI messages answered in this visit |
| active_ms, max_scroll | total active time, deepest scroll in % |
| converted | contact intent (see above) |

## Table `events` (everything people do)
Columns: `id, ts, sid, vid, type, path, label, target, section, value, meta` (`meta` is JSON text).

| type | label | target | section | value | meta |
|---|---|---|---|---|---|
| pageview | page title | | | | |
| click | button/link text | internal path it leads to | where on the page | | x (% of page width), y (px from top), cv |
| outbound | link text | external host + path (`mailto`, `tel`) | | | cv (1 = contact) |
| download | file name | file path | | | cv for resume |
| section | section id (hero, projects...) | | section id | ms the section was in view | |
| search | text typed into a site search box | | | | |
| filter | dropdown id | chosen value | | | |
| copy | `email` or `selection` | | | | len |
| form_start / form_submit | `contactForm` | | | | cv |
| media | `play` | video file | | | |
| rage_click | element | | | | x, y (3+ fast clicks in one spot) |
| error | JavaScript error message | | | | src, line |
| perf | `page` | | | LCP in ms | ttfb, fcp, dcl, load, cls, kb |
| leave | | | | active ms since last report | scroll %, total ms on page |
| ai_open | `popup` | | | | |

`path` is the page (`/`, `/projects`, `/project?id=termflix`, `/certifications`, `/ai`). Marketing parameters are removed from it.

## Table `chats` (every AI turn, saved by the server)
`id, ts, sid, vid, country, city, page, turn, question, answer, status, model, ttfb_ms, total_ms, q_chars, a_chars, quota_used`
- `status`: `ok`, `limited` (visitor hit 10/day), `busy` (global daily cap), `ai_error` (model unavailable).
- `turn`: how many questions the visitor had asked in that conversation so far. `ttfb_ms`: time to first word.
- Chats from visitors with Do Not Track / Global Privacy Control, or from your own "ignored" browser, are not saved.

## Table `security_log`
`login_ok, login_fail, login_locked, logout, admin_purge, forbidden_origin`, with time, hashed visitor key, country, city, provider, browser and a short detail (`key:bad code:ok` for failed logins).

## Joining
`events.sid → sessions.sid`, `chats.sid → sessions.sid`, `*.vid` = the visitor. Example (SQLite / Excel Power Query / pandas):
```sql
-- visits that came from LinkedIn and what they clicked first
SELECT s.source, e.label, COUNT(*) AS clicks
FROM events e JOIN sessions s USING (sid)
WHERE e.type = 'click' AND s.source = 'linkedin'
GROUP BY s.source, e.label ORDER BY clicks DESC;
```
```python
import pandas as pd
s = pd.read_csv("portfolio-sessions-2026-11-21.csv"); e = pd.read_csv("portfolio-events-2026-11-21.csv")
for d, c in ((s, "started"), (s, "last_seen"), (e, "ts")): d[c] = pd.to_datetime(d[c], unit="ms")
print(s.groupby("source").agg(visits=("sid", "count"), ai=("ai_msgs", "sum"), contact=("converted", "sum")))
```

## Ideas to improve the portfolio with this data
- Funnel (Overview): where do people drop off between landing, Projects, a project page, ASQ Ai and contact?
- Sections: reach vs average time in view tells you which parts of the home page are read or skipped.
- Most clicked / rage clicks / dead areas (use `x`,`y` for a click heatmap) point at confusing UI.
- Searches and AI questions are direct requests: what people look for that isn't on the site yet.
- Page speed by page, device and country; JS errors per browser.
- Compare sources: do LinkedIn visitors ask the AI more? Which campaign led to a contact?

## Adding your own events
In HTML: add `data-track="Name of the thing"` to any button or link to control its label.
In JavaScript: `window.asqTrack && asqTrack.event('custom-type-not-allowed', ...)`: only the event types in the table above are stored (the server ignores unknown types). To add a type, add it to `TYPES` in `worker/track.js`.

## Privacy and retention
- Stored: everything in the tables above. **Not stored:** IP addresses (only a salted one-way hash, used for rate limits and abuse control), contact form contents, anything typed into the AI box except what's sent as a chat.
- Do Not Track and Global Privacy Control are honoured (nothing is stored, including chats). `/privacy` explains this to visitors; the AI chat shows "Chats are saved for review."
- Deletion: nightly job removes rows older than `RETENTION_DAYS` (90). Admin > System can delete one visitor's data on request.
- This is a technical summary, not legal advice. If you expect many visitors from the EU/UK, read up on consent rules for analytics and consider adding a consent banner.
