import { deletePushSub, pushSubFor, updatePushPrefs, upsertPushSub } from '../db/queries';
import { HttpError, json, readJson } from '../lib/json';
import { isObject, validatePushEndpoint, validatePushPrefs, validatePushSubscribe } from '../lib/validate';
import { requireSession } from '../middleware/auth';
import { runNotifications } from '../services/notify';
import { deliver } from '../services/push';
import type { Ctx } from '../types';

const allowHttp = (ctx: Ctx) => ctx.env.DEV_PUSH_HTTP === '1';

/** Public: the app needs the VAPID key before it can subscribe. */
export async function pushKey(ctx: Ctx): Promise<Response> {
  return json({ publicKey: ctx.env.VAPID_PUBLIC_KEY }, 200, ctx.cors);
}

export async function pushSubscribe(ctx: Ctx): Promise<Response> {
  const s = await requireSession(ctx);
  const b = validatePushSubscribe(await readJson(ctx.req), allowHttp(ctx));
  await upsertPushSub(ctx.env.DB, { ...b, userId: s.sub }, Date.now());
  return json({ ok: true }, 200, ctx.cors);
}

export async function pushPrefs(ctx: Ctx): Promise<Response> {
  const s = await requireSession(ctx);
  const b = validatePushPrefs(await readJson(ctx.req), allowHttp(ctx));
  if (!(await updatePushPrefs(ctx.env.DB, s.sub, b.endpoint, b))) throw new HttpError(404, 'subscription not found');
  return json({ ok: true }, 200, ctx.cors);
}

/** Idempotent: unsubscribing something already gone is fine. */
export async function pushUnsubscribe(ctx: Ctx): Promise<Response> {
  const s = await requireSession(ctx);
  const body = await readJson(ctx.req);
  const endpoint = validatePushEndpoint(isObject(body) ? body.endpoint : undefined, allowHttp(ctx));
  await deletePushSub(ctx.env.DB, endpoint, s.sub);
  return json({ ok: true }, 200, ctx.cors);
}

/** Sends "Notifications are on" to one of the caller's endpoints; 1 per minute per user. */
export async function pushTest(ctx: Ctx): Promise<Response> {
  const s = await requireSession(ctx);
  const body = await readJson(ctx.req);
  const endpoint = validatePushEndpoint(isObject(body) ? body.endpoint : undefined, allowHttp(ctx));
  const sub = await pushSubFor(ctx.env.DB, s.sub, endpoint);
  if (!sub) throw new HttpError(404, 'subscription not found');

  const limitKey = 'pt:' + s.sub;
  if (await ctx.env.DAYS.get(limitKey)) throw new HttpError(429, 'try again in a minute');
  await ctx.env.DAYS.put(limitKey, '1', { expirationTtl: 60 }); // 60 s is KV's minimum TTL

  const ok = await deliver(ctx.env, sub, { title: 'Tessera', body: 'Notifications are on', tag: 'test', url: '/tessera/' });
  if (!ok) throw new HttpError(502, 'push service rejected the message');
  return json({ ok: true }, 200, ctx.cors);
}

/**
 * Local testing only (`--var DEV_NOW_OVERRIDE:1`): runs the notification pass as if it were `?now=<ISO>`.
 * wrangler's `/__scheduled` cannot set the clock. Without the flag this route does not exist.
 */
export async function devNotify(ctx: Ctx): Promise<Response> {
  if (ctx.env.DEV_NOW_OVERRIDE !== '1') throw new HttpError(404, 'not found');
  const raw = ctx.url.searchParams.get('now');
  const now = raw ? Date.parse(raw) : Date.now();
  if (!Number.isFinite(now)) throw new HttpError(400, 'now invalid');
  return json(await runNotifications(ctx.env, now), 200, ctx.cors);
}
