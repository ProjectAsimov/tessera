import { HttpError } from './json';
import { b64urlToBytes } from './crypto';
import type { Entry, Task, Wallet } from '../types';

export const MAX_TASKS = 200;
export const MAX_ENTRIES = 20000;
export const MAX_MILESTONES = 2000;
export const DAY = /^\d{4}-\d{2}-\d{2}$/;

export const ID = /^[A-Za-z0-9_-]{1,64}$/;
const SHORT = /^[a-z0-9_-]{1,32}$/; // color / icon ids from the app palette and icon set

export type IncomingTask = Omit<Task, 'ownerId'>;

export interface SyncBody {
  tasks: IncomingTask[];
  entries: Entry[];
  wallet: Wallet | null;
}

/** Checks shape, field types and per-request limits. Throws 400 or 413. */
export function validateSyncBody(body: unknown): SyncBody {
  if (!isObject(body)) throw new HttpError(400, 'body must be an object');
  const { tasks, entries } = body;
  if (!Array.isArray(tasks)) throw new HttpError(400, 'tasks must be an array');
  if (!Array.isArray(entries)) throw new HttpError(400, 'entries must be an array');
  if (tasks.length > MAX_TASKS) throw new HttpError(413, 'too many tasks');
  if (entries.length > MAX_ENTRIES) throw new HttpError(413, 'too many entries');
  return {
    tasks: tasks.map((t, i) => validateTask(t, i)),
    entries: entries.map((e, i) => validateEntry(e, i)),
    wallet: body.wallet == null ? null : validateWallet(body.wallet),
  };
}

function validateTask(t: unknown, i: number): IncomingTask {
  const bad = (f: string) => new HttpError(400, `tasks[${i}].${f} invalid`);
  if (!isObject(t)) throw new HttpError(400, `tasks[${i}] must be an object`);
  if (typeof t.id !== 'string' || !ID.test(t.id)) throw bad('id');
  if (typeof t.name !== 'string' || t.name.length < 1 || t.name.length > 80) throw bad('name');
  if (typeof t.color !== 'string' || !SHORT.test(t.color)) throw bad('color');
  if (typeof t.icon !== 'string' || !SHORT.test(t.icon)) throw bad('icon');
  if (t.groupId != null && (typeof t.groupId !== 'string' || !ID.test(t.groupId))) throw bad('groupId');
  if (!isMs(t.created)) throw bad('created');
  if (!isMs(t.updated)) throw bad('updated');
  if (t.target !== undefined && !isInt(t.target, 1, 20)) throw bad('target');
  return {
    id: t.id,
    name: t.name,
    color: t.color,
    icon: t.icon,
    archived: flag(t.archived),
    groupId: t.groupId ?? null,
    created: t.created,
    updated: t.updated,
    deleted: flag(t.deleted),
    target: t.target === undefined ? 1 : t.target as number,
  };
}

function validateEntry(e: unknown, i: number): Entry {
  const bad = (f: string) => new HttpError(400, `entries[${i}].${f} invalid`);
  if (!isObject(e)) throw new HttpError(400, `entries[${i}] must be an object`);
  if (typeof e.taskId !== 'string' || !ID.test(e.taskId)) throw bad('taskId');
  if (typeof e.day !== 'string' || !DAY.test(e.day)) throw bad('day');
  if (!isMs(e.t)) throw bad('t');
  if (e.n !== undefined && !isInt(e.n, 0, 999)) throw bad('n');
  if (e.kind !== undefined && !isInt(e.kind, 0, 2)) throw bad('kind');
  const on = flag(e.on);
  return { taskId: e.taskId, day: e.day, on, t: e.t, n: e.n === undefined ? on : (e.n as number), kind: (e.kind ?? 0) as 0 | 1 | 2 };
}

function validateWallet(w: unknown): Wallet {
  const bad = (f: string) => new HttpError(400, `wallet.${f} invalid`);
  if (!isObject(w)) throw new HttpError(400, 'wallet must be an object');
  if (!isInt(w.gems, 0, 1_000_000)) throw bad('gems');
  if (!isInt(w.freezes, 0, 2)) throw bad('freezes');
  if (!isMs(w.updated)) throw bad('updated');
  if (!Array.isArray(w.milestones) || w.milestones.length > MAX_MILESTONES) throw bad('milestones');
  for (const m of w.milestones) if (typeof m !== 'string' || m.length < 1 || m.length > 80) throw bad('milestones');
  return { gems: w.gems, freezes: w.freezes, milestones: w.milestones as string[], updated: w.updated };
}

export function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function validateTaskId(v: unknown): string {
  if (typeof v !== 'string' || !ID.test(v)) throw new HttpError(400, 'taskId invalid');
  return v;
}

export function validateUserId(v: unknown): string {
  if (typeof v !== 'string' || !ID.test(v)) throw new HttpError(400, 'userId invalid');
  return v;
}

