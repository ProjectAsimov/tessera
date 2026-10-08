// Lists user reports (Play UGC compliance), newest first.
//   node scripts/reports.mjs --local|--remote [--persist-to <dir>] [--db <name>]
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const local = args.includes('--local');
const remote = args.includes('--remote');
if (local === remote) { console.error('usage: node scripts/reports.mjs --local|--remote [--persist-to dir] [--db name]'); process.exit(2); }
const db = opt('--db') ?? 'tasktracker';
const persist = opt('--persist-to');

// Group may be gone (host deleted their account); users likewise. Fall back to the raw id.
const sql = `SELECT r.created, COALESCE(g.name, '(deleted group)') AS grp, r.group_id,
  COALESCE(ur.name, '(deleted)') AS reporter, r.reporter_id,
  COALESCE(ud.name, '(deleted)') AS reported, r.reported_id, r.reason
  FROM reports r LEFT JOIN groups g ON g.id = r.group_id
  LEFT JOIN users ur ON ur.id = r.reporter_id LEFT JOIN users ud ON ud.id = r.reported_id
  ORDER BY r.created DESC`.replace(/\s+/g, ' ');
const a = ['wrangler', 'd1', 'execute', db, local ? '--local' : '--remote', ...(persist && local ? ['--persist-to', persist] : []), '--json', '--command', JSON.stringify(sql)];
const r = spawnSync('npx', a, { cwd: root, encoding: 'utf8', shell: true, maxBuffer: 64 * 1024 * 1024 });
if (r.status !== 0) { console.error(r.stdout, r.stderr); process.exit(1); }
const rows = JSON.parse(r.stdout.slice(r.stdout.indexOf('[')))[0].results;
if (!rows.length) { console.log('no reports'); process.exit(0); }
for (const x of rows) {
  console.log(`${new Date(x.created).toISOString()}  group: ${x.grp} (${x.group_id})`);
  console.log(`  reporter: ${x.reporter} (${x.reporter_id})  reported: ${x.reported} (${x.reported_id})`);
  console.log(`  reason: ${x.reason}\n`);
}
console.log(`${rows.length} report(s)`);
