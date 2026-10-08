import type { Entry, Group, Membership, Task, Wallet } from '../types';

interface TaskRow {
  id: string; owner_id: string; name: string; color: string; icon: string;
  archived: number; group_id: string | null; created: number; updated: number; deleted: number; target: number;
}
interface EntryRow { task_id: string; day: string; on_: number; t: number; n: number; kind: number }

const taskFromRow = (r: TaskRow): Task => ({
  id: r.id, ownerId: r.owner_id, name: r.name, color: r.color, icon: r.icon,
  archived: r.archived ? 1 : 0, groupId: r.group_id, created: r.created, updated: r.updated,
  deleted: r.deleted ? 1 : 0, target: r.target,
});
const entryFromRow = (r: EntryRow): Entry => ({
  taskId: r.task_id, day: r.day, on: r.on_ ? 1 : 0, t: r.t, n: r.n, kind: r.kind === 1 ? 1 : r.kind === 2 ? 2 : 0,
});

export function upsertUser(db: D1Database, id: string, name: string, email: string): D1PreparedStatement {
  return db
    .prepare('INSERT INTO users (id, name, email, created) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(id) DO UPDATE SET name = ?2, email = ?3')
    .bind(id, name, email, Date.now());
}

export async function tasksForOwner(db: D1Database, ownerId: string): Promise<Task[]> {
  const { results } = await db.prepare('SELECT * FROM tasks WHERE owner_id = ?').bind(ownerId).all<TaskRow>();
  return results.map(taskFromRow);
}

export async function entriesForOwner(db: D1Database, ownerId: string): Promise<Entry[]> {
  const { results } = await db
    .prepare('SELECT e.task_id, e.day, e.on_, e.t, e.n, e.kind FROM entries e JOIN tasks t ON t.id = e.task_id WHERE t.owner_id = ?')
    .bind(ownerId)
    .all<EntryRow>();
  return results.map(entryFromRow);
}

/** Which of these task ids already exist (under any owner). Chunked: D1 caps bound parameters per statement. */
export async function existingTaskIds(db: D1Database, ids: string[]): Promise<Set<string>> {
  const found = new Set<string>();
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    const sql = `SELECT id FROM tasks WHERE id IN (${chunk.map(() => '?').join(',')})`;
    const { results } = await db.prepare(sql).bind(...chunk).all<{ id: string }>();
    for (const r of results) found.add(r.id);
  }
  return found;
}

// The WHERE guards repeat the merge rule in SQL so a sync racing another
// device's write cannot roll a newer row back to an older one.
export function upsertTask(db: D1Database, t: Task): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO tasks (id, owner_id, name, color, icon, archived, group_id, created, updated, deleted, target)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
       ON CONFLICT(id) DO UPDATE SET
         name = ?3, color = ?4, icon = ?5, archived = ?6, group_id = ?7, created = ?8, updated = ?9, deleted = ?10, target = ?11
       WHERE tasks.owner_id = ?2 AND ?9 > tasks.updated`,
    )
    .bind(t.id, t.ownerId, t.name, t.color, t.icon, t.archived, t.groupId, t.created, t.updated, t.deleted, t.target);
}

export function upsertEntry(db: D1Database, e: Entry): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO entries (task_id, day, on_, t, n, kind) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
       ON CONFLICT(task_id, day) DO UPDATE SET on_ = ?3, t = ?4, n = ?5, kind = ?6 WHERE ?4 > entries.t`,
    )
    .bind(e.taskId, e.day, e.on, e.t, e.n, e.kind);
}

export async function taskById(db: D1Database, id: string): Promise<Task | null> {
  const row = await db.prepare('SELECT * FROM tasks WHERE id = ?').bind(id).first<TaskRow>();
  return row ? taskFromRow(row) : null;
}

// --- groups / memberships (phase 2) ---

interface GroupRow {
  id: string; name: string; host_id: string; invite_code: string; member_limit: number; created: number;
}

const groupFromRow = (r: GroupRow, members: number): Group => ({
  id: r.id, name: r.name, hostId: r.host_id, inviteCode: r.invite_code, memberLimit: r.member_limit, members, created: r.created,
});

export async function insertGroup(db: D1Database, g: Omit<Group, 'members'>): Promise<void> {
  await db
    .prepare('INSERT INTO groups (id, name, host_id, invite_code, member_limit, created) VALUES (?1, ?2, ?3, ?4, ?5, ?6)')
    .bind(g.id, g.name, g.hostId, g.inviteCode, g.memberLimit, g.created)
    .run();
}

