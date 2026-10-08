// Run: npx tsx tests/webpush.test.mjs
// Known-answer test against RFC 8291 Appendix A / section 5, plus VAPID JWT and request-shape checks.
import assert from 'node:assert/strict';
import { b64urlToBytes, bytesToB64url } from '../src/lib/crypto.ts';
import { buildPushRequest, encryptPayload, importP256, vapidJwt } from '../src/lib/webpush.ts';

let failed = 0;
async function check(name, fn) {
  try { await fn(); console.log('PASS ' + name); } catch (e) { failed++; console.log('FAIL ' + name + '\n  ' + (e.stack || e)); }
}

const AS_PRIVATE = 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw';
const AS_PUBLIC = 'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8';
const UA_PUBLIC = 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4';
const AUTH = 'BTBZMqHH6r4Tts7J_aSIgg';
const SALT = 'DGv6ra1nlYgDCS1FRnbzlw';
const EXPECTED =
  'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN';

await check('RFC 8291 Appendix A: ciphertext reproduced exactly', async () => {
  const senderKeys = await importP256(AS_PUBLIC, AS_PRIVATE, 'ECDH');
  const body = await encryptPayload(new TextEncoder().encode('When I grow up, I want to be a watermelon'), { p256dh: UA_PUBLIC, auth: AUTH }, { salt: b64urlToBytes(SALT), senderKeys });
  assert.equal(bytesToB64url(body), EXPECTED);
  assert.equal(body.length, 144); // 86-byte header + 41 + 1 + 16 (the RFC prose says 145; its own body is 144)
});

// A real VAPID key pair, as scripts/vapid.mjs would make.
const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const vapid = {
  publicKey: bytesToB64url(new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey))),
  privateKey: (await crypto.subtle.exportKey('jwk', pair.privateKey)).d,
  subject: 'mailto:tasktracker.support@gmail.com',
};
const endpoint = 'https://push.example.net/push/JzLQ3raZJfFBR0aqvOMsLrt54w4rJUsV';

await check('VAPID JWT verifies with WebCrypto against the public key; claims are right', async () => {
  const now = Date.now();
  const jwt = await vapidJwt(endpoint, vapid, now);
  const [h, c, s] = jwt.split('.');
  const pub = await crypto.subtle.importKey('raw', b64urlToBytes(vapid.publicKey), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pub, b64urlToBytes(s), new TextEncoder().encode(h + '.' + c));
  assert.equal(ok, true);
  assert.equal(b64urlToBytes(s).length, 64);
  assert.deepEqual(JSON.parse(new TextDecoder().decode(b64urlToBytes(h))), { typ: 'JWT', alg: 'ES256' });
  const claims = JSON.parse(new TextDecoder().decode(b64urlToBytes(c)));
  assert.equal(claims.aud, 'https://push.example.net');
  assert.equal(claims.sub, vapid.subject);
  assert.equal(claims.exp, Math.floor(now / 1000) + 43200);
});

await check('VAPID JWT does not verify against a different key', async () => {
  const other = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const [h, c, s] = (await vapidJwt(endpoint, vapid)).split('.');
  const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, other.publicKey, b64urlToBytes(s), new TextEncoder().encode(h + '.' + c));
  assert.equal(ok, false);
});

await check('request shape: POST, TTL, Content-Encoding, Authorization vapid t=..., k=...', async () => {
  const req = await buildPushRequest({ endpoint, p256dh: UA_PUBLIC, auth: AUTH }, { title: 'T', body: 'B' }, vapid, { ttl: 120 });
  assert.equal(req.method, 'POST');
  assert.equal(req.url, endpoint);
  assert.equal(req.headers.get('TTL'), '120');
  assert.equal(req.headers.get('Content-Encoding'), 'aes128gcm');
  assert.match(req.headers.get('Authorization'), new RegExp(String.raw`^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=${vapid.publicKey}$`));
  const body = new Uint8Array(await req.arrayBuffer());
  assert.equal(body[20], 65); // keyid length: uncompressed sender public key
  assert.equal(new DataView(body.buffer, body.byteOffset).getUint32(16), 4096);
});

await check('rejects malformed receiver keys', async () => {
  await assert.rejects(encryptPayload(new Uint8Array([1]), { p256dh: 'AAAA', auth: AUTH }));
  await assert.rejects(encryptPayload(new Uint8Array([1]), { p256dh: UA_PUBLIC, auth: 'AAAA' }));
});

import { validatePushEndpoint } from '../src/lib/validate.ts';
await check('production validation: endpoint must be https (http only with the dev flag)', async () => {
  assert.throws(() => validatePushEndpoint('http://127.0.0.1:8799/x', false), { status: 400 });
  assert.throws(() => validatePushEndpoint('https://user:pw@push.example.net/x', false), { status: 400 });
  assert.equal(validatePushEndpoint('https://fcm.googleapis.com/fcm/send/abc', false), 'https://fcm.googleapis.com/fcm/send/abc');
  assert.equal(validatePushEndpoint('http://127.0.0.1:8799/x', true), 'http://127.0.0.1:8799/x');
});

console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
