import { randomToken, sha256 } from '../lib/crypto';
import type { Env, Session } from '../types';

const SESSION_TTL = 90 * 24 * 3600;

// Only the hash of the token is stored, so a KV dump does not yield usable sessions.
const key = async (token: string) => 's:' + (await sha256(token));

export function bearer(req: Request): string {
  const auth = req.headers.get('Authorization') || '';
  const t = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  return /^[A-Za-z0-9_-]{40,128}$/.test(t) ? t : '';
}

export async function createSession(env: Env, session: Session): Promise<string> {
  const token = randomToken();
  await env.DAYS.put(await key(token), JSON.stringify(session), { expirationTtl: SESSION_TTL });
  return token;
}

export async function getSession(env: Env, req: Request): Promise<Session | null> {
  const token = bearer(req);
  if (!token) return null;
  return env.DAYS.get<Session>(await key(token), 'json');
}

export async function deleteSession(env: Env, req: Request): Promise<void> {
  const token = bearer(req);
  if (token) await env.DAYS.delete(await key(token));
}

/** Account deletion: kills the caller's session and marks the sub so sessions on other devices die too. */
export async function markDeleted(env: Env, req: Request, sub: string): Promise<void> {
  await deleteSession(env, req);
  await env.DAYS.put('del:' + sub, String(Date.now()), { expirationTtl: SESSION_TTL });
  await env.DAYS.delete('g:' + sub); // the legacy single-tracker record would otherwise re-seed a "Gym" task
}

/**
 * True when the sub was deleted at or after the session was issued. A sign-in made after the
 * deletion (`session.at` is later) starts a fresh account and is allowed.
 */
export async function isDeleted(env: Env, s: Session): Promise<boolean> {
  const v = await env.DAYS.get('del:' + s.sub);
  return v != null && s.at <= (Number(v) || Infinity);
}
