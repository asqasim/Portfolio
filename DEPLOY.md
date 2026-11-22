# Deploy checklist (free, Cloudflare)

Tick each box as you go. Every phase ends with "Done when": don't continue until it's true.
Run all commands inside the unzipped project folder (the one containing `index.html` and `wrangler.jsonc`).
Cost: **$0**. You never add a payment method; the free plan stops instead of billing.

## Phase 0: Before you start
- [ ] Node.js 20 or newer (`node -v`). Get it from https://nodejs.org if needed.
- [ ] A password manager or a safe place to keep two secrets (you'll create them in Phase 6).
- [ ] An authenticator app on your phone (Google Authenticator, Microsoft Authenticator, Authy, 1Password...).

## Phase 1: Cloudflare account
- [ ] Sign up at https://dash.cloudflare.com/sign-up and verify your email. **Do not add a payment method.**
- [ ] Turn on two-factor login for the account: Profile > Authentication.

Done when: you can see the dashboard, and Billing shows no payment method.

## Phase 2: Tools
- [ ] `npm install -g wrangler`
- [ ] `wrangler login` (a browser tab opens, click Allow)
- [ ] `wrangler whoami` prints your email.

## Phase 3: Choose your address
- [ ] In `wrangler.jsonc` set `"name"` (lowercase letters, digits, dashes). Your site becomes `https://<name>.<your-subdomain>.workers.dev`.
      The account subdomain is picked on your first deploy (Phase 5).

## Phase 4: Database
- [ ] `wrangler d1 create portfolio-limits`
- [ ] If Wrangler offers to edit your config automatically, answer **No**. Copy the printed `database_id` into `wrangler.jsonc`, replacing `PASTE_ID_FROM_wrangler_d1_create`.
- [ ] `wrangler d1 execute portfolio-limits --remote --file=schema.sql`

Done when: the last command prints `"success": true`.

## Phase 5: First deploy
- [ ] `wrangler deploy`
- [ ] If asked, choose your account subdomain.
- [ ] Copy the printed URL and open it: your portfolio should load.

## Phase 6: Admin login (one command)
- [ ] `node tools/setup-secrets.mjs`
- [ ] It prints your **admin key** and an **authenticator setup key**. Save the admin key in your password manager.
- [ ] In your authenticator app choose "Enter a setup key": account `Portfolio Admin`, the printed key, type "time-based".
- [ ] Type `yes` when the script asks; it uploads the secrets (admin key hash, authenticator secret, IP salt) to Cloudflare.
      The plain admin key is never uploaded, only its hash.

Done when: the script prints "Done". (Re-running it replaces everything; your old key and authenticator entry stop working.)

## Phase 6b: Contact form emails (Google Apps Script)
Messages are always saved in your admin panel (Messages tab). This phase also emails each one to you.
- [ ] Go to https://script.google.com, sign in with the Gmail that should receive the emails, click **New project**.
- [ ] Delete the sample code, paste the whole of `apps-script/Code.gs`, check `OWNER_EMAIL` at the top, press Save (disk icon).
- [ ] In the function dropdown choose **authorize**, press **Run**, and accept the permission screens ("Advanced" > "Go to project" if Google warns that the app is unverified: it's your own script).
- [ ] In a terminal in the project folder run `npm run contact`. It prints a **SECRET** and waits.
- [ ] Back in Apps Script: gear icon (Project Settings) > Script properties > **Add script property**, name `SECRET`, value = the printed secret > Save.
- [ ] Deploy > **New deployment** > gear icon > **Web app** > Execute as **Me**, Who has access **Anyone** > Deploy. Copy the **Web app URL** (ends in `/exec`).
- [ ] Paste that URL into the waiting terminal and press Enter. It uploads the URL and secret to Cloudflare.
- [ ] Open `/admin` > System > **Send a test email**. Check your inbox (and spam).

If you later edit the script: Deploy > Manage deployments > pencil icon > Version: **New version** > Deploy. If you re-run `npm run contact`, paste the new secret into Script properties again.
Anyone can open a Web app URL, so the shared secret is what stops strangers from using your script; never share it or the URL.

## Phase 7: Verify (do all of these)
**Site**
- [ ] Home, Projects, a project page, Certifications, Privacy and `/ai` load; icons show; light/dark works.
- [ ] A made-up address such as `/abc` shows the 404 page.
- [ ] `/wrangler.jsonc`, `/schema.sql`, `/worker/index.js`, `/tools/setup-secrets.mjs`, `/DEPLOY.md` are all **404**.
- [ ] `curl -I https://YOUR-URL/` (use `curl.exe` on Windows) shows `content-security-policy` and `strict-transport-security`.

**AI**
- [ ] `/ai` header says **Online**, footer says "10 of 10 messages left today. Chats are saved for review."
- [ ] Ask "What projects has Qasim built?": the answer streams in and links to real project pages; the counter drops to 9.
- [ ] Ask something unrelated: it politely steers back.
- [ ] Test the limit: set `"DAILY_LIMIT": "2"` in `wrangler.jsonc`, run `wrangler deploy`, send 3 messages (the 3rd is refused), then set it back to `"10"` and redeploy.

**Analytics + admin**
- [ ] Browse the site normally for a minute (scroll, click Projects, open a project, open ASQ Ai, ask one question), then close the tab.
- [ ] Open `https://YOUR-URL/admin`. Sign in with the admin key + the 6-digit code.
- [ ] Overview shows your visit; Visitors shows a row; clicking it shows your whole journey, including your AI question and the answer.
- [ ] AI chats shows the conversation. Security shows your `login_ok`.
- [ ] A wrong password or code is refused. After 5 wrong tries the login locks for 15 minutes.
- [ ] Export downloads a CSV.
- [ ] System > **Ignore this browser** so your own testing stops counting (also works on any page with `?asq_ignore=1`).
- [ ] Contact form: send a test message from the home page (wait a few seconds after typing). It should appear in admin > Messages as "emailed to you" and arrive in your inbox.

## Phase 8: Share it
- [ ] In admin > Sources > "Make a trackable link", build one link per place (LinkedIn post, GitHub README, CV, email signature).
      Example: `https://YOUR-URL/?ref=linkedin&utm_campaign=launch-post`. Always share those links, not the plain address.
- [ ] Add the GitHub link in your GitHub profile/README and LinkedIn "Featured" section using the tagged versions.
- [ ] Optional: add a share image (`og:image`) to `index.html` using the full `https://YOUR-URL/...` path so LinkedIn shows a preview picture.

## Phase 9: Keep it free and healthy
- [ ] Billing stays on **Workers Free**. Never click Upgrade.
- [ ] Every ~60 days: admin > Export, download Sessions, Events and AI chats as CSV and keep them (data older than 90 days is deleted automatically each night).
- [ ] Glance at admin > System now and then: it shows today's AI, database and event usage against the free limits.
- [ ] Optional: Dashboard > Notifications, add an email alert for Workers errors.

## Updating later
Edit any file (the JSON data files also feed the AI), then run `wrangler deploy`. Schema changes are announced with a new `wrangler d1 execute ... --file=schema.sql` command; it's safe to re-run.

## What protects you
| Risk | Protection |
|---|---|
| Surprise bill | Free plan hard-stops, no payment method, caps: 150 AI chats/day, 8,000 tracked events/day, admin read budget |
| Someone breaking into /admin | 2 factors (random 256-bit key + authenticator code), one-time codes, lockout after 5 failures, 12-hour sessions, secure cookie (HttpOnly, Secure, SameSite=Strict, `__Host-`), same-origin only, every attempt logged |
| Other sites using your AI or tracker | Server accepts calls only from your own site, JSON only, size limits, per-visitor limits |
| Contact form spam | Hidden trap field, "too fast" check, 3 messages per visitor per day, 30 per day overall, duplicate filter; the browser never talks to Google directly |
| Fake or junk analytics | Bots and headless browsers ignored, per-visitor event cap, input length limits |
| Leaking visitor IPs | Never stored; only a salted hash for rate limits and abuse control |
| Injection / clickjacking | CSP (the admin page has a stricter one with no inline code), X-Frame-Options, nosniff, HSTS |
| Source leaking | `worker/`, `tools/`, config and notes are excluded from the public site |

Known limits: pages still allow inline scripts (the site uses them); IP limits are shared on shared networks and can be bypassed with a VPN; the visitor's city is approximate (from their IP).

## Troubleshooting
- **Messages arrive in admin but not by email:** open the message: the red tag shows Google's reply. "forbidden" = the `SECRET` in Script properties doesn't match; "unable to open" / HTML = the Web app isn't deployed as "Anyone" or the URL is wrong; then use **Retry email** on the message. Check Apps Script > Executions for errors.
- **/admin says "Admin is not set up yet":** run `node tools/setup-secrets.mjs` (Phase 6) after deploying.
- **Sign-in says invalid:** check your phone's clock is automatic; codes change every 30 seconds and each can be used once, so wait for the next one.
- **Locked out:** wait 15 minutes. If you lost the key or authenticator, run `node tools/setup-secrets.mjs` again.
- **"AI is resting" for everyone:** today's free AI allowance is used (resets 00:00 UTC) or the model was retired. Check Logs (dashboard > your project), pick a current text model from https://developers.cloudflare.com/workers-ai/models/ and change `MODEL` in `worker/chat.js`.
- **Deploy says database not found:** the `database_id` in `wrangler.jsonc` is wrong, or Phase 4 step 3 wasn't run with `--remote`.
- **Chat says "Demo mode":** you opened the files locally. Use the deployed URL, or `wrangler dev`.
- **No visits show up:** you may have "Ignore this browser" on, or Do Not Track enabled (both stop tracking by design). Try a private window with `?asq_ignore=0`.
- **Page looks stale after deploy:** hard refresh (Ctrl+Shift+R).