export async function groupById(db: D1Database, id: string): Promise<Group | null> {
  const row = await db.prepare('SELECT * FROM groups WHERE id = ?').bind(id).first<GroupRow>();
  return row ? groupFromRow(row, await memberCount(db, row.id)) : null;
}

export async function groupByCode(db: D1Database, code: string): Promise<Group | null> {
  const row = await db.prepare('SELECT * FROM groups WHERE invite_code = ?').bind(code).first<GroupRow>();
  return row ? groupFromRow(row, await memberCount(db, row.id)) : null;
}

export async function codeTaken(db: D1Database, code: string): Promise<boolean> {
  const row = await db.prepare('SELECT 1 FROM groups WHERE invite_code = ?').bind(code).first();
  return row != null;
}

export async function memberCount(db: D1Database, groupId: string): Promise<number> {
  const row = await db.prepare('SELECT COUNT(*) AS n FROM memberships WHERE group_id = ?').bind(groupId).first<{ n: number }>();
  return row?.n ?? 0;
}

interface MembershipRow { group_id: string; user_id: string; task_id: string; joined: number }
const membershipFromRow = (r: MembershipRow): Membership => (
  { groupId: r.group_id, userId: r.user_id, taskId: r.task_id, joined: r.joined }
);

export function insertMembershipStmt(db: D1Database, m: Membership): D1PreparedStatement {
  return db
    .prepare('INSERT INTO memberships (group_id, user_id, task_id, joined) VALUES (?1, ?2, ?3, ?4)')
    .bind(m.groupId, m.userId, m.taskId, m.joined);
}

export async function insertMembership(db: D1Database, m: Membership): Promise<void> {
  await insertMembershipStmt(db, m).run();
}

export async function membership(db: D1Database, groupId: string, userId: string): Promise<Membership | null> {
  const row = await db
    .prepare('SELECT * FROM memberships WHERE group_id = ? AND user_id = ?')
    .bind(groupId, userId)
    .first<MembershipRow>();
  return row ? membershipFromRow(row) : null;
}

export function deleteMembershipStmt(db: D1Database, groupId: string, userId: string): D1PreparedStatement {
  return db.prepare('DELETE FROM memberships WHERE group_id = ? AND user_id = ?').bind(groupId, userId);
}

export function clearTaskGroupStmt(db: D1Database, taskId: string, updated: number): D1PreparedStatement {
  return db.prepare('UPDATE tasks SET group_id = NULL, updated = ? WHERE id = ?').bind(updated, taskId);
}

export function setTaskGroupStmt(db: D1Database, taskId: string, groupId: string, updated: number): D1PreparedStatement {
  return db.prepare('UPDATE tasks SET group_id = ?, updated = ? WHERE id = ?').bind(groupId, updated, taskId);
}

export async function userName(db: D1Database, id: string): Promise<string | null> {
  const row = await db.prepare('SELECT name FROM users WHERE id = ?').bind(id).first<{ name: string }>();
  return row?.name ?? null;
}

interface MemberTaskRow { user_id: string; name: string; task_id: string }

/** Members whose task still exists and is not soft-deleted (a deleted task leaves the board). */
export async function groupMemberTasks(db: D1Database, groupId: string): Promise<{ userId: string; name: string; taskId: string }[]> {
  const { results } = await db
    .prepare(
      `SELECT m.user_id, u.name, m.task_id
       FROM memberships m JOIN users u ON u.id = m.user_id JOIN tasks t ON t.id = m.task_id
       WHERE m.group_id = ? AND t.deleted = 0`,
    )
    .bind(groupId)
    .all<MemberTaskRow>();
  return results.map((r) => ({ userId: r.user_id, name: r.name, taskId: r.task_id }));
}

/** Days marked "on" for each of these tasks (newest first), with their kind (1/2 = freeze/repair). Chunked like existingTaskIds. */
export async function onDaysByTask(db: D1Database, taskIds: string[]): Promise<Map<string, { day: string; kind: number }[]>> {
  const out = new Map<string, { day: string; kind: number }[]>();
  for (let i = 0; i < taskIds.length; i += 50) {
    const chunk = taskIds.slice(i, i + 50);
    const sql = `SELECT task_id, day, kind FROM entries WHERE on_ = 1 AND task_id IN (${chunk.map(() => '?').join(',')}) ORDER BY day DESC`;
    const { results } = await db.prepare(sql).bind(...chunk).all<{ task_id: string; day: string; kind: number }>();
    for (const r of results) {
      const arr = out.get(r.task_id) ?? [];
      arr.push({ day: r.day, kind: r.kind });
      out.set(r.task_id, arr);
    }
  }
  return out;
}

