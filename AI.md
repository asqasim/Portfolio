# ASQ Ai: how it works and how to manage it

## What is integrated
- **Service:** Cloudflare **Workers AI**. There is **no API key and no account with an AI company**: the Worker calls the model through a built-in binding named `AI` (declared in `wrangler.jsonc` as `"ai": { "binding": "AI" }`).
- **Model:** Meta **Llama 3.1 8B Instruct (FP8)**, `@cf/meta/llama-3.1-8b-instruct-fp8`. If it ever fails, the Worker automatically tries `@cf/meta/llama-3.1-8b-instruct-fast`, then `@cf/meta/llama-3.2-3b-instruct`.
- **Cost:** free. Cloudflare gives 10,000 "neurons" per day on the free plan and stops (never bills) when they run out. One chat message uses roughly 25 neurons, so about 400 messages a day fit; your cap is 150.

## Which file does what
| File | Responsibility |
|---|---|
| `worker/chat.js` | **The brain.** Model list, the instructions given to the AI (`systemPrompt`), the knowledge it is given (`buildFacts`), visitor awareness, saving every chat, error handling |
| `assets/data/profile.json`, `projects.json`, `certifications.json` | **What the AI knows** about you. Edit these and redeploy; the AI learns the changes (cached 5 minutes) |
| `wrangler.jsonc` | The `AI` binding and the limits (`DAILY_LIMIT`, `GLOBAL_DAILY_CAP`, `MAX_INPUT_CHARS`, `MAX_OUTPUT_TOKENS`, optional `AI_MODELS`) |
| `worker/lib.js` | Per-visitor daily limit counters (10 messages per IP per day) |
| `worker/index.js` | Routes `/api/chat` and `/api/quota` to `chat.js` |
| `assets/js/ai-core.js` | **Shared brain for both sides** (browser and Worker): turns the visit trail into interests, decides which cards fit a question, builds personalised starter questions. Edit the keyword rules here |
| `assets/js/chat.js` | The `/ai` page (every "ASQ Ai" button on the site links here; there is no popup). Draws the cards and streams the answer. If the server can't be reached it shows cards only ("Offline") |
| `assets/js/track.js` | Also keeps a small local "visit trail" (pages, searches, sections) that the chat can use |
| `assets/css/chat.css` | How the chat looks |
| Admin > AI chats / System | Every conversation, and (for failures) the reason; today's usage |

## What it knows
Besides `profile.json`, `projects.json` and `certifications.json`, the AI reads `assets/data/about.json` (how you work, interests, what you are learning) and `assets/data/skills.json` (the Toolbox steps and which skills you are still learning). Questions like "how does he work?" get a card linking to the right part of the About page.

## Cards and visitor awareness
- **Cards.** Each reply starts with one event `{ui, step, chips}` naming which cards to show (project, projects, certs, skills, profile, contact, resume, link), then the AI's text streams in. The cards are drawn by the browser from your JSON files, so they can't contain invented facts. The AI is told which cards are showing and writes only a short lead-in. Add or change a card in `chat.js` (`uiHTML` and the `*Card` functions) and its trigger words in `route()` in `ai-core.js`.
- **Visit awareness.** `track.js` keeps the last ~30 things the visitor did in this browser (pages, project pages, searches, categories, sections, resume download) for 3 hours. When they send a chat message, that list goes along with it. The Worker checks every entry against your real data (unknown ids are dropped), turns it into a few lines under `VISITOR ACTIVITY`, puts the most relevant projects first in the AI's facts, and orders the cards the same way. The prompt tells the AI to use it quietly, only for things that are listed, and never to say it is tracking anyone.
- **Opt-out.** Nothing is sent when Do Not Track / Global Privacy Control is on, or when the visitor clicks **Turn off** under "Picking up from your visit" on the empty chat screen. The trail is not stored with the chat in the database.

## Common changes
**Switch model (no code edit).** Add to the `"vars"` block in `wrangler.jsonc`, then run `npm run deploy`:
```jsonc
"AI_MODELS": "@cf/meta/llama-3.2-3b-instruct, @cf/meta/llama-3.1-8b-instruct-fast"
```
Comma-separated, tried in order. Pick text-generation models from https://developers.cloudflare.com/workers-ai/models/ and skip any tagged **Deprecated**. Big models (70B) use roughly 10x the free allowance, so you'd run out after a few dozen messages.

**Change personality, tone or rules.** Edit the `systemPrompt` text in `worker/chat.js` (the "Rules:" list), then deploy.

**Make answers longer or shorter.** `MAX_OUTPUT_TOKENS` in `wrangler.jsonc` (350 is about 250 words).

**Change the daily limit.** `DAILY_LIMIT` (per visitor) and `GLOBAL_DAILY_CAP` (everyone together).

## When it doesn't work
1. Send a message on `/ai`, then open **Admin > AI chats**. A failed attempt shows a red `ai_error` with the reason after `[error]`.
2. Or watch it live: `npx wrangler tail`, then send a message.

| What the reason says | Meaning | Fix |
|---|---|---|
| `No such model` / model not found / deprecated | Cloudflare retired that model | Set `AI_MODELS` to a current model (above) and deploy |
| mentions your **free allocation** / 3036 | Today's 10,000 neurons are used | Wait for 00:00 UTC; lower the limits if it keeps happening |
| `Cannot read properties of undefined (reading 'run')` | The `AI` binding is missing from the deployed Worker | Check `"ai": { "binding": "AI" }` in `wrangler.jsonc`, then `npm run deploy` |
| Chat shows **Offline** | The page couldn't reach `/api/quota` | Reload the page (Ctrl+Shift+R); check `/api/quota` opens in your browser |
| "limit reached" | The visitor used 10 messages today (or the global cap hit) | Normal; resets at 00:00 UTC |

Cloudflare's status of any model is on its page in the model catalogue; retirements are announced in the Workers AI changelog: https://developers.cloudflare.com/workers-ai/changelog/
