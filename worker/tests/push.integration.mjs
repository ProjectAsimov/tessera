// Integration test for Slice C against a running local worker plus a stub push service.
//   1. node scripts/migrate.mjs --local
//   2. npx wrangler dev --port 8787 --test-scheduled --var DEV_PUSH_HTTP:1 --var DEV_NOW_OVERRIDE:1 --var VAPID_PRIVATE_KEY:<key>
//   3. node tests/push.integration.mjs
// Plants users/sessions/tasks/entries in the LOCAL D1/KV (ids prefixed `pt-`), subscribes them to a stub
// push service on :8799 that decrypts what it receives (RFC 8291, receiver side), then drives the cron
// with /__scheduled?time=<ms>.
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'http://127.0.0.1:8787';
const STUB = 'http://127.0.0.1:8799';
const enc = new TextEncoder();
const b64u = (u8) => Buffer.from(u8).toString('base64url');
const unb64u = (s) => new Uint8Array(Buffer.from(s, 'base64url'));
const wranglerToml = readFileSync(join(root, 'wrangler.toml'), 'utf8');
const PUBLIC_KEY = /VAPID_PUBLIC_KEY = "([^"]+)"/.exec(wranglerToml)[1];

const results = [];
function record(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok || !detail ? '' : '  -> ' + detail));
}
const eq = (name, got, want) => record(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

// ---- wrangler helpers (local persistence, same as `wrangler dev`) ----
function wr(args) {
  const r = spawnSync('npx', ['wrangler', ...args], { cwd: root, encoding: 'utf8', shell: true, maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(r.stdout + r.stderr);
  return r.stdout;
}
function sql(q) {
  const out = wr(['d1', 'execute', 'tasktracker', '--local', '--json', '--command', JSON.stringify(q)]);
  return JSON.parse(out.slice(out.indexOf('[')))[0].results;
}
function sqlFile(text) {
  const dir = mkdtempSync(join(tmpdir(), 'pt-'));
  const f = join(dir, 'x.sql');
  writeFileSync(f, text);
  try { wr(['d1', 'execute', 'tasktracker', '--local', '--file', JSON.stringify(f)]); } finally { rmSync(dir, { recursive: true, force: true }); }
}
function kvPut(key, value) {
  const dir = mkdtempSync(join(tmpdir(), 'pt-'));
  const f = join(dir, 'v.json');
  writeFileSync(f, value);
  try { wr(['kv', 'key', 'put', JSON.stringify(key), '--path', JSON.stringify(f), '--binding', 'DAYS', '--local']); } finally { rmSync(dir, { recursive: true, force: true }); }
}

// ---- local time (independent of the worker's implementation) ----
function local(tz, ms) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit' }).formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) % 24 };
}

// ---- stub push service: decrypts every message it gets ----
const receivers = new Map(); // path -> { priv, pub (raw bytes), auth (bytes) }
const received = []; // { path, headers, msg }
async function newReceiver(path) {
  const kp = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const pub = new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey));
  const auth = crypto.getRandomValues(new Uint8Array(16));
  receivers.set(path, { priv: kp.privateKey, pub, auth });
  return { p256dh: b64u(pub), auth: b64u(auth) };
}
async function hkdf(salt, ikm, info, len) {
  const k = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, k, len * 8));
}
async function decrypt(path, body) {
  const r = receivers.get(path);
  const salt = body.slice(0, 16);
  const idlen = body[20];
  const asPub = body.slice(21, 21 + idlen);
  const asKey = await crypto.subtle.importKey('raw', asPub, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: asKey }, r.priv, 256));
  const cat = (...a) => Buffer.concat(a.map((x) => Buffer.from(x)));
  const ikm = await hkdf(r.auth, ecdh, cat(enc.encode('WebPush: info\0'), r.pub, asPub), 32);
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']);
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, key, body.slice(21 + idlen)));
  let end = plain.length;
  while (end > 0 && plain[end - 1] === 0) end--;
  if (plain[end - 1] !== 2) throw new Error('bad padding delimiter');
  return JSON.parse(new TextDecoder().decode(plain.slice(0, end - 1)));
}
const server = createServer((req, res) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', async () => {
    const path = req.url;
    const status = path.startsWith('/gone') ? 410 : path.startsWith('/err') ? 500 : 201;
    let msg = null;
    if (req.method === 'POST' && receivers.has(path)) {
      try { msg = await decrypt(path, new Uint8Array(Buffer.concat(chunks))); } catch (e) { msg = { decryptError: String(e) }; }
    }
    received.push({ path, method: req.method, headers: req.headers, msg, status });
    res.writeHead(status).end();
  });
});
await new Promise((r) => server.listen(8799, '127.0.0.1', r));
const got = (path) => received.filter((r) => r.path === path);