// --- wallet (Slice A) ---

interface WalletRow { gems: number; freezes: number; milestones: string; wallet_updated: number }

export async function walletFor(db: D1Database, userId: string): Promise<Wallet> {
  const row = await db
    .prepare('SELECT gems, freezes, milestones, wallet_updated FROM users WHERE id = ?')
    .bind(userId)
    .first<WalletRow>();
  if (!row) return { gems: 0, freezes: 0, milestones: [], updated: 0 };
  let milestones: string[] = [];
  try {
    const m = JSON.parse(row.milestones);
    if (Array.isArray(m)) milestones = m.filter((x) => typeof x === 'string');
  } catch { /* corrupt column: treat as empty */ }
  return { gems: row.gems, freezes: row.freezes, milestones, updated: row.wallet_updated };
}

// The WHERE guard keeps the merge rule (newest `updated` wins) atomic in SQL.
export function setWalletStmt(db: D1Database, userId: string, w: Wallet): D1PreparedStatement {
  return db
    .prepare('UPDATE users SET gems = ?2, freezes = ?3, milestones = ?4, wallet_updated = ?5 WHERE id = ?1 AND wallet_updated < ?5')
    .bind(userId, w.gems, w.freezes, JSON.stringify(w.milestones), w.updated);
}

// --- shoutouts (Slice A) ---

/** Returns false when this (group, from, to, day) shoutout already exists. */
export async function insertShout(db: D1Database, groupId: string, fromId: string, toId: string, day: string): Promise<boolean> {
  const r = await db
    .prepare('INSERT OR IGNORE INTO shoutouts (group_id, from_id, to_id, day) VALUES (?1, ?2, ?3, ?4)')
    .bind(groupId, fromId, toId, day)
    .run();
  return (r.meta.changes ?? 0) > 0;
}

/**
 * Shoutouts received per user in the group on or after `sinceDay`, as the viewer sees them:
 * shoutouts from people the viewer has blocked are not counted.
 */
export async function shoutsReceived(db: D1Database, groupId: string, sinceDay: string, viewerId: string): Promise<Map<string, number>> {
  const { results } = await db
    .prepare(
      `SELECT to_id, COUNT(*) AS n FROM shoutouts
       WHERE group_id = ?1 AND day >= ?2 AND from_id NOT IN (SELECT blocked_id FROM blocks WHERE user_id = ?3)
       GROUP BY to_id`,
    )
    .bind(groupId, sinceDay, viewerId)
    .all<{ to_id: string; n: number }>();
  return new Map(results.map((r) => [r.to_id, r.n]));
}

/** Users the caller has shouted at on `day`. */
export async function shoutedOn(db: D1Database, groupId: string, fromId: string, day: string): Promise<Set<string>> {
  const { results } = await db
    .prepare('SELECT to_id FROM shoutouts WHERE group_id = ? AND from_id = ? AND day = ?')
    .bind(groupId, fromId, day)
    .all<{ to_id: string }>();
  return new Set(results.map((r) => r.to_id));
}

// --- blocks and reports (Slice A.1) ---

export function insertBlockStmt(db: D1Database, userId: string, blockedId: string): D1PreparedStatement {
  return db
    .prepare('INSERT OR IGNORE INTO blocks (user_id, blocked_id, created) VALUES (?1, ?2, ?3)')
    .bind(userId, blockedId, Date.now());
}

export function deleteBlockStmt(db: D1Database, userId: string, blockedId: string): D1PreparedStatement {
  return db.prepare('DELETE FROM blocks WHERE user_id = ? AND blocked_id = ?').bind(userId, blockedId);
}

/** Ids the user has blocked. */
export async function blockedBy(db: D1Database, userId: string): Promise<string[]> {
  const { results } = await db
    .prepare('SELECT blocked_id FROM blocks WHERE user_id = ? ORDER BY created')
    .bind(userId)
    .all<{ blocked_id: string }>();
  return results.map((r) => r.blocked_id);
}

/** True when either user has blocked the other. */
export async function blockedEitherWay(db: D1Database, a: string, b: string): Promise<boolean> {
  const row = await db
    .prepare('SELECT 1 FROM blocks WHERE (user_id = ?1 AND blocked_id = ?2) OR (user_id = ?2 AND blocked_id = ?1)')
    .bind(a, b)
    .first();
  return row != null;
}

