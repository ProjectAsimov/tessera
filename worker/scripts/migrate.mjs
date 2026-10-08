// Idempotent D1 migration runner.
//   node scripts/migrate.mjs --local | --remote [--persist-to <dir>] [--db <name>] [--file <sql>]
// Runs each statement of the migration file, skipping `ALTER TABLE x ADD COLUMN y`
// when column y already exists (SQLite has no ADD COLUMN IF NOT EXISTS).
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const local = args.includes('--local');
const remote = args.includes('--remote');
if (local === remote) { console.error('usage: node scripts/migrate.mjs --local|--remote [--persist-to dir] [--db name] [--file sql]'); process.exit(2); }
const db = opt('--db') ?? 'tasktracker';
const file = resolve(root, opt('--file') ?? 'src/db/migrations/002_slice_a.sql');
const persist = opt('--persist-to');

function wrangler(extra) {
  const a = ['wrangler', 'd1', 'execute', db, local ? '--local' : '--remote', ...(persist && local ? ['--persist-to', persist] : []), ...extra];
  const r = spawnSync('npx', a, { cwd: root, encoding: 'utf8', shell: true, maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) { console.error(r.stdout, r.stderr); process.exit(1); }
  return r.stdout;
}
const query = (sql) => {
  const out = wrangler(['--json', '--command', JSON.stringify(sql)]);
  return JSON.parse(out.slice(out.indexOf('[')))[0].results;
};

const sql = readFileSync(file, 'utf8').replace(/--.*$/gm, '');
const statements = sql.split(';').map((s) => s.trim()).filter(Boolean);
const todo = [];
const cols = new Map();
for (const st of statements) {
  const m = /^ALTER\s+TABLE\s+(\w+)\s+ADD\s+COLUMN\s+(\w+)/i.exec(st);
  if (m) {
    const [, table, col] = m;
    if (!cols.has(table)) cols.set(table, new Set(query(`SELECT name FROM pragma_table_info('${table}')`).map((r) => r.name)));
    if (cols.get(table).has(col)) { console.log(`skip   ${table}.${col} (exists)`); continue; }
    console.log(`add    ${table}.${col}`);
  } else {
    const c = /^CREATE\s+(?:UNIQUE\s+)?(?:TABLE|INDEX)\s+IF\s+NOT\s+EXISTS\s+(\w+)/i.exec(st);
    if (c && query(`SELECT 1 AS x FROM sqlite_master WHERE name='${c[1]}'`).length) { console.log(`skip   ${c[1]} (exists)`); continue; }
    console.log('run    ' + st.split('\n')[0].slice(0, 70));
  }
  todo.push(st);
}
const real = todo.filter((s) => /^ALTER/i.test(s));
if (todo.length === 0) { console.log('nothing to do'); process.exit(0); }
const dir = mkdtempSync(join(tmpdir(), 'migrate-'));
const tmp = join(dir, 'm.sql');
writeFileSync(tmp, todo.map((s) => s + ';').join('\n'));
wrangler(['--file', tmp]);
rmSync(dir, { recursive: true, force: true });
console.log(`done: ${real.length} column(s) added`);
