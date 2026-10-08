import { DAY } from '../lib/validate';
import type { Entry, Env, Task } from '../types';

interface LegacyRecord {
  v: 1;
  days: Record<string, { on: unknown; t: unknown }>;
}

export interface Migration {
  task: Task;
  entries: Entry[];
  /** Call after the rows are committed so a failed sync can retry the migration. */
  finish: () => Promise<void>;
}

/**
 * The single-tracker app stored one record per user in KV (`g:<sub>`). On a
 * user's first sync into the multi-task model that record becomes a "Gym" task.
 */
export async function legacyMigration(env: Env, sub: string): Promise<Migration | null> {
  const key = 'g:' + sub;
  const rec = await env.DAYS.get<LegacyRecord>(key, 'json');
  if (!rec || typeof rec !== 'object' || !rec.days || typeof rec.days !== 'object') return null;

  const now = Date.now();
  const task: Task = {
    id: crypto.randomUUID(),
    ownerId: sub,
    name: 'Gym',
    color: 'purple',
    icon: 'dumbbell',
    archived: 0,
    groupId: null,
    created: now,
    updated: now,
    deleted: 0,
    target: 1,
  };
  const entries: Entry[] = [];
  for (const [day, v] of Object.entries(rec.days)) {
    const t = Number(v?.t);
    if (!DAY.test(day) || !Number.isFinite(t) || t < 0) continue;
    entries.push({ taskId: task.id, day, on: v.on ? 1 : 0, t, n: v.on ? 1 : 0, kind: 0 });
  }
  return { task, entries, finish: () => env.DAYS.delete(key) };
}
