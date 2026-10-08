// Slice A rules (docs/ARCHITECTURE.md): milestones, auto-freeze, repair.
// The client computes everything; the server only stores the wallet and entries.
import { signal } from '@preact/signals';
import * as store from './store';
import { toast } from '../components/Toast';
import { iso, addDays, parseDay, todayIso } from '../lib/dates';
import { onDays, streak, bestStreak, type DayMap } from '../lib/stats';
import type { ColorId, Entry } from './types';

export const MILESTONE_GEMS: Readonly<Record<number, number>> = { 7: 10, 30: 50, 100: 200, 365: 500 };
export const NEW_BEST_GEMS = 5;
export const FREEZE_EVERY = 14;
export const FREEZE_CAP = 2;
export const REPAIR_COST = 100;
export const REPAIR_WINDOW_DAYS = 7;
export const MILESTONE_MS = 1200;

export interface MilestoneInfo { id: number; color: ColorId; days: number; gems: number; freeze: boolean }
/** The milestone overlay, while one is showing. */
export const milestone = signal<MilestoneInfo | null>(null);
let overlayId = 0;

export function dismissMilestone(): void { milestone.value = null; }

interface Snap { streak: number; best: number; counted: boolean }

function snap(taskId: string): Snap {
  const days = onDays(store.entries.value[taskId]);
  return { streak: streak(days), best: bestStreak(days), counted: days.has(todayIso()) };
}

/** Marks / unmarks today for a single-event task, then checks for a milestone. Returns the new state. */
export function toggleToday(taskId: string): boolean {
  const before = snap(taskId);
  const on = store.toggleDay(taskId, todayIso());
  if (on) checkMilestone(taskId, before);
  return on;
}

/** Multi-event: logs one more (or one fewer) event today, then checks for a milestone. */
export function bumpToday(taskId: string, delta: number): Entry {
  const before = snap(taskId);
  const e = store.incrementDay(taskId, todayIso(), delta);
  if (e.on) checkMilestone(taskId, before);
  return e;
}

/** Marks / unmarks any day; a milestone check runs only when it is today. */
export function toggleAnyDay(taskId: string, day: string): boolean {
  if (day === todayIso()) return toggleToday(taskId);
  return store.toggleDay(taskId, day);
}

function checkMilestone(taskId: string, before: Snap): void {
  const after = snap(taskId);
  // Only the step that makes today count can lift the streak.
  if (before.counted || !after.counted) return;
  const s = after.streak;
  const task = store.taskById(taskId);
  if (!task || s < 1) return;
  const w = store.wallet.value;
  const have = new Set(w.milestones);
  const add: string[] = [];
  let gems = 0;
  let show = false;
  const key = taskId + ':' + s;
  const exact = MILESTONE_GEMS[s];
  if (exact !== undefined) {
    show = true;
    if (!have.has(key)) { gems += exact; add.push(key); }
  } else if (s >= 7 && s > before.best && !have.has(key)) {
    show = true;
    gems += NEW_BEST_GEMS;
    add.push(key);
  }
  let freeze = false;
  if (s % FREEZE_EVERY === 0 && w.freezes < FREEZE_CAP) {
    const fkey = taskId + ':f' + s;
    if (!have.has(fkey)) { freeze = true; add.push(fkey); }
  }
  if (add.length) {
    store.setWallet({ gems: w.gems + gems, freezes: w.freezes + (freeze ? 1 : 0), milestones: [...w.milestones, ...add] });
  }
  if (show || freeze) {
    milestone.value = { id: ++overlayId, color: task.color, days: s, gems, freeze };
    if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate([30, 40, 30]);
  }
}

/**
 * Auto-freeze: a task whose streak ended exactly the day before yesterday (yesterday has no entry,
 * the day before is on) gets yesterday covered by a banked freeze. Only yesterday, only once.
 */
export function autoFreeze(): void {
  const now = new Date();
  const y = iso(addDays(now, -1));
  const yy = iso(addDays(now, -2));
  const used: string[] = [];
  for (const t of store.activeTasks.value) {
    if (store.wallet.value.freezes <= 0) break;
    const m = store.entries.value[t.id];
    if (m?.[y]) continue; // already decided (marked, unmarked, frozen or repaired)
    if (!m?.[yy]?.on) continue;
    store.writeEntry(t.id, y, true, 0, 1);
    store.setWallet({ freezes: store.wallet.value.freezes - 1 });
    used.push(t.name);
  }
  if (used.length) toast('Streak freeze used on ' + used.join(', '), 3200);
}

/** A missed day in the last 7 days (not today) between two on days: a gap in a streak. */
export function repairable(entries: DayMap | undefined, day: string, today = todayIso()): boolean {
  if (day >= today) return false;
  if (day < iso(addDays(parseDay(today), -REPAIR_WINDOW_DAYS))) return false;
  if (entries?.[day]?.on) return false;
  const d = parseDay(day);
  return !!entries?.[iso(addDays(d, -1))]?.on && !!entries?.[iso(addDays(d, 1))]?.on;
}

/** Spends REPAIR_COST gems to fill a missed day. Returns false when it cannot be afforded. */
export function repairDay(taskId: string, day: string): boolean {
  const w = store.wallet.value;
  if (w.gems < REPAIR_COST) return false;
  store.writeEntry(taskId, day, true, 0, 2);
  store.setWallet({ gems: w.gems - REPAIR_COST });
  return true;
}
