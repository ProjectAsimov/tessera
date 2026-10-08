import { signal, computed, batch } from '@preact/signals';
import type { Task, Entry, EntryKind, Wallet, PersistedState, ColorId, IconId } from './types';
import { needed } from '../lib/stats';
import { newId } from '../lib/ids';
import { DAY_RE } from '../lib/dates';
import { isColorId } from '../lib/palette';

export const STATE_KEY = 'tt.state.v1';
export type EntryMap = Record<string, Record<string, Entry>>;

export const tasks = signal<Task[]>([]);
export const entries = signal<EntryMap>({});
/** Optional id of the task created by the legacy migration (see migrate.ts / sync.ts). */
export const legacyTaskId = signal<string | undefined>(undefined);

export function emptyWallet(): Wallet { return { gems: 0, freezes: 0, milestones: [], updated: 0 }; }
export const wallet = signal<Wallet>(emptyWallet());
/** Change sequence of the last wallet change the server has not seen; 0 when in sync. */
let walletPendingSeq = 0;
export function isWalletPending(): boolean { return walletPendingSeq > 0; }

export function normTask(t: Task): Task {
  const target = Number.isFinite(t.target) ? Math.min(20, Math.max(1, Math.round(t.target))) : 1;
  return t.target === target ? t : { ...t, target };
}
export function normEntry(e: Entry): Entry {
  const kind = (e.kind === 1 || e.kind === 2 ? e.kind : 0) as EntryKind;
  const n = typeof e.n === 'number' && Number.isFinite(e.n) ? e.n : e.on ? 1 : 0;
  return e.kind === kind && e.n === n ? e : { ...e, n, kind };
}
export function normWallet(w: Partial<Wallet> | undefined | null): Wallet {
  if (!w || typeof w !== 'object') return emptyWallet();
  return {
    gems: Math.max(0, Math.floor(+(w.gems ?? 0)) || 0),
    freezes: Math.min(2, Math.max(0, Math.floor(+(w.freezes ?? 0)) || 0)),
    milestones: Array.isArray(w.milestones) ? w.milestones.filter((x) => typeof x === 'string') : [],
    updated: +(w.updated ?? 0) || 0,
  };
}

// Pending = changed locally since the last successful sync. The number is a
// change sequence so sync() can tell what changed while a request was in flight.
export const pendingTasks = new Map<string, number>();
export const pendingEntries = new Map<string, number>();
let seq = 0;
export function changeSeq(): number { return seq; }
export function entryKey(taskId: string, day: string): string { return taskId + '|' + day; }

export const activeTasks = computed(() =>
  tasks.value.filter((t) => !t.deleted && !t.archived).sort((a, b) => a.created - b.created));
export const archivedTasks = computed(() =>
  tasks.value.filter((t) => !t.deleted && t.archived).sort((a, b) => a.created - b.created));

type Listener = () => void;
const listeners = new Set<Listener>();
/** Fires after every local change (used to schedule a sync). */
export function onChange(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export const storageWarning = signal('');

export function save(): void {
  const st: PersistedState = {
    tasks: tasks.value,
    entries: entries.value,
    pending: { tasks: Array.from(pendingTasks.keys()), entries: Array.from(pendingEntries.keys()) },
  };
  if (legacyTaskId.value) st.legacyTaskId = legacyTaskId.value;
  st.wallet = wallet.value;
  if (walletPendingSeq) st.walletPending = true;
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify(st));
    storageWarning.value = '';
  } catch {
    storageWarning.value = 'Could not save. Storage may be blocked in this browser.';
  }
}

function commit(): void {
  save();
  listeners.forEach((fn) => fn());
}

export function load(): boolean {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (!raw) return false;
    const st = JSON.parse(raw) as Partial<PersistedState>;
    batch(() => {
      tasks.value = Array.isArray(st.tasks) ? st.tasks.map(normTask) : [];
      const em: EntryMap = {};
      if (st.entries && typeof st.entries === 'object') {
        for (const tid in st.entries) {
          em[tid] = {};
          for (const day in st.entries[tid]!) em[tid]![day] = normEntry(st.entries[tid]![day]!);
        }
      }
      entries.value = em;
      wallet.value = normWallet(st.wallet);
      walletPendingSeq = st.walletPending ? ++seq : 0;
      legacyTaskId.value = typeof st.legacyTaskId === 'string' ? st.legacyTaskId : undefined;
    });
    pendingTasks.clear();
    pendingEntries.clear();
    for (const id of st.pending?.tasks ?? []) pendingTasks.set(id, 0);
    for (const k of st.pending?.entries ?? []) pendingEntries.set(k, 0);
    return true;
  } catch {
    return false;
  }
}

