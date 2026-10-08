// In-memory implementation of the worker contract (docs/ARCHITECTURE.md), used
// when VITE_MOCK_API=1 so the UI can be exercised without the worker.
import type { Api } from '../model/api';
import { HttpError } from '../model/api';
import type { Task, Entry, Me, SyncRequest, SyncResponse, Group, Member, GroupPreview, GroupAndTask, GroupBoard, ColorId, IconId, Wallet, ShoutResult } from '../model/types';
import { onDays, countedDays, streak, countMonth } from '../lib/stats';
import { parseDay } from '../lib/dates';

export const MOCK_TOKEN = 'mock-session-token-0123456789abcdefghijklmnopqrstuvwxyz';
const USER: Me = { id: 'mock-sub-1', name: 'Mock User', email: 'mock@example.com' };
const MAX_TASKS = 200, MAX_ENTRIES = 20000;

const serverTasks = new Map<string, Task>();
const serverEntries = new Map<string, Entry>(); // "taskId|day"
let sessions = new Set<string>([MOCK_TOKEN]);
let serverWallet: Wallet = { gems: 0, freezes: 0, milestones: [], updated: 0 };

/** A well-formed uncompressed P-256 point (65 bytes, base64url) standing in for the VAPID public key. */
const MOCK_VAPID_KEY = 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U';
/** Pushes the page made, on window.__pushLog, so scripts can assert on them. */
function logPush(kind: string, body: unknown): void {
  const w = window as unknown as { __pushLog?: Array<{ kind: string; body: unknown }> };
  (w.__pushLog ??= []).push({ kind, body });
}

function delay(ms: number): Promise<void> { return new Promise((r) => setTimeout(r, ms)); }

function auth(token: string): void {
  if (!sessions.has(token)) throw new HttpError(401, 'unauthorized');
}

/** Seed the mock server with a legacy-style "Gym" task (like migrate.ts on the worker would). */
export function seedServerGym(days: string[]): void {
  const now = Date.now();
  const t: Task = { id: 'server-gym-task', ownerId: USER.id, name: 'Gym', color: 'purple', icon: 'dumbbell', archived: 0, created: now - 1, updated: now - 1, deleted: 0, target: 1 };
  serverTasks.set(t.id, t);
  for (const d of days) serverEntries.set(t.id + '|' + d, { taskId: t.id, day: d, on: 1, t: 0, n: 1, kind: 0 });
}

// --- Phase 2: groups and the leaderboard --------------------------------
// A second, fixed "member" so the leaderboard has something to show in dev
// without a second real session. Its tasks/entries live in their own maps
// (they are never the mock USER's, and never reachable through /sync).

interface GroupRow { id: string; name: string; hostId: string; inviteCode: string; memberLimit: number; created: number }
interface Membership { taskId: string; joined: number }

const BUDDY = { id: 'mock-sub-2', name: 'Alex Kim' };
/** A third person, only in the seeded known group, so there is someone to block while others remain. */
const SAM = { id: 'mock-sub-3', name: 'Sam Rivera' };
/** A known, stable invite code for exercising the join flow in dev (`?join=mockjoin01`). */
export const KNOWN_JOIN_CODE = 'mockjoin01';

const groups = new Map<string, GroupRow>();
const memberships = new Map<string, Map<string, Membership>>(); // groupId -> userId -> membership
const groupMeta = new Map<string, { color: ColorId; icon: IconId }>(); // groupId -> appearance to clone on join
const buddyTasks = new Map<string, Task>();
const buddyEntries = new Map<string, Entry>(); // "taskId|day"

function nameOf(userId: string): string {
  return userId === USER.id ? USER.name : userId === BUDDY.id ? BUDDY.name : userId === SAM.id ? SAM.name : 'Member';
}

