import {
  blockedBy, blockedEitherWay, deleteBlockStmt, insertBlockStmt, insertReport, clearTaskGroupStmt, codeTaken, deleteMembershipStmt, groupById, groupByCode, groupMemberTasks,
  insertGroup, insertMembership, insertShout, shoutedOn, shoutsReceived, insertMembershipStmt, membership, upsertUser, onDaysByTask, setTaskGroupStmt, taskById, upsertTask, userName,
} from '../db/queries';
import { HttpError } from '../lib/json';
import type { Env, Group, Member, Session, Task } from '../types';

const MEMBER_LIMIT = 50;
const CODE_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789';

function genCode(): string {
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  let s = '';
  for (let i = 0; i < 10; i++) s += CODE_CHARS[bytes[i] % CODE_CHARS.length];
  return s;
}

async function uniqueCode(db: D1Database): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const code = genCode();
    if (!(await codeTaken(db, code))) return code;
  }
  throw new HttpError(500, 'could not allocate invite code');
}

export async function createGroup(env: Env, userId: string, taskId: string): Promise<{ group: Group; task: Task }> {
  const db = env.DB;
  const task = await taskById(db, taskId);
  if (!task) throw new HttpError(404, 'task not found');
  if (task.ownerId !== userId) throw new HttpError(403, 'not your task');
  if (task.deleted) throw new HttpError(400, 'task is deleted');
  if (task.groupId) throw new HttpError(400, 'task is already in a group');

  const now = Date.now();
  const id = crypto.randomUUID();
  const inviteCode = await uniqueCode(db);

  await insertGroup(db, { id, name: task.name, hostId: userId, inviteCode, memberLimit: MEMBER_LIMIT, created: now });
  await insertMembership(db, { groupId: id, userId, taskId, joined: now });
  await db.batch([setTaskGroupStmt(db, taskId, id, now)]);

  return {
    group: { id, name: task.name, hostId: userId, inviteCode, memberLimit: MEMBER_LIMIT, members: 1, created: now },
    task: { ...task, groupId: id, updated: now },
  };
}

export async function previewGroup(
  env: Env,
  code: string,
): Promise<{ name: string; hostName: string; members: number; memberLimit: number }> {
  const group = await groupByCode(env.DB, code);
  if (!group) throw new HttpError(404, 'group not found');
  const hostName = (await userName(env.DB, group.hostId)) ?? '';
  return { name: group.name, hostName, members: group.members, memberLimit: group.memberLimit };
}

export async function joinGroup(env: Env, s: Session, code: string): Promise<{ group: Group; task: Task }> {
  const db = env.DB;
  const userId = s.sub;
  const group = await groupByCode(db, code);
  if (!group) throw new HttpError(404, 'group not found');

  const existing = await membership(db, group.id, userId);
  if (existing) {
    const task = await taskById(db, existing.taskId);
    if (!task) throw new HttpError(500, 'member task missing');
    return { group, task };
  }

  if (group.members >= group.memberLimit) throw new HttpError(409, 'group full');

  const hostMembership = await membership(db, group.id, group.hostId);
  const hostTask = hostMembership && (await taskById(db, hostMembership.taskId));
  if (!hostTask) throw new HttpError(500, 'host task missing');

  const now = Date.now();
  const task: Task = {
    id: crypto.randomUUID(),
    ownerId: userId,
    name: hostTask.name,
    color: hostTask.color,
    icon: hostTask.icon,
    archived: 0,
    groupId: group.id,
    created: now,
    updated: now,
    deleted: 0,
    target: hostTask.target,
  };
  // One atomic batch. The user row is upserted first: a session can predate the
  // users table, and memberships/tasks both reference it.
  await db.batch([
    upsertUser(db, s.sub, s.name, s.email),
    upsertTask(db, task), // fresh id, so this always inserts
    insertMembershipStmt(db, { groupId: group.id, userId, taskId: task.id, joined: now }),
  ]);

  return { group: { ...group, members: group.members + 1 }, task };
}

export async function getBoard(env: Env, groupId: string, callerId: string, today: string): Promise<{ group: Group; members: Member[] }> {
  const db = env.DB;
  const group = await groupById(db, groupId);
  if (!group) throw new HttpError(404, 'group not found');
  const caller = await membership(db, groupId, callerId);
  if (!caller) throw new HttpError(403, 'not a member');

  const blocked = new Set(await blockedBy(db, callerId));
  const memberTasks = (await groupMemberTasks(db, groupId)).filter((m) => !blocked.has(m.userId));
  const onDays = await onDaysByTask(db, memberTasks.map((m) => m.taskId));

  const received = await shoutsReceived(db, groupId, addDays(today, -6), callerId);
  const sentToday = await shoutedOn(db, groupId, callerId, today);
  const mine = memberTasks.find((m) => m.userId === callerId);
  const mySet = new Set((mine ? onDays.get(mine.taskId) ?? [] : []).map((e) => e.day));

  const members: Member[] = memberTasks.map((m) => {
    const entries = onDays.get(m.taskId) ?? []; // newest first; kind 1/2 keep streaks alive but are not counted
    const days = entries.map((e) => e.day);
    const counted = entries.filter((e) => e.kind === 0).map((e) => e.day);
    return {
      userId: m.userId,
      name: m.name,
      isHost: m.userId === group.hostId,
      isMe: m.userId === callerId,
      streak: streak(new Set(days), today),
      month: counted.filter((d) => d.slice(0, 7) === today.slice(0, 7)).length,
      total: counted.length,
      lastDay: days[0] ?? null,
      shouts: received.get(m.userId) ?? 0,
      shoutedToday: sentToday.has(m.userId),
      friend: m.userId === callerId ? 0 : streak(new Set(days.filter((d) => mySet.has(d))), today),
    };
  });

  members.sort((a, b) => b.streak - a.streak || b.month - a.month || b.total - a.total || a.name.localeCompare(b.name));

  return { group, members };
}

