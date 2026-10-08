import { json, readJson } from '../lib/json';
import { isObject, validateCode, validateTaskId, validateToday, validateUserId } from '../lib/validate';
import { requireSession } from '../middleware/auth';
import { createGroup, getBoard, joinGroup, leaveGroup, previewGroup, removeMember, shout } from '../services/groups';
import type { Ctx } from '../types';

export async function createGroupRoute(ctx: Ctx): Promise<Response> {
  const s = await requireSession(ctx);
  const body = await readJson(ctx.req);
  const taskId = validateTaskId(isObject(body) ? body.taskId : undefined);
  const result = await createGroup(ctx.env, s.sub, taskId);
  return json(result, 200, ctx.cors);
}

export async function previewGroupRoute(ctx: Ctx): Promise<Response> {
  const code = validateCode(ctx.url.searchParams.get('code'));
  const result = await previewGroup(ctx.env, code);
  return json(result, 200, ctx.cors);
}

export async function joinGroupRoute(ctx: Ctx): Promise<Response> {
  const s = await requireSession(ctx);
  const body = await readJson(ctx.req);
  const code = validateCode(isObject(body) ? body.code : undefined);
  const result = await joinGroup(ctx.env, s, code);
  return json(result, 200, ctx.cors);
}

export async function boardRoute(ctx: Ctx, groupId: string): Promise<Response> {
  const s = await requireSession(ctx);
  const today = validateToday(ctx.url.searchParams.get('today'));
  const result = await getBoard(ctx.env, groupId, s.sub, today);
  return json(result, 200, ctx.cors);
}

export async function leaveRoute(ctx: Ctx, groupId: string): Promise<Response> {
  const s = await requireSession(ctx);
  await leaveGroup(ctx.env, groupId, s.sub);
  return json({ ok: true }, 200, ctx.cors);
}

export async function removeRoute(ctx: Ctx, groupId: string): Promise<Response> {
  const s = await requireSession(ctx);
  const body = await readJson(ctx.req);
  const userId = validateUserId(isObject(body) ? body.userId : undefined);
  await removeMember(ctx.env, groupId, s.sub, userId);
  return json({ ok: true }, 200, ctx.cors);
}

export async function shoutRoute(ctx: Ctx, groupId: string): Promise<Response> {
  const s = await requireSession(ctx);
  const body = await readJson(ctx.req);
  const userId = validateUserId(isObject(body) ? body.userId : undefined);
  const today = validateToday(ctx.url.searchParams.get('today') ?? (isObject(body) ? body.today : undefined));
  const result = await shout(ctx.env, groupId, s.sub, userId, today);
  return json(result, 200, ctx.cors);
}
