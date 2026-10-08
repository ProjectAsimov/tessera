import { HttpError } from './json';
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
