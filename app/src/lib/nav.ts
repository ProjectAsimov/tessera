import { signal } from '@preact/signals';

// Screens and dialogs get a history entry so the phone's back button works.
// The stack is kept in history.state; popstate rebuilds the signals from it.
export type Screen =
  | { name: 'home' }
  | { name: 'task'; taskId: string }
  | { name: 'month'; taskId: string; y: number; m: number };

export type Sheet = 'settings' | 'welcome' | 'add' | 'edit' | 'menu' | 'share' | 'members' | 'join' | 'repair' | null;

interface NavState { screens: Screen[]; sheet: Sheet }

export const screens = signal<Screen[]>([{ name: 'home' }]);
export const sheet = signal<Sheet>(null);
/** Which way the last screen change went, for the slide animation. */
export const navDir = signal<'fwd' | 'back' | null>(null);

const scrollMemo = new Map<number, number>();

function apply(st: NavState | null): void {
  const s = st && Array.isArray(st.screens) && st.screens.length ? st.screens : [{ name: 'home' } as Screen];
  const depthBefore = screens.value.length;
  navDir.value = s.length > depthBefore ? 'fwd' : s.length < depthBefore ? 'back' : navDir.value;
  screens.value = s;
  sheet.value = st?.sheet ?? null;
  if (s.length < depthBefore) {
    const y = scrollMemo.get(s.length - 1) ?? 0;
    requestAnimationFrame(() => window.scrollTo(0, y));
  } else if (s.length > depthBefore) {
    requestAnimationFrame(() => window.scrollTo(0, 0));
  }
}

export function top(): Screen {
  return screens.value[screens.value.length - 1]!;
}

export function push(screen: Screen): void {
  scrollMemo.set(screens.value.length - 1, window.scrollY);
  const st: NavState = { screens: [...screens.value, screen], sheet: null };
  history.pushState(st, '');
  apply(st);
}

/** Replace the top screen (e.g. moving between months) without adding history. */
export function replace(screen: Screen): void {
  const st: NavState = { screens: [...screens.value.slice(0, -1), screen], sheet: sheet.value };
  history.replaceState(st, '');
  screens.value = st.screens;
}

export function back(): void {
  if (screens.value.length > 1 || sheet.value) history.back();
}

export function home(): void {
  const n = screens.value.length - 1;
  if (n > 0) history.go(-n);
}

export function openSheet(s: Exclude<Sheet, null>): void {
  if (sheet.value === s) return;
  const st: NavState = { screens: screens.value, sheet: s };
  history.pushState(st, '');
  apply(st);
}

/** Replace the open sheet with another one in place (no extra history entry). */
export function swapSheet(s: Exclude<Sheet, null>): void {
  if (!sheet.value) { openSheet(s); return; }
  const st: NavState = { screens: screens.value, sheet: s };
  history.replaceState(st, '');
  sheet.value = s;
}

export function closeSheet(): void {
  if (!sheet.value) return;
  const hs = history.state as NavState | null;
  if (hs && hs.sheet) history.back();
  else apply({ screens: screens.value, sheet: null });
}

/** Removes a task's screens (and any open sheet) from the stack, after delete / archive. */
export function leaveTask(taskId: string): void {
  const s = screens.value;
  let n = sheet.value ? 1 : 0;
  for (let i = s.length - 1; i > 0; i--) {
    const sc = s[i]!;
    if (sc.name !== 'home' && sc.taskId === taskId) n++; else break;
  }
  if (n) history.go(-n);
}

export function startNav(): void {
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  // A fresh load with a stale state (e.g. reload while on a month) starts at home.
  history.replaceState({ screens: [{ name: 'home' }], sheet: null } satisfies NavState, '');
  window.addEventListener('popstate', (e) => apply(e.state as NavState | null));
}
