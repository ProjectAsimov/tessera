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

/** Shoutouts received per user in the group on or after `sinceDay`. */
export async function shoutsReceived(db: D1Database, groupId: string, sinceDay: string): Promise<Map<string, number>> {
  const { results } = await db
    .prepare('SELECT to_id, COUNT(*) AS n FROM shoutouts WHERE group_id = ? AND day >= ? GROUP BY to_id')
    .bind(groupId, sinceDay)
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
