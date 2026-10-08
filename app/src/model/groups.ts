// Phase 2 (docs/ARCHITECTURE.md "groups and leaderboard"): sharing a task into
// a group, joining by invite link, and the leaderboard board data.
import { signal } from '@preact/signals';
import { api, HttpError } from './api';
import { session } from './session';
import { sync } from './sync';
import * as store from './store';
import { toast } from '../components/Toast';
import { openSheet, closeSheet, push } from '../lib/nav';
import { todayIso } from '../lib/dates';
import type { Group, GroupAndTask, Member } from './types';

export const PENDING_JOIN_KEY = 'tt.pendingJoin';
const JOIN_HASH_RE = /^#join=([a-z0-9]{10})$/;

export interface BoardState { group: Group; members: Member[] }
export interface JoinPreview { code: string; name: string; hostName: string; members: number; memberLimit: number }

/** The current group's leaderboard, for the grouped Task screen. */
export const board = signal<BoardState | null>(null);
export const boardError = signal(false);

/** Preview of a pending invite, shown by the Welcome dialog or the Join sheet. */
export const joinPreview = signal<JoinPreview | null>(null);

/** Invite link for a code; works on GitHub Pages and locally. */
export function inviteLink(code: string): string {
  return location.origin + import.meta.env.BASE_URL + '#join=' + code;
}

export function pendingJoinCode(): string | null {
  try { return localStorage.getItem(PENDING_JOIN_KEY); } catch { return null; }
}

export function clearPendingJoin(): void {
  try { localStorage.removeItem(PENDING_JOIN_KEY); } catch { /* storage blocked */ }
  joinPreview.value = null;
}

/** Called once on boot: stash a `#join=<code>` hash and strip it from the URL. */
export function captureJoinHash(): void {
  const m = JOIN_HASH_RE.exec(location.hash);
  if (!m) return;
  try { localStorage.setItem(PENDING_JOIN_KEY, m[1]!); } catch { /* storage blocked */ }
  history.replaceState(history.state, '', location.pathname + location.search);
}

/**
 * Fetches the preview for a pending join (if any) and opens the Welcome dialog
 * (signed out) or the Join sheet (signed in). Returns whether it did.
 */
export async function checkPendingJoin(): Promise<boolean> {
  const code = pendingJoinCode();
  if (!code) return false;
  try {
    const p = await api.previewGroup(code);
    joinPreview.value = { code, ...p };
  } catch {
    clearPendingJoin();
    toast('That invite link is not valid.');
    return false;
  }
  openSheet(session.value ? 'join' : 'welcome');
  return true;
}

/** Join sheet: "Join". */
export async function joinPending(): Promise<void> {
  const jp = joinPreview.value;
  const s = session.value;
  if (!jp || !s) return;
  try {
    const res = await api.joinGroup(s.token, jp.code);
    store.upsertServerTask(res.task);
    clearPendingJoin();
    void sync();
    // `push` starts the new screen with no sheet open, closing the Join sheet
    // in the same history entry (closeSheet() first would race it: its
    // history.back() is asynchronous and can land after this push).
    push({ name: 'task', taskId: res.task.id });
  } catch {
    toast('Could not join that group. Try again.');
  }
}

/** Join sheet / Welcome: "Not now" (or an invalid link). */
export function skipPendingJoin(): void {
  clearPendingJoin();
  closeSheet();
}

/** Loads the leaderboard for a grouped task's group. Never throws. */
export async function loadBoard(groupId: string): Promise<void> {
  const s = session.value;
  if (!s) return;
  try {
    board.value = await api.board(s.token, groupId, todayIso());
    boardError.value = false;
  } catch {
    boardError.value = true;
  }
}

export function clearBoard(): void {
  board.value = null;
  boardError.value = false;
}

/** Task screen "Share": create a group for an ungrouped task. Returns the group and the updated task. */
export async function shareTask(taskId: string): Promise<GroupAndTask | null> {
  const s = session.value;
  if (!s) return null;
  const res = await api.createGroup(s.token, taskId);
  store.upsertServerTask(res.task);
  void sync();
  return res;
}

/** Group card: "Leave" (member). */
export async function leaveCurrentGroup(groupId: string): Promise<boolean> {
  const s = session.value;
  if (!s) return false;
  try {
    await api.leaveGroup(s.token, groupId);
    const t = store.tasks.value.find((x) => x.groupId === groupId);
    if (t) store.upsertServerTask({ ...t, groupId: undefined });
    clearBoard();
    void sync();
    return true;
  } catch {
    toast('Could not leave the group. Try again.');
    return false;
  }
}

/** Manage members sheet: "Remove" (host). */
export async function removeGroupMember(groupId: string, userId: string): Promise<boolean> {
  const s = session.value;
  if (!s) return false;
  try {
    await api.removeMember(s.token, groupId, userId);
    await loadBoard(groupId);
    return true;
  } catch {
    toast('Could not remove that member. Try again.');
    return false;
  }
}

/** Leaderboard 🔥: one shoutout per member per day. Updates the row at once, then refreshes the board. */
export async function shoutTo(groupId: string, userId: string): Promise<void> {
  const s = session.value;
  if (!s) return;
  const b = board.value;
  if (b) {
    board.value = { ...b, members: b.members.map((m) => (m.userId === userId ? { ...m, shoutedToday: true, shouts: m.shouts + 1 } : m)) };
  }
  try {
    await api.shout(s.token, groupId, userId);
  } catch (e) {
    toast(e instanceof HttpError && e.status === 409 ? 'You already sent one today.' : 'Could not send that. Try again.');
  }
  await loadBoard(groupId);
}

/** Wires the re-check that runs right after a sign-in completes. Call once on load. */
export function startGroups(): void {
  window.addEventListener('tt:signedin', () => { void checkPendingJoin(); });
  // An invite link tapped while the app is already open arrives as a hash change, not a fresh load.
  window.addEventListener('hashchange', () => {
    if (!JOIN_HASH_RE.test(location.hash)) return;
    captureJoinHash();
    void checkPendingJoin();
  });
}