function genCode(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let s = '';
  for (let i = 0; i < 10; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

function isoOf(d: Date): string {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

/** Adds Alex Kim as a second member of `groupId`, with a cloned task and a plausible history. */
function addBuddyToGroup(groupId: string, name: string, color: ColorId, icon: IconId, who: { id: string; name: string } = BUDDY): void {
  const taskId = (who === SAM ? 'sam-task-' : 'buddy-task-') + groupId;
  const now = Date.now();
  buddyTasks.set(taskId, { id: taskId, ownerId: who.id, name, color, icon, archived: 0, groupId, created: now - 1, updated: now - 1, deleted: 0, target: 1 });
  const r = rng(groupId.length + 11 + (who === SAM ? 5 : 0));
  const today = new Date();
  for (let i = 1; i <= 60; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    if (r() < 0.6) buddyEntries.set(taskId + '|' + isoOf(d), { taskId, day: isoOf(d), on: 1, t: now - i * 86400000, n: 1, kind: 0 });
  }
  for (let i = 1; i <= 3; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    buddyEntries.set(taskId + '|' + isoOf(d), { taskId, day: isoOf(d), on: 1, t: now - i * 1000, n: 1, kind: 0 });
  }
  const m = memberships.get(groupId) ?? new Map<string, Membership>();
  m.set(who.id, { taskId, joined: now - 86400000 * 5 });
  memberships.set(groupId, m);
}

// Slice A.1: whom the (single) mock caller has blocked, and who has blocked the caller.
const blocks = new Set<string>();
export const blockedByOthers = new Set<string>();
const reports: Array<{ groupId: string; reporterId: string; reportedId: string; reason: string; created: number }> = [];
export const mockReports = reports;

// Shoutouts, keyed "groupId|from|to|day". A few are seeded so counts show in dev.
const shouts = new Set<string>();
function seedShouts(groupId: string): void {
  for (const i of [1, 2, 4]) shouts.add([groupId, BUDDY.id, USER.id, isoOf(new Date(Date.now() - i * 86400000))].join('|'));
  for (const [i, from] of [[1, 'mock-sub-3'], [3, 'mock-sub-4']] as const) shouts.add([groupId, from, BUDDY.id, isoOf(new Date(Date.now() - i * 86400000))].join('|'));
}
function receivedShouts(groupId: string, to: string, today: string): number {
  const from = isoOf(new Date(parseDay(today).getTime() - 6 * 86400000));
  let n = 0;
  for (const k of shouts) {
    const [g, , t, d] = k.split('|') as [string, string, string, string];
    if (g === groupId && t === to && d >= from && d <= today) n++;
  }
  return n;
}

/** Consecutive days (ending today or yesterday) on which both day sets are on. */
function friendStreak(a: Set<string>, b: Set<string>, today: string): number {
  const both = new Set<string>();
  for (const d of a) if (b.has(d)) both.add(d);
  return streak(both, parseDay(today));
}

function entryMapOf(userId: string, taskId: string): Record<string, Entry> {
  const entryMap = userId === USER.id ? serverEntries : buddyEntries;
  const map: Record<string, Entry> = {};
  for (const [k, e] of entryMap) if (k.startsWith(taskId + '|')) map[e.day] = e;
  return map;
}

function findGroupByCode(code: string): GroupRow | undefined {
  for (const g of groups.values()) if (g.inviteCode === code) return g;
  return undefined;
}

function toGroup(g: GroupRow): Group {
  return { id: g.id, name: g.name, hostId: g.hostId, inviteCode: g.inviteCode, memberLimit: g.memberLimit, members: memberships.get(g.id)?.size ?? 0, created: g.created };
}

function memberStats(userId: string, taskId: string, today: string): Omit<Member, 'shouts' | 'shoutedToday' | 'friend'> | null {
  const task = userId === USER.id ? serverTasks.get(taskId) : buddyTasks.get(taskId);
  if (!task || task.deleted) return null;
  const map = entryMapOf(userId, taskId);
  const days = onDays(map); // streak: every day that is on, including freezes and repairs
  const counted = countedDays(map); // month / total: normal days only
  const now = parseDay(today);
  const list = Array.from(days).sort();
  return {
    userId,
    name: nameOf(userId),
    isHost: false, // set by caller
    isMe: userId === USER.id,
    streak: streak(days, now),
    month: countMonth(counted, now.getFullYear(), now.getMonth()),
    total: counted.size,
    lastDay: list.length ? list[list.length - 1]! : null,
  };
}

/** Seed a known, joinable group hosted by "Alex Kim" for `?join=mockjoin01`. */
(function seedKnownGroup(): void {
  const id = 'group-known';
  groups.set(id, { id, name: 'Morning Pages', hostId: BUDDY.id, inviteCode: KNOWN_JOIN_CODE, memberLimit: 50, created: Date.now() - 86400000 * 20 });
  groupMeta.set(id, { color: 'blue', icon: 'pen' });
  addBuddyToGroup(id, 'Morning Pages', 'blue', 'pen');
  addBuddyToGroup(id, 'Morning Pages', 'blue', 'pen', SAM);
  seedShouts(id);
})();

export const mockApi: Api = {
  authStartUrl: () => '#session=' + MOCK_TOKEN,
  async me(token) {
    await delay(120);
    auth(token);
    return USER;
  },
  async sync(token, body: SyncRequest): Promise<SyncResponse> {
    await delay(250);
    auth(token);
    if (body.tasks.length > MAX_TASKS || body.entries.length > MAX_ENTRIES) throw new HttpError(413, 'too large');
    for (const t of body.tasks) {
      const cur = serverTasks.get(t.id);
      if (cur && cur.ownerId !== USER.id) throw new HttpError(403, 'not yours');
      if (!cur || t.updated > cur.updated) {
        // The server owns groupId: keep whatever it already had, ignore the incoming value.
        const merged: Task = { ...t, target: t.target ?? 1, ownerId: USER.id, groupId: cur?.groupId };
        if (!merged.groupId) delete merged.groupId;
        serverTasks.set(t.id, merged);
        if (merged.deleted && cur?.groupId) {
          // A grouped task's deletion also drops the caller's membership.
          memberships.get(cur.groupId)?.delete(USER.id);
        }
      }
    }
    for (const e of body.entries) {
      if (!serverTasks.has(e.taskId)) continue; // unknown task ids are ignored
      const k = e.taskId + '|' + e.day;
      const cur = serverEntries.get(k);
      if (!cur || e.t > cur.t) serverEntries.set(k, { ...e, n: e.n ?? (e.on ? 1 : 0), kind: e.kind ?? 0 });
    }
    if (body.wallet && body.wallet.updated > serverWallet.updated) serverWallet = { ...body.wallet, milestones: [...body.wallet.milestones] };
    if (serverTasks.size > MAX_TASKS) throw new HttpError(413, 'too many tasks');
    return { tasks: Array.from(serverTasks.values()), entries: Array.from(serverEntries.values()), wallet: serverWallet, now: Date.now() };
  },
  async logout(token) {
    await delay(80);
    sessions = new Set(Array.from(sessions).filter((t) => t !== token));
    sessions.add(MOCK_TOKEN); // the mock can always sign back in
  },

  async createGroup(token, taskId) {
    await delay(220);
    auth(token);
    const t = serverTasks.get(taskId);
    if (!t || t.ownerId !== USER.id) throw new HttpError(404, 'not found');
    if (t.deleted) throw new HttpError(400, 'task is deleted');
    if (t.groupId) throw new HttpError(400, 'already grouped');
    const id = 'group-' + Math.random().toString(36).slice(2, 10);
    const g: GroupRow = { id, name: t.name, hostId: USER.id, inviteCode: genCode(), memberLimit: 50, created: Date.now() };
    groups.set(id, g);
    groupMeta.set(id, { color: t.color, icon: t.icon });
    memberships.set(id, new Map([[USER.id, { taskId: t.id, joined: Date.now() }]]));
    const updated: Task = { ...t, groupId: id, updated: Date.now() };
    serverTasks.set(t.id, updated);
    addBuddyToGroup(id, t.name, t.color, t.icon);
    seedShouts(id);
    return { group: toGroup(g), task: updated };
  },

  async previewGroup(code): Promise<GroupPreview> {
    await delay(180);
    const g = findGroupByCode(code);
    if (!g) throw new HttpError(404, 'not found');
    return { name: g.name, hostName: nameOf(g.hostId), members: memberships.get(g.id)?.size ?? 0, memberLimit: g.memberLimit };
  },

  async joinGroup(token, code): Promise<GroupAndTask> {
    await delay(220);
    auth(token);
    const g = findGroupByCode(code);
    if (!g) throw new HttpError(404, 'not found');
    const m = memberships.get(g.id) ?? new Map<string, Membership>();
    const existing = m.get(USER.id);
    if (existing) {
      const task = serverTasks.get(existing.taskId);
      if (task) return { group: toGroup(g), task };
    }
    if (m.size >= g.memberLimit) throw new HttpError(409, 'group full');
    const meta = groupMeta.get(g.id) ?? { color: 'purple' as ColorId, icon: 'check' as IconId };
    const now = Date.now();
    const task: Task = { id: 'joined-' + Math.random().toString(36).slice(2, 10), ownerId: USER.id, name: g.name, color: meta.color, icon: meta.icon, archived: 0, groupId: g.id, created: now, updated: now, deleted: 0, target: 1 };
    serverTasks.set(task.id, task);
    m.set(USER.id, { taskId: task.id, joined: now });
    memberships.set(g.id, m);
    return { group: toGroup(g), task };
  },

  async board(token, groupId, today): Promise<GroupBoard> {
    await delay(200);
    auth(token);
    const g = groups.get(groupId);
    const m = g ? memberships.get(groupId) : undefined;
    if (!g || !m || !m.has(USER.id)) throw new HttpError(404, 'not found');
    const members: Member[] = [];
    const myTask = m.get(USER.id)!.taskId;
    const mine = onDays(entryMapOf(USER.id, myTask));
    for (const [userId, mem] of m) {
      if (blocks.has(userId)) continue; // blocked members never appear on the caller's board
      const stats = memberStats(userId, mem.taskId, today);
      if (!stats) continue;
      members.push({
        ...stats,
        isHost: userId === g.hostId,
        shouts: receivedShouts(groupId, userId, today),
        shoutedToday: userId !== USER.id && shouts.has([groupId, USER.id, userId, today].join('|')),
        friend: userId === USER.id ? 0 : friendStreak(mine, onDays(entryMapOf(userId, mem.taskId)), today),
      });
    }
    members.sort((a, b) => b.streak - a.streak || b.month - a.month || b.total - a.total || a.name.localeCompare(b.name));
    return { group: toGroup(g), members };
  },

  async shout(token, groupId, userId): Promise<ShoutResult> {
    await delay(150);
    auth(token);
    const m = groupId ? memberships.get(groupId) : undefined;
    if (!m || !m.has(USER.id) || !m.has(userId)) throw new HttpError(404, 'not found');
    if (userId === USER.id) throw new HttpError(400, 'cannot shout yourself');
    if (blocks.has(userId) || blockedByOthers.has(userId)) throw new HttpError(403, 'blocked');
    const day = isoOf(new Date());
    const key = [groupId, USER.id, userId, day].join('|');
    if (shouts.has(key)) throw new HttpError(409, 'already today');
    shouts.add(key);
    return { ok: true, count: receivedShouts(groupId, userId, day) };
  },

  async deleteAccount(token) {
    await delay(300);
    auth(token);
    for (const [gid, g] of Array.from(groups)) {
      if (g.hostId === USER.id) {
        // Hosted groups go entirely; other members' tasks lose their group.
        for (const [uid, mem] of memberships.get(gid) ?? []) {
          if (uid === USER.id) continue;
          const bt = buddyTasks.get(mem.taskId);
          if (bt) buddyTasks.set(bt.id, { ...bt, groupId: undefined });
        }
        memberships.delete(gid);
        groups.delete(gid);
        groupMeta.delete(gid);
      } else {
        memberships.get(gid)?.delete(USER.id);
      }
    }
    for (const k of Array.from(shouts)) {
      const [, from, to] = k.split('|');
      if (from === USER.id || to === USER.id) shouts.delete(k);
    }
    serverTasks.clear();
    serverEntries.clear();
    blocks.clear();
    reports.splice(0, reports.length, ...reports.filter((r) => r.reporterId !== USER.id && r.reportedId !== USER.id));
    serverWallet = { gems: 0, freezes: 0, milestones: [], updated: 0 };
    // Every session dies; the mock can always sign back in, as a brand-new account.
    sessions = new Set<string>([MOCK_TOKEN]);
  },

  async myBlocks(token) {
    await delay(80);
    auth(token);
    return { userIds: Array.from(blocks) };
  },

  async block(token, groupId, userId) {
    await delay(150);
    auth(token);
    const m = memberships.get(groupId);
    if (!m || !m.has(USER.id) || !m.has(userId)) throw new HttpError(404, 'not found');
    if (userId === USER.id) throw new HttpError(400, 'cannot block yourself');
    blocks.add(userId);
  },

  async unblock(token, groupId, userId) {
    await delay(150);
    auth(token);
    const m = memberships.get(groupId);
    if (!m || !m.has(USER.id)) throw new HttpError(404, 'not found');
    blocks.delete(userId);
  },

  async report(token, groupId, userId, reason) {
    await delay(200);
    auth(token);
    const m = memberships.get(groupId);
    if (!m || !m.has(USER.id) || !m.has(userId)) throw new HttpError(404, 'not found');
    if (typeof reason !== 'string' || !reason.trim() || reason.length > 500) throw new HttpError(400, 'bad reason');
    reports.push({ groupId, reporterId: USER.id, reportedId: userId, reason, created: Date.now() });
  },

  async leaveGroup(token, groupId) {
    await delay(180);
    auth(token);
    const g = groups.get(groupId);
    if (!g) throw new HttpError(404, 'not found');
    if (g.hostId === USER.id) throw new HttpError(400, 'host cannot leave');
    const m = memberships.get(groupId);
    const mine = m?.get(USER.id);
    if (!mine) throw new HttpError(404, 'not a member');
    m!.delete(USER.id);
    const task = serverTasks.get(mine.taskId);
    if (task) serverTasks.set(task.id, { ...task, groupId: undefined, updated: Date.now() });
  },

  async removeMember(token, groupId, userId) {
    await delay(180);
    auth(token);
    const g = groups.get(groupId);
    if (!g) throw new HttpError(404, 'not found');
    if (g.hostId !== USER.id) throw new HttpError(403, 'host only');
    const m = memberships.get(groupId);
    const target = m?.get(userId);
    if (!target) throw new HttpError(404, 'not a member');
    m!.delete(userId);
    if (userId === USER.id) {
      const task = serverTasks.get(target.taskId);
      if (task) serverTasks.set(task.id, { ...task, groupId: undefined, updated: Date.now() });
    }
  },

  // Slice C: Web Push (all succeed; recorded on window.__pushLog).
  async pushKey() {
    await delay(60);
    return { publicKey: MOCK_VAPID_KEY };
  },
  async pushSubscribe(token, body) {
    await delay(120);
    auth(token);
    logPush('subscribe', body);
  },
  async pushPrefs(token, body) {
    await delay(100);
    auth(token);
    logPush('prefs', body);
  },
  async pushUnsubscribe(token, endpoint) {
    await delay(100);
    auth(token);
    logPush('unsubscribe', { endpoint });
  },
  async pushTest(token, endpoint) {
    await delay(300);
    auth(token);
    logPush('test', { endpoint });
  },
};
