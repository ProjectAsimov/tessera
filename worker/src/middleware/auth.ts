import { HttpError } from '../lib/json';
import { getSession, isDeleted } from '../services/sessions';
import type { Ctx, Session } from '../types';

/** Bearer token -> KV session -> caller. Throws 401 when missing, expired, or the account was deleted. */
export async function requireSession(ctx: Ctx): Promise<Session> {
  const s = await getSession(ctx.env, ctx.req);
  if (!s || (await isDeleted(ctx.env, s))) throw new HttpError(401, 'unauthorized');
  return s;
}