export async function leaveGroup(env: Env, groupId: string, userId: string): Promise<void> {
  const db = env.DB;
  const group = await groupById(db, groupId);
  if (!group) throw new HttpError(404, 'group not found');
  if (group.hostId === userId) throw new HttpError(400, 'host cannot leave');
  await removeMembership(db, groupId, userId);
}

export async function removeMember(env: Env, groupId: string, callerId: string, targetUserId: string): Promise<void> {
  const db = env.DB;
  const group = await groupById(db, groupId);
  if (!group) throw new HttpError(404, 'group not found');
  if (group.hostId !== callerId) throw new HttpError(403, 'forbidden');
  if (targetUserId === group.hostId) throw new HttpError(400, 'host cannot be removed');
  await removeMembership(db, groupId, targetUserId);
}

async function removeMembership(db: D1Database, groupId: string, userId: string): Promise<void> {
  const m = await membership(db, groupId, userId);
  if (!m) throw new HttpError(404, 'not a member');
  await db.batch([deleteMembershipStmt(db, groupId, userId), clearTaskGroupStmt(db, m.taskId, Date.now())]);
}

/** Consecutive "on" days ending today or yesterday: a miss today doesn't zero the streak until tomorrow. */
function streak(set: Set<string>, today: string): number {
  let cursor = set.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (set.has(cursor)) {
    n++;
    cursor = addDays(cursor, -1);
  }
  return n;
}

function addDays(day: string, delta: number): string {
  const d = new Date(day + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/** One shoutout per (group, from, to, day). `count` is what the target has received in the last 7 days. */
export async function shout(env: Env, groupId: string, callerId: string, targetId: string, today: string): Promise<{ ok: true; count: number }> {
  const db = env.DB;
  const group = await groupById(db, groupId);
  if (!group) throw new HttpError(404, 'group not found');
  if (!(await membership(db, groupId, callerId))) throw new HttpError(403, 'not a member');
  if (targetId === callerId) throw new HttpError(400, 'cannot shout yourself');
  if (!(await membership(db, groupId, targetId))) throw new HttpError(404, 'target is not a member');
  if (await blockedEitherWay(db, callerId, targetId)) throw new HttpError(403, 'blocked');
  if (!(await insertShout(db, groupId, callerId, targetId, today))) throw new HttpError(409, 'already today');
  const count = (await shoutsReceived(db, groupId, addDays(today, -6), callerId)).get(targetId) ?? 0;
  return { ok: true, count };
}

export async function blockMember(env: Env, groupId: string, callerId: string, targetId: string): Promise<void> {
  const db = env.DB;
  if (!(await groupById(db, groupId))) throw new HttpError(404, 'group not found');
  if (!(await membership(db, groupId, callerId))) throw new HttpError(403, 'not a member');
  if (targetId === callerId) throw new HttpError(400, 'cannot block yourself');
  if (!(await membership(db, groupId, targetId))) throw new HttpError(404, 'target is not a member');
  await insertBlockStmt(db, callerId, targetId).run();
}

/** The target need not still be a member: a block outlives their membership and must stay removable. */
export async function unblockMember(env: Env, groupId: string, callerId: string, targetId: string): Promise<void> {
  const db = env.DB;
  if (!(await groupById(db, groupId))) throw new HttpError(404, 'group not found');
  if (!(await membership(db, groupId, callerId))) throw new HttpError(403, 'not a member');
  if (targetId === callerId) throw new HttpError(400, 'cannot unblock yourself');
  await deleteBlockStmt(db, callerId, targetId).run();
}

export async function reportMember(env: Env, groupId: string, callerId: string, targetId: string, reason: string): Promise<void> {
  const db = env.DB;
  if (!(await groupById(db, groupId))) throw new HttpError(404, 'group not found');
  if (!(await membership(db, groupId, callerId))) throw new HttpError(403, 'not a member');
  if (targetId === callerId) throw new HttpError(400, 'cannot report yourself');
  if (!(await membership(db, groupId, targetId))) throw new HttpError(404, 'target is not a member');
  await insertReport(db, groupId, callerId, targetId, reason);
}