/** Loose on purpose: an unrecognized code is a 404 from the group lookup, not a 400 here. */
export function validateCode(v: unknown): string {
  if (typeof v !== 'string' || v.length < 1 || v.length > 32) throw new HttpError(400, 'code invalid');
  return v;
}

export function validateToday(v: unknown): string {
  if (typeof v !== 'string' || !DAY.test(v)) throw new HttpError(400, 'today invalid');
  return v;
}

function isMs(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0;
}

function isInt(v: unknown, min: number, max: number): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
}

function flag(v: unknown): 0 | 1 {
  return v ? 1 : 0;
}

export const MAX_REASON = 500;

export function validateReason(v: unknown): string {
  if (typeof v !== 'string') throw new HttpError(400, 'reason invalid');
  const r = v.trim();
  if (r.length < 1 || r.length > MAX_REASON) throw new HttpError(400, `reason must be 1-${MAX_REASON} characters`);
  return r;
}

// --- push (Slice C) ---

export interface PushSubscribeBody {
  endpoint: string;
  p256dh: string;
  auth: string;
  tz: string;
  reminderHour: number | null;
  weekly: 0 | 1;
}

const B64URL = /^[A-Za-z0-9_-]+$/;

function b64urlBytes(v: unknown): Uint8Array | null {
  if (typeof v !== 'string' || !B64URL.test(v)) return null;
  try { return b64urlToBytes(v); } catch { return null; }
}

/** https only (http too when `allowHttp`, for a local stub push service). */
export function validatePushEndpoint(v: unknown, allowHttp: boolean): string {
  if (typeof v !== 'string' || v.length < 1 || v.length > 2048) throw new HttpError(400, 'endpoint invalid');
  let u: URL;
  try { u = new URL(v); } catch { throw new HttpError(400, 'endpoint invalid'); }
  if (u.protocol !== 'https:' && !(allowHttp && u.protocol === 'http:')) throw new HttpError(400, 'endpoint invalid');
  if (u.username || u.password) throw new HttpError(400, 'endpoint invalid');
  return v;
}

/** An IANA zone name the runtime accepts, e.g. `America/Chicago`. */
export function validateTimeZone(v: unknown): string {
  if (typeof v !== 'string' || v.length < 1 || v.length > 64) throw new HttpError(400, 'tz invalid');
  try { new Intl.DateTimeFormat('en-US', { timeZone: v }); } catch { throw new HttpError(400, 'tz invalid'); }
  return v;
}

export function validateReminderHour(v: unknown): number | null {
  if (v === null) return null;
  if (!isInt(v, 0, 23)) throw new HttpError(400, 'reminderHour invalid');
  return v;
}

function validateWeekly(v: unknown): 0 | 1 {
  if (typeof v !== 'boolean' && v !== 0 && v !== 1) throw new HttpError(400, 'weekly invalid');
  return flag(v);
}

export function validatePushSubscribe(body: unknown, allowHttp: boolean): PushSubscribeBody {
  if (!isObject(body)) throw new HttpError(400, 'body must be an object');
  const sub = body.subscription;
  if (!isObject(sub)) throw new HttpError(400, 'subscription invalid');
  const endpoint = validatePushEndpoint(sub.endpoint, allowHttp);
  if (!isObject(sub.keys)) throw new HttpError(400, 'keys invalid');
  const p256dh = b64urlBytes(sub.keys.p256dh);
  if (!p256dh || p256dh.length !== 65 || p256dh[0] !== 4) throw new HttpError(400, 'p256dh invalid');
  const auth = b64urlBytes(sub.keys.auth);
  if (!auth || auth.length !== 16) throw new HttpError(400, 'auth invalid');
  return {
    endpoint,
    p256dh: sub.keys.p256dh as string,
    auth: sub.keys.auth as string,
    tz: validateTimeZone(body.tz),
    reminderHour: body.reminderHour === undefined ? null : validateReminderHour(body.reminderHour),
    weekly: body.weekly === undefined ? 1 : validateWeekly(body.weekly),
  };
}

export interface PushPrefsBody {
  endpoint: string;
  reminderHour?: number | null;
  weekly?: 0 | 1;
  tz?: string;
}

/** Fields left out of a prefs body stay unchanged. */
export function validatePushPrefs(body: unknown, allowHttp: boolean): PushPrefsBody {
  if (!isObject(body)) throw new HttpError(400, 'body must be an object');
  const out: PushPrefsBody = { endpoint: validatePushEndpoint(body.endpoint, allowHttp) };
  if (body.reminderHour !== undefined) out.reminderHour = validateReminderHour(body.reminderHour);
  if (body.weekly !== undefined) out.weekly = validateWeekly(body.weekly);
  if (body.tz !== undefined) out.tz = validateTimeZone(body.tz);
  return out;
}
