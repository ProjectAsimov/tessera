// Dev-only helpers (VITE_MOCK_API=1). URL params:
//   ?seed=1          seed three tasks with a few months of days (clears existing state first)
//   ?fresh=1         clear all tt.* keys
//   ?legacy=1        plant legacy gymyears.* keys to exercise the migration
//   ?signedin=1      pre-set a mock session
//   ?seed=a          Slice A showcase: flame tiers, a multi-event task (Water 3/8), a 6-day streak (Meditate),
//                    a repairable gap and a frozen day (Read), 230 gems + 1 freeze
//   ?task=<name>     with ?screen=task|month: open that task instead of the first one
//   ?group=1         share the first seeded task into a group (needs a session; two-row leaderboard)
//   ?blockedby=<id>  mock member <id> (e.g. mock-sub-2) has blocked the caller: shouts to them get 403
//   ?join=<code>     stash a pending join as if `#join=<code>` had been visited (e.g. mockjoin01)
//   ?screen=task|month|settings|welcome   open that screen after boot (for screenshots)
import { STATE_KEY, addTask, setDay, setCount, writeEntry, setWallet, tasks, entries, upsertServerTask } from '../model/store';
import { iso, addDays } from '../lib/dates';
import { MOCK_TOKEN, seedServerGym, mockApi, KNOWN_JOIN_CODE, blockedByOthers } from './mockApi';
import { PENDING_JOIN_KEY } from '../model/groups';
import { push, openSheet } from '../lib/nav';

export { KNOWN_JOIN_CODE };

function params(): URLSearchParams { return new URLSearchParams(location.search); }

/** The first active task by creation order -- stable even after `upsertServerTask` reorders the raw list. */
function earliestTask() {
  return tasks.value.filter((t) => !t.deleted && !t.archived).sort((a, b) => a.created - b.created)[0];
}

function clearAll(): void {
  for (const k of Object.keys(localStorage)) if (k.startsWith('tt.') || k.startsWith('gymyears.')) localStorage.removeItem(k);
}

// Deterministic pseudo-random so screenshots are stable.
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

export async function applySeedParams(): Promise<void> {
  const p = params();
  if (p.get('fresh') === '1') clearAll();
  if (p.get('legacy') === '1') {
    clearAll();
    const r = rng(7);
    const log: Record<string, { on: number; t: number }> = {};
    const today = new Date();
    for (let i = 1; i < 120; i++) if (r() < 0.5) log[iso(addDays(today, -i))] = { on: 1, t: 0 };
    localStorage.setItem('gymyears.log.v2', JSON.stringify(log));
    localStorage.setItem('gymyears.accent', 'teal');
    localStorage.setItem('gymyears.welcomed', '1');
    localStorage.setItem('gymyears.session', JSON.stringify({ token: MOCK_TOKEN, name: 'Mock User', email: 'mock@example.com' }));
    seedServerGym(Object.keys(log).slice(0, 30).concat([iso(addDays(today, -200))]));
  }
  if (p.get('signedin') === '1') {
    localStorage.setItem('tt.session', JSON.stringify({ token: MOCK_TOKEN, name: 'Mock User', email: 'mock@example.com' }));
    localStorage.setItem('tt.welcomed', '1');
  }
  if (p.get('seed') === '1') {
    localStorage.removeItem(STATE_KEY);
    localStorage.setItem('tt.welcomed', '1');
    const today = new Date();
    const specs = [
      { name: 'Gym', color: 'purple', icon: 'dumbbell', p: 0.55, seed: 1, back: 420 },
      { name: 'Read 20 pages', color: 'teal', icon: 'book', p: 0.7, seed: 2, back: 90 },
      { name: 'Meditate', color: 'orange', icon: 'meditate', p: 0.35, seed: 3, back: 40 },
    ] as const;
    for (const s of specs) {
      const t = addTask(s.name, s.color, s.icon);
      const r = rng(s.seed);
      for (let i = s.back; i >= 1; i--) if (r() < s.p) setDay(t.id, iso(addDays(today, -i)), true, Date.now() - i * 86400000);
      // Make streaks visible: the last few days on for the first two tasks.
      if (s.seed !== 3) for (let i = 1; i <= 5; i++) setDay(t.id, iso(addDays(today, -i)), true);
      if (s.seed === 2) setDay(t.id, iso(today), true);
    }
  }
  if (p.get('seed') === 'a') {
    localStorage.removeItem(STATE_KEY);
    localStorage.setItem('tt.welcomed', '1');
    const today = new Date();
    const day = (i: number) => iso(addDays(today, -i));
    const stamp = (i: number) => Date.now() - i * 86400000;
    const gym = addTask('Gym', 'purple', 'dumbbell');
    for (let i = 0; i < 35; i++) writeEntry(gym.id, day(i), true, 1, 0, stamp(i));
    const water = addTask('Water', 'blue', 'water', { target: 8 });
    const counts = [3, 8, 7, 5, 8, 6, 2, 8, 8, 4, 7, 8, 6];
    counts.forEach((n, k) => setCount(water.id, day(counts.length - k), n, stamp(counts.length - k)));
    setCount(water.id, day(0), 3);
    const read = addTask('Read 20 pages', 'teal', 'book');
    for (const i of [1, 2, 4, 5, 7, 8, 9, 10, 11, 12]) writeEntry(read.id, day(i), true, 1, 0, stamp(i));
    writeEntry(read.id, day(6), true, 0, 1, stamp(6)); // frozen
    const med = addTask('Meditate', 'orange', 'meditate');
    for (let i = 1; i <= 6; i++) writeEntry(med.id, day(i), true, 1, 0, stamp(i));
    const run = addTask('Run', 'green', 'run');
    for (let i = 0; i < 120; i++) writeEntry(run.id, day(i), true, 1, 0, stamp(i));
    setWallet({ gems: 230, freezes: 1 });
  }
  if (p.get('group') === '1') {
    if (!localStorage.getItem('tt.session')) {
      localStorage.setItem('tt.session', JSON.stringify({ token: MOCK_TOKEN, name: 'Mock User', email: 'mock@example.com' }));
    }
    localStorage.setItem('tt.welcomed', '1');
    const first = earliestTask();
    if (first) {
      // Push it to the mock server directly (the app's own sync() needs a
      // session signal that hasn't been loaded yet at this point in boot),
      // then share it into a group the same way the Task screen would.
      const taskEntries = Object.values(entries.value[first.id] ?? {});
      await mockApi.sync(MOCK_TOKEN, { tasks: [first], entries: taskEntries });
      const res = await mockApi.createGroup(MOCK_TOKEN, first.id);
      upsertServerTask(res.task);
    }
  }
  if (p.get('blockedby')) blockedByOthers.add(p.get('blockedby')!);
  if (p.get('join')) {
    try { localStorage.setItem(PENDING_JOIN_KEY, p.get('join')!); } catch { /* storage blocked */ }
  }
}

export function applyScreenParam(): void {
  const p = params();
  const screen = p.get('screen');
  if (!screen) return;
  const named = p.get('task');
  const first = (named && tasks.value.find((t) => !t.deleted && t.name === named)) || earliestTask();
  const now = new Date();
  switch (screen) {
    case 'task': if (first) push({ name: 'task', taskId: first.id }); break;
    case 'month': if (first) push({ name: 'month', taskId: first.id, y: now.getFullYear(), m: now.getMonth() }); break;
    case 'settings': openSheet('settings'); break;
    case 'welcome': localStorage.removeItem('tt.welcomed'); openSheet('welcome'); break;
    case 'add': openSheet('add'); break;
  }
}
