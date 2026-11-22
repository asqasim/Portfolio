#!/usr/bin/env node
/* Connects your Google Apps Script (apps-script/Code.gs) to the Worker so contact messages are emailed to you.
   Usage:  npm run contact
   It makes a secret, tells you where to paste it, asks for your Web app URL, and uploads both to Cloudflare as encrypted secrets.
   Optional flags for automation: --url=<web app url> --yes */
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import readline from 'node:readline/promises';

const args = process.argv.slice(2), flag = n => (args.find(a => a.startsWith(`--${n}=`)) || '').slice(n.length + 3);
const secret = crypto.randomBytes(32).toString('base64url');

console.log(`
=====================================================================
 STEP A: in your Apps Script project
   Project Settings (gear icon) > Script properties > Add script property
   Property:  SECRET
   Value:     ${secret}
   Save script properties.
=====================================================================
`);

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
if (!args.includes('--yes')) await rl.question('Done? Press Enter, then deploy the script as a Web app (Deploy > New deployment) ... ');
let url = flag('url') || (await rl.question('Paste the Web app URL (it ends in /exec): ')).trim();
rl.close();
if (!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(url)) {
  console.error('\nThat does not look like a Web app URL. It should start with https://script.google.com/macros/s/ and end with /exec.\nIf it ends with /dev, deploy the script as a Web app and use the /exec link.');
  process.exit(1);
}

for (const [name, value] of [['CONTACT_WEBHOOK_URL', url], ['CONTACT_WEBHOOK_SECRET', secret]]) {
  process.stdout.write(`Uploading ${name} ... `);
  const r = spawnSync('npx', ['wrangler', 'secret', 'put', name], { input: value + '\n', stdio: ['pipe', 'inherit', 'inherit'], shell: process.platform === 'win32' });
  if (r.status !== 0) { console.error(`\nFailed to upload ${name}. Make sure you are logged in ("npx wrangler login") and have deployed once.`); process.exit(1) }
}
console.log('\nDone. Open /admin > System > "Send a test email" to check it works.\nIf you re-run this script, paste the NEW secret into your Apps Script properties again.');
