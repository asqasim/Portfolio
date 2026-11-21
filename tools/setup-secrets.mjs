#!/usr/bin/env node
/* One-time setup: creates your admin key, the authenticator-app secret and the IP salt, and uploads them to Cloudflare as encrypted secrets.
   Usage:  node tools/setup-secrets.mjs            (generate + upload)
           node tools/setup-secrets.mjs --print    (generate only; you add the secrets yourself in the dashboard)
   Running it again replaces all three (your old admin key and authenticator entry stop working). */
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import readline from 'node:readline/promises';

const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const b32 = buf => { let bits = '', out = ''; for (const b of buf) bits += b.toString(2).padStart(8, '0'); for (let i = 0; i + 5 <= bits.length; i += 5) out += A[parseInt(bits.slice(i, i + 5), 2)]; return out };
const args = new Set(process.argv.slice(2));

const adminKey = crypto.randomBytes(32).toString('base64url');
const secrets = {
  ADMIN_KEY_HASH: crypto.createHash('sha256').update(adminKey).digest('hex'),
  TOTP_SECRET: b32(crypto.randomBytes(20)),
  IP_SALT: crypto.randomBytes(32).toString('hex')
};
const uri = `otpauth://totp/Portfolio%20Admin?secret=${secrets.TOTP_SECRET}&issuer=Portfolio&algorithm=SHA1&digits=6&period=30`;

console.log(`
=====================================================================
 SAVE THESE NOW (password manager). They are shown only once.
=====================================================================

 1) ADMIN KEY (you type this on the login page):

    ${adminKey}

 2) AUTHENTICATOR APP (Google Authenticator, Microsoft Authenticator,
    Authy, 1Password, Bitwarden...): add an account manually
    ("Enter a setup key"), type = time-based, then enter:

    Account: Portfolio Admin
    Key:     ${secrets.TOTP_SECRET}

    (1Password / Bitwarden can also take this link:)
    ${uri}

 The key + the 6-digit code from the app are both needed to sign in.
=====================================================================
`);

if (args.has('--print')) {
  console.log('Add these three secrets in the Cloudflare dashboard (Workers & Pages > your project > Settings > Variables and Secrets > Add, type "Secret"):\n');
  for (const [k, v] of Object.entries(secrets)) console.log(`  ${k} = ${v}`);
  process.exit(0);
}

if (!args.has('--yes')) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const a = (await rl.question('Have you saved the admin key and added the authenticator entry? Type "yes" to upload the secrets: ')).trim().toLowerCase();
  rl.close();
  if (a !== 'yes') { console.log('Nothing uploaded. Run the script again when you are ready.'); process.exit(1) }
}

for (const [name, value] of Object.entries(secrets)) {
  process.stdout.write(`Uploading ${name} ... `);
  const r = spawnSync('wrangler', ['secret', 'put', name], { input: value + '\n', stdio: ['pipe', 'inherit', 'inherit'], shell: process.platform === 'win32' });
  if (r.status !== 0) { console.error(`\nFailed to upload ${name}. Make sure you ran "wrangler login", and "wrangler deploy" at least once (the secrets attach to the deployed project). Then run this script again.`); process.exit(1) }
}
console.log('\nDone. Now open /admin on your site and sign in.');