export function taskById(id: string): Task | undefined {
  return tasks.value.find((t) => t.id === id);
}

function putTask(t: Task): void {
  const list = tasks.value.filter((x) => x.id !== t.id);
  list.push(t);
  tasks.value = list;
  pendingTasks.set(t.id, ++seq);
}

export function addTask(name: string, color: ColorId, icon: IconId, extra: Partial<Task> = {}): Task {
  const now = Date.now();
  const t: Task = {
    id: newId(), ownerId: '', name: name.trim().slice(0, 40), color, icon,
    archived: 0, created: now, updated: now, deleted: 0, target: 1, ...extra,
  };
  putTask(t);
  commit();
  return t;
}

export function updateTask(id: string, patch: Partial<Pick<Task, 'name' | 'color' | 'icon' | 'archived' | 'deleted' | 'target'>>): void {
  const t = taskById(id);
  if (!t) return;
  putTask({ ...t, ...patch, updated: Date.now() });
  commit();
}

/**
 * Insert or update a task straight from the server (phase 2: after `/groups`
 * or `/groups/join`, whose response is already authoritative) without marking
 * it pending -- the server already has this exact value.
 */
export function upsertServerTask(t: Task): void {
  const list = tasks.value.filter((x) => x.id !== t.id);
  list.push(normTask(t));
  tasks.value = list;
  save();
}

export function deleteTask(id: string): void {
  updateTask(id, { deleted: 1 });
}

export function targetOf(taskId: string): number {
  return taskById(taskId)?.target ?? 1;
}

/** Writes one day's entry (the single place entries are created locally). */
export function writeEntry(taskId: string, day: string, on: boolean, n: number, kind: EntryKind = 0, t = Date.now()): Entry {
  const e: Entry = { taskId, day, on: on ? 1 : 0, t, n, kind };
  entries.value = { ...entries.value, [taskId]: { ...(entries.value[taskId] ?? {}), [day]: e } };
  pendingEntries.set(entryKey(taskId, day), ++seq);
  commit();
  return e;
}

/** Sets a day on (all events logged) or off. */
export function setDay(taskId: string, day: string, on: boolean, t = Date.now()): void {
  writeEntry(taskId, day, on, on ? targetOf(taskId) : 0, 0, t);
}

/** Sets how many events were logged; the day counts once n reaches 70% of the target. */
export function setCount(taskId: string, day: string, n: number, t = Date.now()): Entry {
  const target = targetOf(taskId);
  const c = Math.max(0, Math.min(target, Math.round(n)));
  return writeEntry(taskId, day, c >= needed(target), c, 0, t);
}

