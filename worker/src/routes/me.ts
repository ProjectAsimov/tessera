import { blockedBy, deleteAccountStmts } from '../db/queries';
import { json } from '../lib/json';
import { requireSession } from '../middleware/auth';
import { markDeleted } from '../services/sessions';
import type { Ctx } from '../types';

export async function me(ctx: Ctx): Promise<Response> {
  const s = await requireSession(ctx);
  return json({ id: s.sub, name: s.name, email: s.email }, 200, ctx.cors);
}

export async function myBlocks(ctx: Ctx): Promise<Response> {
  const s = await requireSession(ctx);
  return json({ userIds: await blockedBy(ctx.env.DB, s.sub) }, 200, ctx.cors);
}

/** Deletes the account and everything it owns (see docs/ARCHITECTURE.md, Slice A.1). */
export async function deleteMe(ctx: Ctx): Promise<Response> {
  const s = await requireSession(ctx);
  await ctx.env.DB.batch(deleteAccountStmts(ctx.env.DB, s.sub, Date.now()));
  await markDeleted(ctx.env, ctx.req, s.sub);
  return json({ ok: true }, 200, ctx.cors);
}
