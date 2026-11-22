# Portfolio

Personal portfolio site running entirely on Cloudflare's free tier:

- **Static site**: home, projects (with per-project pages), certifications, privacy.
- **ASQ Ai**: a chat assistant (Workers AI) that answers questions about my work, limited to 10 messages per visitor per day by IP.
- **First-party analytics**: visits, journeys, sources (LinkedIn, GitHub...) and AI chats, stored in my own D1 database with 90-day retention.
- **Contact form** saved in the database (inbox in the admin panel) and emailed to me through my own Google Apps Script.
- **Private admin panel** at `/admin`: admin key + authenticator-app login, dashboards, journeys, messages, logs, CSV/JSON export.

No third-party trackers, no ads, no cost.

## Structure

| Path | What it is |
|---|---|
| `index.html`, `projects.html`, `project.html`, `certifications.html`, `ai.html`, `privacy.html`, `404.html` | Pages |
| `admin.html` | Admin panel shell (data only loads after login) |
| `assets/` | CSS, JS, images, documents and the JSON data files (`assets/data/`) that drive the pages and the AI |
| `worker/` | Cloudflare Worker: chat + rate limit, event tracking, admin API |
| `schema.sql` | D1 database tables |
| `tools/setup-secrets.mjs` | Creates the admin key, authenticator secret and IP salt |
| `tools/setup-contact.mjs`, `apps-script/Code.gs` | Connects the contact form to your own Google Apps Script for email notifications |
| `wrangler.jsonc` | Cloudflare configuration (limits, bindings, nightly cleanup) |
| `_headers`, `.assetsignore`, `robots.txt` | Security headers and what is (not) published |
| `DEPLOY.md` | Step-by-step deployment checklist |
| `ANALYTICS.md` | Data dictionary and analysis tips |

## Quick start

```bash
npm install
npx wrangler login
npx wrangler d1 create portfolio-limits   # paste the database_id into wrangler.jsonc
npm run db:init
npm run deploy
npm run secrets                            # admin key + authenticator setup
npm run contact                            # optional: email notifications for the contact form
```

Full checklist: see [DEPLOY.md](DEPLOY.md). Local preview: `npm run db:init:local && npm run dev`
(copy `.dev.vars.example` to `.dev.vars` first; the AI call runs on Cloudflare even locally).

## Security notes

- Secrets live only in Cloudflare (`wrangler secret`), never in this repository.
- `.dev.vars`, `.wrangler/`, exports (`portfolio-*.csv`) and `node_modules/` are git-ignored; don't force-add them.
- The admin panel and API only accept same-origin requests, require two factors, lock after repeated failures and log every attempt.
- Visitor IPs are never stored; only a salted hash is used for rate limiting.

## License

Add a license of your choice (for example MIT for the code). Until then, all rights reserved.
