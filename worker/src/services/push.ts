import { deletePushSub, markPushOk, recordPushFailure, type PushSub } from '../db/queries';
import { sendPush, type VapidKeys } from '../lib/webpush';
import type { Env } from '../types';

export const MAX_FAILURES = 5;

export interface PushMessage {
  title: string;
  body: string;
  tag: string;
  url: string;
}

export const vapidKeys = (env: Env): VapidKeys => ({ publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY, subject: env.VAPID_SUBJECT });

/**
 * Sends one message and keeps the subscription row honest: 404/410 deletes it, any other failure
 * counts toward MAX_FAILURES (then deletes it), success resets the count (and stamps `patch` days).
 * Returns true when the push service accepted the message.
 */
export async function deliver(
  env: Env,
  sub: Pick<PushSub, 'endpoint' | 'p256dh' | 'auth'>,
  msg: PushMessage,
  patch: { lastReminderDay?: string; lastWeeklyDay?: string } = {},
): Promise<boolean> {
  let status = 0;
  try {
    status = await sendPush(sub, msg, vapidKeys(env), { ttl: 3600 });
  } catch (e) {
    console.error('push send failed', e instanceof Error ? e.message : e);
  }
  if (status >= 200 && status < 300) {
    await markPushOk(env.DB, sub.endpoint, patch);
    return true;
  }
  if (status === 404 || status === 410) await deletePushSub(env.DB, sub.endpoint);
  else await recordPushFailure(env.DB, sub.endpoint, MAX_FAILURES);
  return false;
}
