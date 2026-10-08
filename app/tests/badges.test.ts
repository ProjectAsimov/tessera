// Run: npx tsx tests/badges.test.ts
import assert from 'node:assert/strict';
import { perfectWeeks, perfectMonths } from '../src/lib/badges';

type M = Record<string, { on: 0 | 1; kind?: number }>;
function run(start: string, n: number, over: M = {}): M {
  const m: M = {};
  const d = new Date(+start.slice(0, 4), +start.slice(5, 7) - 1, +start.slice(8, 10));
  for (let i = 0; i < n; i++) {
    const k = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    m[k] = { on: 1, kind: 0 };
    d.setDate(d.getDate() + 1);
  }
  return { ...m, ...over };
}
let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; console.log('ok', name); };

// 2026-09-06 is a Sunday.
t('7-day run from Sunday = 1 week', () => assert.deepEqual(perfectWeeks(run('2026-09-06', 7), '2026-09-30'), ['2026-09-06']));
t('one frozen day = 0 weeks', () => assert.deepEqual(perfectWeeks(run('2026-09-06', 7, { '2026-09-09': { on: 1, kind: 1 } }), '2026-09-30'), []));
t('repaired day = 0 weeks', () => assert.deepEqual(perfectWeeks(run('2026-09-06', 7, { '2026-09-09': { on: 1, kind: 2 } }), '2026-09-30'), []));
t('off tombstone = 0 weeks', () => assert.deepEqual(perfectWeeks(run('2026-09-06', 7, { '2026-09-09': { on: 0, kind: 0 } }), '2026-09-30'), []));
t('7-day run starting Monday = 0 weeks', () => assert.deepEqual(perfectWeeks(run('2026-09-07', 7), '2026-09-30'), []));
t('week ending tomorrow is not yet', () => assert.deepEqual(perfectWeeks(run('2026-09-06', 7), '2026-09-11'), []));
t('week ending today counts', () => assert.deepEqual(perfectWeeks(run('2026-09-06', 7), '2026-09-12'), ['2026-09-06']));
t('full 30-day month = 1 month + 3 full weeks inside', () => {
  const m = run('2026-09-01', 30);
  assert.deepEqual(perfectMonths(m, '2026-10-01'), ['2026-09']);
  assert.deepEqual(perfectWeeks(m, '2026-10-01'), ['2026-09-06', '2026-09-13', '2026-09-20']);
});
t('month ending tomorrow is not yet', () => assert.deepEqual(perfectMonths(run('2026-09-01', 30), '2026-09-29'), []));
t('month ending today counts', () => assert.deepEqual(perfectMonths(run('2026-09-01', 30), '2026-09-30'), ['2026-09']));
t('month with a freeze = none', () => assert.deepEqual(perfectMonths(run('2026-09-01', 30, { '2026-09-15': { on: 1, kind: 1 } }), '2026-10-01'), []));
t('February 2028 (leap, 29 days)', () => assert.deepEqual(perfectMonths(run('2028-02-01', 29), '2028-03-01'), ['2028-02']));
t('sorted output', () => assert.deepEqual(perfectWeeks({ ...run('2026-09-13', 7), ...run('2026-09-06', 7) }, '2026-09-30'), ['2026-09-06', '2026-09-13']));
t('empty', () => { assert.deepEqual(perfectWeeks(undefined, '2026-09-30'), []); assert.deepEqual(perfectMonths({}, '2026-09-30'), []); });
console.log(n + ' passed');
