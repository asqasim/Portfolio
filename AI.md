# ASQ Ai: how it works and how to manage it

## What is integrated
- **Service:** Cloudflare **Workers AI**. There is **no API key and no account with an AI company**: the Worker calls the model through a built-in binding named `AI` (declared in `wrangler.jsonc` as `"ai": { "binding": "AI" }`).
- **Model:** Meta **Llama 3.1 8B Instruct (FP8)**, `@cf/meta/llama-3.1-8b-instruct-fp8`. If it ever fails, the Worker automatically tries `@cf/meta/llama-3.1-8b-instruct-fast`, then `@cf/meta/llama-3.2-3b-instruct`.
- **Cost:** free. Cloudflare gives 10,000 "neurons" per day on the free plan and stops (never bills) when they run out. One chat message uses roughly 25 neurons, so about 400 messages a day fit; your cap is 150.

## Which file does what
| File | Responsibility |
|---|---|
| `worker/chat.js` | **The brain.** Model list, the instructions given to the AI (`systemPrompt`), the knowledge it is given (`siteFacts`), saving every chat, error handling |
| `assets/data/profile.json`, `projects.json`, `certifications.json` | **What the AI knows** about you. Edit these and redeploy; the AI learns the changes (cached 5 minutes) |
| `wrangler.jsonc` | The `AI` binding and the limits (`DAILY_LIMIT`, `GLOBAL_DAILY_CAP`, `MAX_INPUT_CHARS`, `MAX_OUTPUT_TOKENS`, optional `AI_MODELS`) |
| `worker/lib.js` | Per-visitor daily limit counters (10 messages per IP per day) |
| `worker/index.js` | Routes `/api/chat` and `/api/quota` to `chat.js` |
| `assets/js/chat.js` | The chat window (popup on the home page and the `/ai` page). If the server can't be reached it shows scripted "Demo mode" answers |
| `assets/css/chat.css` | How the chat looks |
| Admin > AI chats / System | Every conversation, and (for failures) the reason; today's usage |

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
| Chat shows **Demo mode** | The page couldn't reach `/api/quota` | Reload the page (Ctrl+Shift+R); check `/api/quota` opens in your browser |
| "limit reached" | The visitor used 10 messages today (or the global cap hit) | Normal; resets at 00:00 UTC |

Cloudflare's status of any model is on its page in the model catalogue; retirements are announced in the Workers AI changelog: https://developers.cloudflare.com/workers-ai/changelog/