export async function insertReport(
  db: D1Database, groupId: string, reporterId: string, reportedId: string, reason: string,
): Promise<void> {
  await db
    .prepare('INSERT INTO reports (id, group_id, reporter_id, reported_id, reason, created) VALUES (?1, ?2, ?3, ?4, ?5, ?6)')
    .bind(crypto.randomUUID(), groupId, reporterId, reportedId, reason, Date.now())
    .run();
}

/**
 * Everything that belongs to `userId`, as one batch (account deletion). Order matters
 * for the foreign keys: memberships and entries go before tasks, tasks before the user.
 * Groups the user hosts are dissolved: other members keep their tasks with `group_id`
 * cleared (and `updated` bumped so the change reaches their devices).
 */
export function deleteAccountStmts(db: D1Database, userId: string, now: number): D1PreparedStatement[] {
  const hosted = 'SELECT id FROM groups WHERE host_id = ?1';
  const q = (sql: string) => db.prepare(sql).bind(userId);
  return [
    q('DELETE FROM shoutouts WHERE from_id = ?1 OR to_id = ?1 OR group_id IN (' + hosted + ')'),
    q('DELETE FROM blocks WHERE user_id = ?1 OR blocked_id = ?1'),
    q('DELETE FROM reports WHERE reporter_id = ?1 OR reported_id = ?1'),
    db.prepare(`UPDATE tasks SET group_id = NULL, updated = ?2 WHERE owner_id != ?1 AND group_id IN (${hosted})`).bind(userId, now),
    q(`DELETE FROM memberships WHERE user_id = ?1 OR group_id IN (${hosted})`),
    q('DELETE FROM groups WHERE host_id = ?1'),
    q('DELETE FROM entries WHERE task_id IN (SELECT id FROM tasks WHERE owner_id = ?1)'),
    q('DELETE FROM tasks WHERE owner_id = ?1'),
    q('DELETE FROM push_subs WHERE user_id = ?1'),
    q('DELETE FROM users WHERE id = ?1'),
  ];
}

// --- push subscriptions (Slice C) ---

export interface PushSub {
  endpoint: string;
  userId: string;
  p256dh: string;
  auth: string;
  tz: string;
  reminderHour: number | null;
  weekly: 0 | 1;
  lastReminderDay: string | null;
  lastWeeklyDay: string | null;
  created: number;
  failures: number;
}
interface PushSubRow {
  endpoint: string; user_id: string; p256dh: string; auth: string; tz: string; reminder_hour: number | null;
  weekly: number; last_reminder_day: string | null; last_weekly_day: string | null; created: number; failures: number;
}
const pushSubFromRow = (r: PushSubRow): PushSub => ({
  endpoint: r.endpoint, userId: r.user_id, p256dh: r.p256dh, auth: r.auth, tz: r.tz, reminderHour: r.reminder_hour,
  weekly: r.weekly ? 1 : 0, lastReminderDay: r.last_reminder_day, lastWeeklyDay: r.last_weekly_day, created: r.created, failures: r.failures,
});

/** Insert or replace by endpoint (a browser that signs in as someone else takes the endpoint over). */
export async function upsertPushSub(db: D1Database, s: Pick<PushSub, 'endpoint' | 'userId' | 'p256dh' | 'auth' | 'tz' | 'reminderHour' | 'weekly'>, now: number): Promise<void> {
  await db
    .prepare(
      `INSERT INTO push_subs (endpoint, user_id, p256dh, auth, tz, reminder_hour, weekly, created) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
       ON CONFLICT(endpoint) DO UPDATE SET user_id = ?2, p256dh = ?3, auth = ?4, tz = ?5, reminder_hour = ?6, weekly = ?7, failures = 0`,
    )
    .bind(s.endpoint, s.userId, s.p256dh, s.auth, s.tz, s.reminderHour, s.weekly, now)
    .run();
}

export async function pushSubFor(db: D1Database, userId: string, endpoint: string): Promise<PushSub | null> {
  const row = await db.prepare('SELECT * FROM push_subs WHERE endpoint = ?1 AND user_id = ?2').bind(endpoint, userId).first<PushSubRow>();
  return row ? pushSubFromRow(row) : null;
}