// ---- HTTP helpers ----
async function call(method, path, token, body) {
  const res = await fetch(BASE + path, { method, headers: { ...(token ? { Authorization: 'Bearer ' + token } : {}), 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  let json = null;
  try { json = await res.json(); } catch { /* empty */ }
  return { status: res.status, json };
}
const cron = async () => (await fetch(`${BASE}/__scheduled?cron=*/15+*+*+*+*`)).status; // real cron path, runs at the current time
const cronAt = async (ms) => (await fetch(`${BASE}/__notify?now=${new Date(ms).toISOString()}`)).status;

// ---- plant ----
const USERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'R'];
const token = Object.fromEntries(USERS.map((u) => [u, `pt${u}` + 'x'.repeat(46)]));
const uid = (u) => 'pt-' + u;
const now = Date.now();
const chi = local('America/Chicago', now);
const ber = local('Europe/Berlin', now);
const dayKey = (d) => d;

let planting = `DELETE FROM push_subs WHERE user_id LIKE 'pt-%';
DELETE FROM entries WHERE task_id LIKE 'pt-%';
DELETE FROM tasks WHERE id LIKE 'pt-%';
DELETE FROM users WHERE id LIKE 'pt-%';
`;
for (const u of USERS) planting += `INSERT INTO users (id, name, email, created) VALUES ('${uid(u)}', 'Test ${u}', '${u}@example.com', ${now});\n`;
const task = (id, owner, name, created) => `INSERT INTO tasks (id, owner_id, name, color, icon, archived, created, updated, deleted, target) VALUES ('${id}', '${uid(owner)}', '${name}', 'red', 'dumbbell', 0, ${created}, ${created}, 0, 1);\n`;
const entry = (taskId, day, kind = 0) => `INSERT INTO entries (task_id, day, on_, t, n, kind) VALUES ('${taskId}', '${day}', 1, ${now}, 1, ${kind});\n`;
planting += task('pt-tA', 'A', 'Gym', 1) + task('pt-tB', 'B', 'Read', 1) + task('pt-tC1', 'C', 'Gym', 1) + task('pt-tC2', 'C', 'Run', 2);
planting += task('pt-tD', 'D', 'Swim', 1) + task('pt-tE', 'E', 'Yoga', 1);
planting += entry('pt-tC1', chi.date) + entry('pt-tC2', chi.date);
// F: weekly recap fixture. Sunday 2026-10-04 (Mon 09-28 .. Sun 10-04; previous week 09-21 .. 09-27).
planting += task('pt-tF1', 'F', 'Gym', 1) + task('pt-tF2', 'F', 'Run', 2);
const D = (m, d) => `2026-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
for (let d = 21; d <= 30; d++) planting += entry('pt-tF1', D(9, d)); // Gym 09-21..09-30 ...
for (let d = 1; d <= 4; d++) planting += entry('pt-tF1', D(10, d)); // ... and 10-01..10-04 (14 straight days)
planting += entry('pt-tF1', D(9, 20), 1); // frozen day: keeps the streak (15), not counted as done
for (const day of [D(9, 28), D(9, 29), D(10, 1), D(10, 4)]) planting += entry('pt-tF2', day); // Run this week x4
for (const day of [D(9, 22), D(9, 25)]) planting += entry('pt-tF2', day); // Run last week x2
// G has the same data but weekly off.
planting += task('pt-tG', 'G', 'Gym', 1) + entry('pt-tG', D(10, 4));
planting += task('pt-tH', 'H', 'Gym', 1);
sqlFile(planting);
for (const u of USERS) {
  const key = 's:' + createHash('sha256').update(token[u]).digest('hex');
  kvPut(key, JSON.stringify({ sub: uid(u), name: 'Test ' + u, email: u + '@example.com', at: Date.now() }));
}

async function subscribe(u, name, o) {
  const path = '/' + name;
  const keys = await newReceiver(path);
  const r = await call('POST', '/push/subscribe', token[u], { subscription: { endpoint: STUB + path, keys }, tz: o.tz, reminderHour: o.reminderHour ?? null, weekly: o.weekly ?? false });
  if (r.status !== 200) throw new Error(`subscribe ${name} -> ${r.status} ${JSON.stringify(r.json)}`);
  return path;
}
const row = (ep) => sql(`SELECT * FROM push_subs WHERE endpoint = '${STUB}${ep}'`)[0];

try {
  // ---------- routes ----------
  const key = await call('GET', '/push/key');
  eq('GET /push/key returns the public key (no session)', [key.status, key.json?.publicKey === PUBLIC_KEY], [200, true]);

  const good = { subscription: { endpoint: STUB + '/ok/R', keys: await newReceiver('/ok/R') }, tz: 'America/Chicago', reminderHour: 19, weekly: true };
  const mod = (f) => { const c = structuredClone(good); f(c); return c; };
  eq('subscribe without session -> 401', (await call('POST', '/push/subscribe', null, good)).status, 401);
  eq('subscribe with bogus token -> 401', (await call('POST', '/push/subscribe', 'z'.repeat(50), good)).status, 401);
  eq('subscribe bad endpoint (not a URL) -> 400', (await call('POST', '/push/subscribe', token.R, mod((c) => { c.subscription.endpoint = 'not a url'; }))).status, 400);
  eq('subscribe bad endpoint (ftp) -> 400', (await call('POST', '/push/subscribe', token.R, mod((c) => { c.subscription.endpoint = 'ftp://x.example/y'; }))).status, 400);
  eq('subscribe short p256dh -> 400', (await call('POST', '/push/subscribe', token.R, mod((c) => { c.subscription.keys.p256dh = 'AAAA'; }))).status, 400);
  eq('subscribe p256dh without 0x04 prefix -> 400', (await call('POST', '/push/subscribe', token.R, mod((c) => { c.subscription.keys.p256dh = b64u(new Uint8Array(65)); }))).status, 400);
  eq('subscribe short auth -> 400', (await call('POST', '/push/subscribe', token.R, mod((c) => { c.subscription.keys.auth = 'AAAA'; }))).status, 400);
  eq('subscribe missing keys -> 400', (await call('POST', '/push/subscribe', token.R, mod((c) => { delete c.subscription.keys; }))).status, 400);
  eq('subscribe bad tz -> 400', (await call('POST', '/push/subscribe', token.R, mod((c) => { c.tz = 'Mars/Base'; }))).status, 400);
  eq('subscribe reminderHour 24 -> 400', (await call('POST', '/push/subscribe', token.R, mod((c) => { c.reminderHour = 24; }))).status, 400);
  eq('no rows created by rejected subscribes', sql(`SELECT count(*) AS n FROM push_subs WHERE user_id = '${uid('R')}'`)[0].n, 0);
  eq('subscribe valid -> 200', (await call('POST', '/push/subscribe', token.R, good)).status, 200);
  const r1 = row('/ok/R');
  eq('subscribe stored the row', [r1.user_id, r1.tz, r1.reminder_hour, r1.weekly, r1.failures, r1.last_reminder_day], [uid('R'), 'America/Chicago', 19, 1, 0, null]);
  await call('POST', '/push/subscribe', token.R, { ...good, tz: 'Europe/Berlin', reminderHour: 8 });
  eq('subscribe again upserts by endpoint (one row, new values)', [sql(`SELECT count(*) AS n FROM push_subs WHERE endpoint = '${STUB}/ok/R'`)[0].n, row('/ok/R').tz, row('/ok/R').reminder_hour], [1, 'Europe/Berlin', 8]);

  eq('prefs without session -> 401', (await call('POST', '/push/prefs', null, { endpoint: STUB + '/ok/R', reminderHour: 7 })).status, 401);
  eq('prefs update -> 200', (await call('POST', '/push/prefs', token.R, { endpoint: STUB + '/ok/R', reminderHour: 7, weekly: false })).status, 200);
  eq('prefs stored', [row('/ok/R').reminder_hour, row('/ok/R').weekly, row('/ok/R').tz], [7, 0, 'Europe/Berlin']);
  eq('prefs reminderHour null turns reminder off', (await call('POST', '/push/prefs', token.R, { endpoint: STUB + '/ok/R', reminderHour: null, weekly: true })).status, 200);
  eq('prefs null stored', [row('/ok/R').reminder_hour, row('/ok/R').weekly], [null, 1]);
  eq('prefs reminderHour 99 -> 400', (await call('POST', '/push/prefs', token.R, { endpoint: STUB + '/ok/R', reminderHour: 99 })).status, 400);
  eq('prefs unknown endpoint -> 404', (await call('POST', '/push/prefs', token.R, { endpoint: STUB + '/ok/nope', reminderHour: 7 })).status, 404);

  // other user's endpoint: set up A's sub now (used in cron tests too)
  const pA = await subscribe('A', 'ok/A', { tz: 'America/Chicago', reminderHour: chi.hour });
  eq("prefs on another user's endpoint -> 404", (await call('POST', '/push/prefs', token.R, { endpoint: STUB + pA, reminderHour: 3 })).status, 404);
  eq("test on another user's endpoint -> 404", (await call('POST', '/push/test', token.R, { endpoint: STUB + pA })).status, 404);
  eq("unsubscribe another user's endpoint leaves it", [(await call('POST', '/push/unsubscribe', token.R, { endpoint: STUB + pA })).status, !!row(pA)], [200, true]);

  const t1 = await call('POST', '/push/test', token.R, { endpoint: STUB + '/ok/R' });
  eq('push/test -> 200', t1.status, 200);
  const testMsg = got('/ok/R')[0];
  eq('push/test reached the stub once, decrypted, "Notifications are on"', [got('/ok/R').length, testMsg?.msg?.body, testMsg?.msg?.title, testMsg?.msg?.tag], [1, 'Notifications are on', 'Tessera', 'test']);
  eq('push request headers: TTL, Content-Encoding, vapid Authorization', [testMsg.headers.ttl, testMsg.headers['content-encoding'], /^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=/.test(testMsg.headers.authorization) && testMsg.headers.authorization.endsWith('k=' + PUBLIC_KEY)], ['3600', 'aes128gcm', true]);
  // verify the JWT the worker sent against the public key
  {
    const [h, c, s] = testMsg.headers.authorization.slice(8, testMsg.headers.authorization.indexOf(',')).split('.');
    const pub = await crypto.subtle.importKey('raw', unb64u(PUBLIC_KEY), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pub, unb64u(s), enc.encode(h + '.' + c));
    const claims = JSON.parse(Buffer.from(c, 'base64url').toString());
    eq('VAPID JWT from the running worker verifies; aud/sub right', [ok, claims.aud, claims.sub], [true, STUB, 'mailto:tasktracker.support@gmail.com']);
  }
  eq('push/test second call within a minute -> 429', (await call('POST', '/push/test', token.R, { endpoint: STUB + '/ok/R' })).status, 429);
  eq('429 sent nothing', got('/ok/R').length, 1);

  eq('unsubscribe -> 200 and row gone', [(await call('POST', '/push/unsubscribe', token.R, { endpoint: STUB + '/ok/R' })).status, row('/ok/R')], [200, undefined]);
  eq('unsubscribe again is idempotent', (await call('POST', '/push/unsubscribe', token.R, { endpoint: STUB + '/ok/R' })).status, 200);
  eq('push/test after unsubscribe -> 404', (await call('POST', '/push/test', token.R, { endpoint: STUB + '/ok/R' })).status, 404);

  // ---------- daily reminders ----------
  const pB = await subscribe('B', 'ok/B', { tz: 'Europe/Berlin', reminderHour: (ber.hour + 3) % 24 });
  const pC = await subscribe('C', 'ok/C', { tz: 'America/Chicago', reminderHour: chi.hour });
  const pD = await subscribe('D', 'gone/D', { tz: 'America/Chicago', reminderHour: chi.hour });
  const pE = await subscribe('E', 'err/E', { tz: 'America/Chicago', reminderHour: chi.hour });

  eq('cron #1 accepted', await cron(), 200);
  eq('A (Chicago, hour matches, 1 unmarked task) got exactly one reminder "Gym left today"', [got(pA).length, got(pA)[0]?.msg], [1, { title: 'Tessera', body: 'Gym left today', tag: 'reminder', url: '/tessera/' }]);
  eq('B (Berlin, hour does not match) got none', got(pB).length, 0);
  eq('C (hour matches, all tasks marked) got none', got(pC).length, 0);
  eq('A last_reminder_day = Chicago local date', row(pA).last_reminder_day, chi.date);
  eq('C last_reminder_day set too (handled, nothing to send)', row(pC).last_reminder_day, chi.date);
  eq('B last_reminder_day untouched', row(pB).last_reminder_day, null);
  eq('D (410) was sent to once and then deleted', [got(pD).length, row(pD)], [1, undefined]);
  eq('E (500) failures = 1, still subscribed, no day stamped', [row(pE).failures, row(pE).last_reminder_day], [1, null]);

  await cron();
  eq('cron #2 same hour: A sends nothing more', got(pA).length, 1);
  eq('cron #2: E failures = 2', row(pE).failures, 2);
  for (let i = 3; i <= 4; i++) await cron();
  eq('cron #3-4: E failures = 4, still present', row(pE)?.failures, 4);
  await cron();
  eq('cron #5: E deleted on the 5th failure; stub saw 5 attempts', [row(pE), got(pE).length], [undefined, 5]);
  eq('A still exactly one reminder after 5 crons', got(pA).length, 1);
  eq('B still none after 5 crons', got(pB).length, 0);

  // multi-task wording and "all done" -> nothing
  sqlFile(`INSERT INTO tasks (id, owner_id, name, color, icon, archived, created, updated, deleted, target) VALUES ('pt-tA2', '${uid('A')}', 'Run', 'red', 'x', 0, 2, 2, 0, 1), ('pt-tA3', '${uid('A')}', 'Old', 'red', 'x', 1, 3, 3, 0, 1), ('pt-tA4', '${uid('A')}', 'Gone', 'red', 'x', 0, 4, 4, 1, 1);
UPDATE push_subs SET last_reminder_day = NULL WHERE endpoint = '${STUB}${pA}';`);
  await cron();
  eq('two live tasks (archived + deleted ignored) -> "2 tasks left today"', got(pA).slice(1).map((r) => r.msg?.body), ['2 tasks left today']);

  // ---------- weekly recap ----------
  const pF = await subscribe('F', 'ok/F', { tz: 'America/Chicago', reminderHour: null, weekly: true });
  const pG = await subscribe('G', 'ok/G', { tz: 'America/Chicago', reminderHour: null, weekly: false });
  const sunday = Date.UTC(2026, 9, 4, 23, 5); // Sunday 18:05 in Chicago (CDT)
  eq('fixture really is Sunday 18:xx Chicago', [local('America/Chicago', sunday).date, local('America/Chicago', sunday).hour, new Date(sunday - 5 * 3600e3).getUTCDay()], ['2026-10-04', 18, 0]);
  await cronAt(sunday);
  eq('F got one recap with the right numbers', got(pF).map((r) => r.msg?.body), ['This week: 11 days across 2 tasks (last week 9). Longest streak: Gym, 15 days.']);
  eq('F recap tag/url', [got(pF)[0]?.msg?.tag, got(pF)[0]?.msg?.url], ['weekly', '/tessera/']);
  eq('F last_weekly_day = 2026-10-04', row(pF).last_weekly_day, '2026-10-04');
  eq('G (weekly off) got none', got(pG).length, 0);
  await cronAt(sunday + 10 * 60_000);
  eq('second cron the same Sunday evening: no second recap', got(pF).length, 1);
  await cronAt(Date.UTC(2026, 9, 5, 23, 5)); // Monday 18:05
  eq('Monday 18:05: no recap', got(pF).length, 1);
  await cronAt(Date.UTC(2026, 9, 4, 22, 5)); // Sunday 17:05 Chicago
  eq('Sunday 17:05 (wrong hour): no recap for G/others', got(pG).length, 0);

  // ---------- account deletion ----------
  await subscribe('H', 'ok/H1', { tz: 'America/Chicago', reminderHour: 5 });
  await subscribe('H', 'ok/H2', { tz: 'Europe/Berlin', reminderHour: null });
  eq('H has two subs', sql(`SELECT count(*) AS n FROM push_subs WHERE user_id = '${uid('H')}'`)[0].n, 2);
  eq('DELETE /me -> 200', (await call('DELETE', '/me', token.H)).status, 200);
  eq("DELETE /me removed the user's subs (others untouched)", [sql(`SELECT count(*) AS n FROM push_subs WHERE user_id = '${uid('H')}'`)[0].n, !!row(pA)], [0, true]);
} finally {
  server.close();
  try {
    sqlFile(`DELETE FROM push_subs WHERE user_id LIKE 'pt-%'; DELETE FROM entries WHERE task_id LIKE 'pt-%'; DELETE FROM tasks WHERE id LIKE 'pt-%'; DELETE FROM users WHERE id LIKE 'pt-%';`);
  } catch { /* best effort */ }
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