/** Multi-event: change the day's count by delta (clamped 0..target). Starts from 0 over a freeze or repair day. */
export function incrementDay(taskId: string, day: string, delta: number): Entry {
  const cur = entries.value[taskId]?.[day];
  const base = cur && !cur.kind ? cur.n : 0;
  const e = setCount(taskId, day, base + delta);
  if (e.on && delta > 0 && typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(15);
  return e;
}

export function isOn(taskId: string, day: string): boolean {
  return !!entries.value[taskId]?.[day]?.on;
}

/** Toggles a day; returns the new state. Haptic tick when lighting a day up. */
export function toggleDay(taskId: string, day: string): boolean {
  const on = !isOn(taskId, day);
  if (on && typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(15);
  setDay(taskId, day, on);
  return on;
}

/** Applies a wallet change locally and marks it pending. */
export function setWallet(patch: Partial<Omit<Wallet, 'updated'>>): void {
  const cur = wallet.value;
  const next = normWallet({ ...cur, ...patch, updated: Math.max(Date.now(), cur.updated + 1) });
  wallet.value = next;
  walletPendingSeq = ++seq;
  commit();
}

/** Called by sync: replace local state with the server's, keeping in-flight local changes. */
export function replaceFromServer(serverTasksRaw: Task[], serverEntriesRaw: Entry[], snapshotSeq: number, serverWallet?: Wallet): void {
  const serverTasks = serverTasksRaw.map(normTask);
  const serverEntries = serverEntriesRaw.map(normEntry);
  const keepTasks = new Map<string, Task>();
  for (const [id, s] of pendingTasks) {
    const t = taskById(id);
    if (s > snapshotSeq && t) keepTasks.set(id, t);
  }
  const keepEntries: Entry[] = [];
  for (const [k, s] of pendingEntries) {
    if (s <= snapshotSeq) continue;
    const [tid, day] = k.split('|') as [string, string];
    const e = entries.value[tid]?.[day];
    if (e) keepEntries.push(e);
  }

  const taskList = serverTasks.filter((t) => !keepTasks.has(t.id));
  for (const [id, t] of keepTasks) {
    const sv = serverTasks.find((x) => x.id === id);
    taskList.push(sv && sv.updated > t.updated ? sv : t);
  }
  const map: EntryMap = {};
  for (const e of serverEntries) (map[e.taskId] ??= {})[e.day] = e;
  for (const e of keepEntries) {
    const sv = map[e.taskId]?.[e.day];
    if (!sv || e.t > sv.t) (map[e.taskId] ??= {})[e.day] = e;
  }

  batch(() => {
    tasks.value = taskList;
    entries.value = map;
    if (serverWallet) {
      const sw = normWallet(serverWallet);
      if (sw.updated > wallet.value.updated) wallet.value = sw;
    }
  });
  if (walletPendingSeq && walletPendingSeq <= snapshotSeq) walletPendingSeq = 0;
  for (const [id, s] of Array.from(pendingTasks)) if (s <= snapshotSeq) pendingTasks.delete(id);
  for (const [k, s] of Array.from(pendingEntries)) if (s <= snapshotSeq) pendingEntries.delete(k);
  save();
}

export function markAllPending(): void {
  for (const t of tasks.value) pendingTasks.set(t.id, ++seq);
  for (const tid in entries.value) for (const day in entries.value[tid]) pendingEntries.set(entryKey(tid, day), ++seq);
  if (wallet.value.updated) walletPendingSeq = ++seq;
  commit();
}

// --- backup ---------------------------------------------------------------

export interface Backup { v: 1; app: 'tessera' | 'tasktracker'; tasks: Task[]; entries: Entry[] }

export function exportBackup(): Backup {
  const list: Entry[] = [];
  for (const tid in entries.value) for (const day in entries.value[tid]) list.push(entries.value[tid]![day]!);
  return { v: 1, app: 'tessera', tasks: tasks.value, entries: list };
}

/** Merges a backup into the store (newest wins). Returns counts, or throws on bad input. */
export function importBackup(text: string): { tasks: number; days: number } {
  const b = JSON.parse(text) as Partial<Backup> | string[];
  let nt = 0, nd = 0;
  if (Array.isArray(b)) {
    // Legacy "Gym years" backup: a plain array of days.
    const gym = tasks.value.find((t) => !t.deleted && t.name.toLowerCase() === 'gym') ?? addTask('Gym', 'purple', 'dumbbell');
    for (const d of b) {
      if (typeof d === 'string' && DAY_RE.test(d) && !isOn(gym.id, d)) { setDay(gym.id, d, true); nd++; }
    }
    return { tasks: 0, days: nd };
  }
  if (!b || (b.app !== 'tessera' && b.app !== 'tasktracker') || !Array.isArray(b.tasks) || !Array.isArray(b.entries)) throw new Error('bad backup');
  const bt = b.tasks as Task[], be = b.entries as Entry[];
  batch(() => {
    for (const t of bt) {
      if (!t || typeof t.id !== 'string' || typeof t.name !== 'string' || !isColorId(t.color)) continue;
      const cur = taskById(t.id);
      if (!cur || t.updated > cur.updated) { putTask(normTask({ ...t, ownerId: cur?.ownerId ?? '' })); nt++; }
    }
    for (const e of be) {
      if (!e || typeof e.taskId !== 'string' || !DAY_RE.test(e.day ?? '') || !taskById(e.taskId)) continue;
      const cur = entries.value[e.taskId]?.[e.day];
      if (!cur || e.t > cur.t) {
        entries.value = { ...entries.value, [e.taskId]: { ...(entries.value[e.taskId] ?? {}), [e.day]: normEntry({ taskId: e.taskId, day: e.day, on: e.on ? 1 : 0, t: e.t, n: e.n, kind: e.kind }) } };
        pendingEntries.set(entryKey(e.taskId, e.day), ++seq);
        nd++;
      }
    }
  });
  commit();
  return { tasks: nt, days: nd };
}

/** Erase everything: tombstones every task and entry so the removal syncs, too. */
export function eraseAll(): void {
  const now = Date.now();
  batch(() => {
    tasks.value = tasks.value.map((t) => ({ ...t, deleted: 1, updated: now }));
    const map: EntryMap = {};
    for (const tid in entries.value) {
      map[tid] = {};
      for (const day in entries.value[tid]) {
        map[tid]![day] = { ...entries.value[tid]![day]!, on: 0, n: 0, kind: 0, t: now };
        pendingEntries.set(entryKey(tid, day), ++seq);
      }
    }
    entries.value = map;
  });
  for (const t of tasks.value) pendingTasks.set(t.id, ++seq);
  commit();
}
