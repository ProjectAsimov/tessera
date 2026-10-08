// Web Push sender: message encryption per RFC 8291 (aes128gcm content coding, RFC 8188) and
// VAPID authentication per RFC 8292, on WebCrypto only. No dependencies.

import { b64urlToBytes, bytesToB64url } from './crypto';

const enc = new TextEncoder();
const RECORD_SIZE = 4096;

export interface PushTarget {
  endpoint: string;
  /** Receiver public key, base64url of the 65-byte uncompressed P-256 point (PushSubscription `p256dh`). */
  p256dh: string;
  /** Receiver auth secret, base64url of 16 bytes. */
  auth: string;
}

export interface VapidKeys {
  /** base64url, 65-byte uncompressed point. */
  publicKey: string;
  /** base64url, raw 32-byte private scalar. */
  privateKey: string;
  /** `mailto:` or `https:` contact for the push service operator. */
  subject: string;
}

/** Overridable pieces of `encryptPayload`, for known-answer tests. */
export interface EncryptOverrides {
  salt?: Uint8Array;
  senderKeys?: CryptoKeyPair;
}

const concat = (...parts: Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
};

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, length * 8));
}

/** Builds an ECDSA/ECDH P-256 key pair from base64url raw public point and (optionally) private scalar. */
export async function importP256(publicKey: string, privateKey: string | null, algorithm: 'ECDH' | 'ECDSA'): Promise<CryptoKeyPair> {
  const pub = b64urlToBytes(publicKey);
  if (pub.length !== 65 || pub[0] !== 4) throw new Error('bad P-256 public key');
  const jwk = { kty: 'EC', crv: 'P-256', x: bytesToB64url(pub.slice(1, 33)), y: bytesToB64url(pub.slice(33)) };
  const usagesPub: string[] = algorithm === 'ECDH' ? [] : ['verify'];
  const usagesPriv: string[] = algorithm === 'ECDH' ? ['deriveBits'] : ['sign'];
  const pubKey = await crypto.subtle.importKey('jwk', jwk, { name: algorithm, namedCurve: 'P-256' }, true, usagesPub);
  const privKey = privateKey
    ? await crypto.subtle.importKey('jwk', { ...jwk, d: privateKey }, { name: algorithm, namedCurve: 'P-256' }, false, usagesPriv)
    : (undefined as unknown as CryptoKey);
  return { publicKey: pubKey, privateKey: privKey };
}

/**
 * Encrypts `plaintext` for a subscription: returns the full request body (86-byte header with salt,
 * record size and sender key id, then one AES-128-GCM record).
 */
export async function encryptPayload(plaintext: Uint8Array, target: Pick<PushTarget, 'p256dh' | 'auth'>, o: EncryptOverrides = {}): Promise<Uint8Array> {
  const uaPublic = b64urlToBytes(target.p256dh);
  const authSecret = b64urlToBytes(target.auth);
  if (authSecret.length !== 16) throw new Error('bad auth secret');
  const uaKey = (await importP256(target.p256dh, null, 'ECDH')).publicKey;

  const sender = o.senderKeys ?? ((await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair);
  const asPublic = new Uint8Array((await crypto.subtle.exportKey('raw', sender.publicKey)) as ArrayBuffer);
  const salt = o.salt ?? crypto.getRandomValues(new Uint8Array(16));

  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey } as unknown as SubtleCryptoDeriveKeyAlgorithm, sender.privateKey, 256));
  const keyInfo = concat(enc.encode('WebPush: info\0'), uaPublic, asPublic);
  const ikm = await hkdf(authSecret, ecdh, keyInfo, 32);
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);

  // One record: plaintext + delimiter 0x02 (last record). Must fit in RECORD_SIZE with the 16-byte tag.
  if (plaintext.length + 1 + 16 > RECORD_SIZE) throw new Error('payload too large');
  const aes = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const body = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aes, concat(plaintext, new Uint8Array([2]))));

  const header = new Uint8Array(21 + asPublic.length);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, RECORD_SIZE);
  header[20] = asPublic.length;
  header.set(asPublic, 21);
  return concat(header, body);
}

/** Signs a VAPID JWT (ES256) for the push service origin of `endpoint`. `exp` is 12 hours out. */
export async function vapidJwt(endpoint: string, vapid: VapidKeys, nowMs = Date.now()): Promise<string> {
  const b64 = (o: unknown) => bytesToB64url(enc.encode(JSON.stringify(o)));
  const unsigned = b64({ typ: 'JWT', alg: 'ES256' }) + '.' + b64({ aud: new URL(endpoint).origin, exp: Math.floor(nowMs / 1000) + 12 * 3600, sub: vapid.subject });
  const { privateKey } = await importP256(vapid.publicKey, vapid.privateKey, 'ECDSA');
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privateKey, enc.encode(unsigned)));
  return unsigned + '.' + bytesToB64url(sig); // WebCrypto already emits the raw r||s form JWS wants
}

export async function vapidAuthorization(endpoint: string, vapid: VapidKeys, nowMs = Date.now()): Promise<string> {
  return `vapid t=${await vapidJwt(endpoint, vapid, nowMs)}, k=${vapid.publicKey}`;
}

/** Builds the push-service request (encrypted body + TTL / Content-Encoding / Authorization headers). */
export async function buildPushRequest(target: PushTarget, payload: unknown, vapid: VapidKeys, opts: { ttl?: number; urgency?: string } = {}): Promise<Request> {
  const body = await encryptPayload(enc.encode(JSON.stringify(payload)), target);
  return new Request(target.endpoint, {
    method: 'POST',
    headers: {
      TTL: String(opts.ttl ?? 3600),
      Urgency: opts.urgency ?? 'normal',
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      Authorization: await vapidAuthorization(target.endpoint, vapid),
    },
    body,
  });
}

/** Sends one push and returns the push service's HTTP status (201 on success; 404/410 = subscription gone). */
export async function sendPush(target: PushTarget, payload: unknown, vapid: VapidKeys, opts: { ttl?: number; urgency?: string } = {}): Promise<number> {
  const res = await fetch(await buildPushRequest(target, payload, vapid, opts));
  await res.body?.cancel();
  return res.status;
}
