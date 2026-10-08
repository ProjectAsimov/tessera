import type { Entry } from '../model/types';
import { iso, addDays, parseDay, monthPrefix, yearOf } from './dates';

export type DayMap = Record<string, Entry>;

/** Set of days that are on. */
export function onDays(entries: DayMap | undefined): Set<string> {
  const s = new Set<string>();
  if (!entries) return s;
  for (const k in entries) if (entries[k]!.on) s.add(k);
  return s;
}

/** Days that count toward month / year / total: on and not a freeze or repair. */
export function countedDays(entries: DayMap | undefined): Set<string> {
  const s = new Set<string>();
  if (!entries) return s;
  for (const k in entries) {
    const e = entries[k]!;
    if (e.on && !e.kind) s.add(k);
  }
  return s;
}

/** Days with kind 1 (freeze) or 2 (repair) that are on. */
export function coveredDays(entries: DayMap | undefined): Set<string> {
  const s = new Set<string>();
  if (!entries) return s;
  for (const k in entries) {
    const e = entries[k]!;
    if (e.on && e.kind) s.add(k);
  }
  return s;
}

/** Flame tier for a streak: 0 none, 1 ember (7+), 2 flame (30+), 3 blue (100+), 4 gold (365+). */
export function tier(streakDays: number): 0 | 1 | 2 | 3 | 4 {
  return streakDays >= 365 ? 4 : streakDays >= 100 ? 3 : streakDays >= 30 ? 2 : streakDays >= 7 ? 1 : 0;
}

/** Events needed for a day to count: 70% of the target, rounded up. */
export function needed(target: number): number {
  return Math.ceil(0.7 * Math.max(1, target));
}

/** Fraction of the day's target logged, 0..1 (1 once it counts, or for freeze / repair days). */
export function fillOf(e: Entry | undefined, target: number): number {
  if (!e) return 0;
  if (e.on) return 1;
  return target <= 1 ? 0 : Math.min(1, e.n / target);
}

export function isOn(entries: DayMap | undefined, day: string): boolean {
  return !!entries?.[day]?.on;
}

/** Current streak: counts back from today, or from yesterday if today is not marked yet. */
export function streak(days: Set<string>, today = new Date()): number {
  let d = new Date(today);
  let n = 0;
  if (!days.has(iso(d))) d = addDays(d, -1);
  while (days.has(iso(d))) { n++; d = addDays(d, -1); }
  return n;
}

export function bestStreak(days: Set<string>): number {
  let best = 0, run = 0;
  let prev: Date | null = null;
  for (const k of Array.from(days).sort()) {
    const d = parseDay(k);
    run = prev && iso(addDays(prev, 1)) === k ? run + 1 : 1;
    if (run > best) best = run;
    prev = d;
  }
  return best;
}

export function countMonth(days: Set<string>, y: number, m: number): number {
  const p = monthPrefix(y, m);
  let n = 0;
  for (const d of days) if (d.startsWith(p)) n++;
  return n;
}

export function countYear(days: Set<string>, y: number): number {
  let n = 0;
  for (const d of days) if (yearOf(d) === y) n++;
  return n;
}

export interface TaskStats {
  streak: number;
  best: number;
  thisMonth: number;
  lastMonth: number;
  monthDelta: number;
  thisYear: number;
  total: number;
  year: number;
  month: number;
}

export function taskStats(entries: DayMap | undefined, now = new Date()): TaskStats {
  const all = onDays(entries);
  const days = countedDays(entries);
  const y = now.getFullYear(), m = now.getMonth();
  const thisMonth = countMonth(days, y, m);
  const lastMonth = m ? countMonth(days, y, m - 1) : countMonth(days, y - 1, 11);
  return {
    streak: streak(all, now),
    best: bestStreak(all),
    thisMonth,
    lastMonth,
    monthDelta: thisMonth - lastMonth,
    thisYear: countYear(days, y),
    total: days.size,
    year: y,
    month: m,
  };
}

/** Years with any marked day, current year first, newest to oldest. */
export function yearsWithData(entries: DayMap | undefined, now = new Date()): number[] {
  const ys = new Set<number>([now.getFullYear()]);
  for (const d of onDays(entries)) ys.add(yearOf(d));
  return Array.from(ys).sort((a, b) => b - a);
}

/** The last `n` days ending today, oldest first. */
export function lastDays(n: number, now = new Date()): string[] {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) out.push(iso(addDays(now, -i)));
  return out;
}
