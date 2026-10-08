// Generates a VAPID (P-256) key pair for Web Push.
//   node scripts/vapid.mjs [--force]
// Prints the PUBLIC key (put it in wrangler.toml as VAPID_PUBLIC_KEY). The private key (the raw 32-byte
// scalar, base64url) is written ONLY to the secrets file below and never printed. Then run:
//   npx wrangler secret put VAPID_PRIVATE_KEY      (paste the file's contents)
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const FILE = 'C:/Users/User/.secrets/tasktracker/vapid-private.txt';
if (existsSync(FILE) && !process.argv.includes('--force')) {
  console.error(`${FILE} already exists; pass --force to overwrite (this invalidates every existing subscription).`);
  process.exit(1);
}
const { publicKey, privateKey } = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const raw = new Uint8Array(await crypto.subtle.exportKey('raw', publicKey));
const jwk = await crypto.subtle.exportKey('jwk', privateKey);
mkdirSync(dirname(FILE), { recursive: true });
writeFileSync(FILE, jwk.d + '\n');
console.log('VAPID_PUBLIC_KEY = "' + Buffer.from(raw).toString('base64url') + '"');
console.log('private key written to ' + FILE);
