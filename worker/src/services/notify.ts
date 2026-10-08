// Cron-driven notifications: the daily reminder and the weekly recap (docs/ARCHITECTURE.md, Slice C).

import { markPushDay, onEntriesForLiveTasks, pushSubsDueCandidates, tasksNotDone, type PushSub } from '../db/queries';
import { addDays, localTime } from '../lib/localtime';
import type { Env } from '../types';
import { deliver, type PushMessage } from './push';

const APP_URL = '/tessera/';
const WEEKLY_HOUR = 18; // local, on Sundays
const CONCURRENCY = 10;

export interface RunSummary {
  candidates: number;
  reminders: number;
  recaps: number;
}

/** One cron tick: sends whatever is due at `now` (ms). Safe to run repeatedly; each local day is stamped. */
export async function runNotifications(env: Env, now: number): Promise<RunSummary> {
  const subs = await pushSubsDueCandidates(env.DB);
  const sum: RunSummary = { candidates: subs.length, reminders: 0, recaps: 0 };
  for (let i = 0; i < subs.length; i += CONCURRENCY) {
    await Promise.all(
      subs.slice(i, i + CONCURRENCY).map(async (sub) => {
        try {
          const r = await processSub(env, sub, now);
          sum.reminders += r.reminder ? 1 : 0;
          sum.recaps += r.recap ? 1 : 0;
        } catch (e) {
          console.error('notify failed', e instanceof Error ? e.message : e);
        }
      }),
    );
  }
  return sum;
}

async function processSub(env: Env, sub: PushSub, now: number): Promise<{ reminder: boolean; recap: boolean }> {
  const lt = localTime(sub.tz, now);
  const out = { reminder: false, recap: false };

  if (sub.reminderHour !== null && lt.hour === sub.reminderHour && sub.lastReminderDay !== lt.date) {
    const left = await tasksNotDone(env.DB, sub.userId, lt.date);
    if (left.length === 0) await markPushDay(env.DB, sub.endpoint, { lastReminderDay: lt.date });
    else out.reminder = await deliver(env, sub, reminderMessage(left.map((t) => t.name)), { lastReminderDay: lt.date });
  }

  if (sub.weekly && lt.weekday === 0 && lt.hour === WEEKLY_HOUR && sub.lastWeeklyDay !== lt.date) {
    const msg = await weeklyMessage(env, sub.userId, lt.date);
    if (!msg) await markPushDay(env.DB, sub.endpoint, { lastWeeklyDay: lt.date });
    else out.recap = await deliver(env, sub, msg, { lastWeeklyDay: lt.date });
  }
  return out;
}

export function reminderMessage(names: string[]): PushMessage {
  const body = names.length === 1 ? `${names[0]} left today` : `${names.length} tasks left today`;
  return { title: 'Tessera', body, tag: 'reminder', url: APP_URL };
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * Recap for the Mon-Sun week ending `sunday` (the user's local date): task-days done vs the week before,
 * and the longest current streak. Counts normal days only (frozen/repaired days are not "done").
 * Null when the user has no live tasks.
 */
async function weeklyMessage(env: Env, userId: string, sunday: string): Promise<PushMessage | null> {
  const rows = await onEntriesForLiveTasks(env.DB, userId);
  if (rows.length === 0 && (await tasksNotDone(env.DB, userId, sunday)).length === 0) return null;

  const thisFrom = addDays(sunday, -6);
  const lastFrom = addDays(sunday, -13);
  let thisWeek = 0;
  let lastWeek = 0;
  const activeTasks = new Set<string>();
  const daysByTask = new Map<string, { name: string; days: Set<string> }>();
  for (const r of rows) {
    let t = daysByTask.get(r.taskId);
    if (!t) daysByTask.set(r.taskId, (t = { name: r.name, days: new Set() }));
    t.days.add(r.day); // frozen and repaired days still keep a streak
    if (r.kind !== 0) continue;
    if (r.day >= thisFrom && r.day <= sunday) { thisWeek++; activeTasks.add(r.taskId); }
    else if (r.day >= lastFrom && r.day < thisFrom) lastWeek++;
  }

  let best: { name: string; len: number } | null = null;
  for (const t of daysByTask.values()) {
    let d = t.days.has(sunday) ? sunday : addDays(sunday, -1); // today not marked yet keeps yesterday's run alive
    let len = 0;
    while (t.days.has(d)) { len++; d = addDays(d, -1); }
    if (len > 0 && (!best || len > best.len || (len === best.len && t.name < best.name))) best = { name: t.name, len };
  }

  let body = `This week: ${plural(thisWeek, 'day')} across ${plural(activeTasks.size, 'task')} (last week ${lastWeek}).`;
  if (best) body += ` Longest streak: ${best.name}, ${plural(best.len, 'day')}.`;
  return { title: 'Tessera', body, tag: 'weekly', url: APP_URL };
}
