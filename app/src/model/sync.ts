// Sync model (docs/ARCHITECTURE.md): the store is the source of truth on the
// device. sync() posts the pending set, replaces local state with the server's
// response (keeping anything that changed while the request was in flight) and
// clears pending. Triggers: 1.5 s after a change, on load, when the tab becomes
// visible (if last sync > 30 s ago), on `online`.
import { signal } from '@preact/signals';
import { api, HttpError } from './api';
import { session, syncOn, statusNote, setSession } from './session';
import * as store from './store';
import { autoFreeze } from './rewards';
import type { Entry, Task, SyncRequest, Wallet } from './types';

export const syncing = signal(false);
export const lastSyncAt = signal(0);
let timer: ReturnType<typeof setTimeout> | undefined;

export function canSync(): boolean {
  return !!session.value && syncOn.value;
}

export function queueSync(): void {
  if (!canSync()) return;
  clearTimeout(timer);
  timer = setTimeout(() => { void sync(); }, 1500);
}

function pendingBody(excludeTask?: string): SyncRequest {
  const tasks: Task[] = [];
  for (const id of store.pendingTasks.keys()) {
    if (id === excludeTask) continue;
    const t = store.taskById(id);
    if (t) tasks.push(t);
  }
  const entries: Entry[] = [];
  for (const k of store.pendingEntries.keys()) {
    const [tid, day] = k.split('|') as [string, string];
    if (tid === excludeTask) continue;
    const e = store.entries.value[tid]?.[day];
    if (e) entries.push(e);
  }
  const body: SyncRequest = { tasks, entries };
  if (store.isWalletPending()) body.wallet = store.wallet.value;
  return body;
}

/**
 * The device migration created a local "Gym" task; the worker's own migration
 * creates one too, with a different id. On the first sync the local one is held
 * back; if the server already has a Gym task, the local task is dropped and any
 * local-only days are re-posted under the server's id. Otherwise the local task
 * simply goes up with the next sync.
 */
function reconcileLegacy(serverTasks: Task[], serverEntries: Entry[], snapshot: number, serverWallet?: Wallet): boolean {
  const localId = store.legacyTaskId.value;
  if (!localId) return false;
  const local = store.taskById(localId);
  const serverGym = serverTasks.find((t) => t.id !== localId && !t.deleted && t.name.trim().toLowerCase() === 'gym');
  const localDays = store.entries.value[localId] ?? {};
  if (local && serverGym) {
    const have = new Map<string, Entry>();
    for (const e of serverEntries) if (e.taskId === serverGym.id) have.set(e.day, e);
    const moved: Entry[] = [];
    for (const day in localDays) {
      const e = localDays[day]!;
      const sv = have.get(day);
      if (!sv || (e.on !== sv.on && e.t > sv.t)) moved.push({ ...e, taskId: serverGym.id });
    }
    // Drop the local task and its entries entirely (it never reached the server).
    store.tasks.value = store.tasks.value.filter((t) => t.id !== localId);
    const map = { ...store.entries.value };
    delete map[localId];
    store.entries.value = map;
    store.pendingTasks.delete(localId);
    for (const k of Array.from(store.pendingEntries.keys())) if (k.startsWith(localId + '|')) store.pendingEntries.delete(k);
    store.legacyTaskId.value = undefined;
    // Now apply the server state, then layer the moved days on top as fresh local changes.
    store.replaceFromServer(serverTasks, serverEntries, snapshot, serverWallet);
    for (const e of moved) store.setDay(e.taskId, e.day, !!e.on, Math.max(e.t, 1));
    return true;
  }
  store.legacyTaskId.value = undefined;
  store.save();
  return false;
}

export async function sync(): Promise<void> {
  if (!canSync() || syncing.value) return;
  if (!navigator.onLine) { statusNote.value = 'Offline. Will sync when back online.'; autoFreeze(); return; }
  const token = session.value!.token;
  syncing.value = true;
  statusNote.value = 'Syncing…';
  const legacy = store.legacyTaskId.value;
  const snapshot = store.changeSeq();
  try {
    const res = await api.sync(token, pendingBody(legacy));
    if (session.value?.token !== token) return; // signed out or account deleted while in flight
    if (legacy) {
      if (reconcileLegacy(res.tasks, res.entries, snapshot, res.wallet)) { queueSync(); }
      else { store.replaceFromServer(res.tasks, res.entries, snapshot, res.wallet); queueSync(); }
    } else {
      store.replaceFromServer(res.tasks, res.entries, snapshot, res.wallet);
    }
    autoFreeze();
    lastSyncAt.value = Date.now();
    statusNote.value = 'Synced just now.';
  } catch (e) {
    if (e instanceof HttpError && e.status === 401) {
      setSession(null);
      statusNote.value = 'Your sign-in expired. Sign in again to keep syncing.';
    } else if (e instanceof HttpError) {
      statusNote.value = 'Sync failed (' + e.status + ').';
    } else {
      statusNote.value = 'Could not reach the sync server. Will retry.';
      autoFreeze(); // offline: still cover yesterday from the local state
    }
  } finally {
    syncing.value = false;
  }
}

/** Wires the triggers. Call once on load. */
export function startSync(): void {
  store.onChange(queueSync);
  window.addEventListener('online', () => { void sync(); });
  window.addEventListener('tt:signedin', () => { void sync(); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    if (!canSync()) autoFreeze();
    else if (Date.now() - lastSyncAt.value > 30000) void sync();
  });
}
