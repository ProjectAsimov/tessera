// Slice B badges (docs/ARCHITECTURE.md): computed from entries, never stored.
import { iso, addDays, parseDay, pad } from './dates';

type Days = Record<string, { on: 0 | 1; kind?: number } | undefined>;

/** A normal (not frozen, not repaired) day that is on. */
function solid(entries: Days | undefined, day: string): boolean {
  const e = entries?.[day];
  return !!e && !!e.on && !e.kind;
}

/** Sundays (YYYY-MM-DD) of every Sunday-Saturday week fully solid and ending on or before `upToDay`. */
export function perfectWeeks(entries: Days | undefined, upToDay: string): string[] {
  if (!entries) return [];
  const sundays = new Set<string>();
  for (const k in entries) {
    if (!solid(entries, k) || k > upToDay) continue;
    const d = parseDay(k);
    sundays.add(iso(addDays(d, -d.getDay())));
  }
  const out: string[] = [];
  for (const s of sundays) {
    const sun = parseDay(s);
    if (iso(addDays(sun, 6)) > upToDay) continue;
    let ok = true;
    for (let i = 0; i < 7 && ok; i++) ok = solid(entries, iso(addDays(sun, i)));
    if (ok) out.push(s);
  }
  return out.sort();
}

/** Months (YYYY-MM) fully solid and ending on or before `upToDay`. */
export function perfectMonths(entries: Days | undefined, upToDay: string): string[] {
  if (!entries) return [];
  const months = new Set<string>();
  for (const k in entries) if (solid(entries, k) && k <= upToDay) months.add(k.slice(0, 7));
  const out: string[] = [];
  for (const m of months) {
    const y = +m.slice(0, 4), mo = +m.slice(5, 7);
    const len = new Date(y, mo, 0).getDate();
    if (m + '-' + pad(len) > upToDay) continue;
    let ok = true;
    for (let d = 1; d <= len && ok; d++) ok = solid(entries, m + '-' + pad(d));
    if (ok) out.push(m);
  }
  return out.sort();
}