/** Updates only the given fields; false when the caller has no such subscription. */
export async function updatePushPrefs(db: D1Database, userId: string, endpoint: string, p: { reminderHour?: number | null; weekly?: 0 | 1; tz?: string }): Promise<boolean> {
  const sets: string[] = [];
  const vals: (string | number | null)[] = [];
  if (p.reminderHour !== undefined) { sets.push('reminder_hour = ?'); vals.push(p.reminderHour); }
  if (p.weekly !== undefined) { sets.push('weekly = ?'); vals.push(p.weekly); }
  if (p.tz !== undefined) { sets.push('tz = ?'); vals.push(p.tz); }
  if (sets.length === 0) return (await pushSubFor(db, userId, endpoint)) !== null;
  const r = await db.prepare(`UPDATE push_subs SET ${sets.join(', ')} WHERE endpoint = ? AND user_id = ?`).bind(...vals, endpoint, userId).run();
  return r.meta.changes > 0;
}

export async function deletePushSub(db: D1Database, endpoint: string, userId?: string): Promise<void> {
  if (userId) await db.prepare('DELETE FROM push_subs WHERE endpoint = ?1 AND user_id = ?2').bind(endpoint, userId).run();
  else await db.prepare('DELETE FROM push_subs WHERE endpoint = ?1').bind(endpoint).run();
}

/** Every subscription that wants a daily reminder or the weekly recap (the cron filters by local time). */
export async function pushSubsDueCandidates(db: D1Database): Promise<PushSub[]> {
  const { results } = await db.prepare('SELECT * FROM push_subs WHERE reminder_hour IS NOT NULL OR weekly = 1').all<PushSubRow>();
  return results.map(pushSubFromRow);
}

/** Records a delivered push: clears the failure count and stamps the local day it covered. */
export async function markPushOk(db: D1Database, endpoint: string, patch: { lastReminderDay?: string; lastWeeklyDay?: string } = {}): Promise<void> {
  await db
    .prepare('UPDATE push_subs SET failures = 0, last_reminder_day = COALESCE(?2, last_reminder_day), last_weekly_day = COALESCE(?3, last_weekly_day) WHERE endpoint = ?1')
    .bind(endpoint, patch.lastReminderDay ?? null, patch.lastWeeklyDay ?? null)
    .run();
}

/** Marks a local day as handled without sending anything (nothing to remind about). */
export async function markPushDay(db: D1Database, endpoint: string, patch: { lastReminderDay?: string; lastWeeklyDay?: string }): Promise<void> {
  await db
    .prepare('UPDATE push_subs SET last_reminder_day = COALESCE(?2, last_reminder_day), last_weekly_day = COALESCE(?3, last_weekly_day) WHERE endpoint = ?1')
    .bind(endpoint, patch.lastReminderDay ?? null, patch.lastWeeklyDay ?? null)
    .run();
}

/** Counts a failed delivery; the subscription is dropped once it reaches `limit` failures. */
export async function recordPushFailure(db: D1Database, endpoint: string, limit: number): Promise<void> {
  await db.batch([
    db.prepare('UPDATE push_subs SET failures = failures + 1 WHERE endpoint = ?1').bind(endpoint),
    db.prepare('DELETE FROM push_subs WHERE endpoint = ?1 AND failures >= ?2').bind(endpoint, limit),
  ]);
}

/** Live (non-archived, non-deleted) tasks of the user with no `on` entry for `day`. */
export async function tasksNotDone(db: D1Database, userId: string, day: string): Promise<{ id: string; name: string }[]> {
  const { results } = await db
    .prepare(
      `SELECT t.id, t.name FROM tasks t WHERE t.owner_id = ?1 AND t.archived = 0 AND t.deleted = 0
         AND NOT EXISTS (SELECT 1 FROM entries e WHERE e.task_id = t.id AND e.day = ?2 AND e.on_ = 1)
       ORDER BY t.created, t.id`,
    )
    .bind(userId, day)
    .all<{ id: string; name: string }>();
  return results;
}

/** `on` entries of the user's live tasks (all days; the recap needs full history for streaks). */
export async function onEntriesForLiveTasks(db: D1Database, userId: string): Promise<{ taskId: string; name: string; day: string; kind: number }[]> {
  const { results } = await db
    .prepare(
      `SELECT e.task_id AS taskId, t.name AS name, e.day AS day, e.kind AS kind FROM entries e JOIN tasks t ON t.id = e.task_id
       WHERE t.owner_id = ?1 AND t.archived = 0 AND t.deleted = 0 AND e.on_ = 1`,
    )
    .bind(userId)
    .all<{ taskId: string; name: string; day: string; kind: number }>();
  return results;
}
