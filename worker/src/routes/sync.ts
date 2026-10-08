import { deleteMembershipStmt, entriesForOwner, existingTaskIds, setWalletStmt, tasksForOwner, upsertEntry, upsertTask, upsertUser, walletFor } from '../db/queries';
import { HttpError, json, readJson } from '../lib/json';
import { MAX_ENTRIES, MAX_TASKS, validateSyncBody } from '../lib/validate';
import { requireSession } from '../middleware/auth';
import { legacyMigration } from '../services/migrate';
import type { Ctx, Entry, Task } from '../types';

const entryKey = (e: { taskId: string; day: string }) => e.taskId + '\n' + e.day;

/**
 * Merges the device's changes into D1 and returns the caller's full state.
 * Tasks: newest `updated` wins. Entries: newest `t` wins. Rows the caller does
 * not own are ignored rather than rejected, so one bad row cannot block a sync.
 */
export async function sync(ctx: Ctx): Promise<Response> {
  const s = await requireSession(ctx);
  const body = validateSyncBody(await readJson(ctx.req));
  const db = ctx.env.DB;

  const tasks = new Map<string, Task>();
  for (const t of await tasksForOwner(db, s.sub)) tasks.set(t.id, t);
  const entries = new Map<string, Entry>();
  for (const e of await entriesForOwner(db, s.sub)) entries.set(entryKey(e), e);

  // The session may predate the users table (or the row may be missing); the tasks FK needs it.
  const writes: D1PreparedStatement[] = [upsertUser(db, s.sub, s.name, s.email)];

  const migration = tasks.size === 0 ? await legacyMigration(ctx.env, s.sub) : null;
  if (migration) {
    tasks.set(migration.task.id, migration.task);
    writes.push(upsertTask(db, migration.task));
    for (const e of migration.entries) {
      entries.set(entryKey(e), e);
      writes.push(upsertEntry(db, e));
    }
  }

  // A task id the caller does not have but that exists in D1 belongs to someone else.
  const unknownIds = body.tasks.map((t) => t.id).filter((id) => !tasks.has(id));
  const foreign = unknownIds.length ? await existingTaskIds(db, unknownIds) : new Set<string>();

  for (const incoming of body.tasks) {
    if (foreign.has(incoming.id)) continue;
    const cur = tasks.get(incoming.id);
    if (cur && incoming.updated <= cur.updated) continue;
    // Server owns groupId: a device cannot join, leave, or move a task into a group via /sync.
    const groupId = cur ? cur.groupId : null;
    const task: Task = { ...incoming, ownerId: s.sub, groupId };
    tasks.set(task.id, task);
    writes.push(upsertTask(db, task));
    // Soft-deleting a grouped task also leaves the group.
    if (task.deleted && groupId) writes.push(deleteMembershipStmt(db, groupId, s.sub));
  }

  for (const incoming of body.entries) {
    if (!tasks.has(incoming.taskId)) continue;
    const cur = entries.get(entryKey(incoming));
    if (cur && incoming.t <= cur.t) continue;
    entries.set(entryKey(incoming), incoming);
    writes.push(upsertEntry(db, incoming));
  }

  if (tasks.size > MAX_TASKS) throw new HttpError(413, 'too many tasks');
  if (entries.size > MAX_ENTRIES) throw new HttpError(413, 'too many entries');

  // Wallet: client-authoritative, newest `updated` wins (the SQL guard repeats the rule).
  let wallet = await walletFor(db, s.sub);
  if (body.wallet && body.wallet.updated > wallet.updated) {
    wallet = body.wallet;
    writes.push(setWalletStmt(db, s.sub, wallet));
  }

  if (writes.length > 1) await db.batch(writes);
  if (migration) await migration.finish();

  return json({ tasks: [...tasks.values()], entries: [...entries.values()], wallet, now: Date.now() }, 200, ctx.cors);
}
