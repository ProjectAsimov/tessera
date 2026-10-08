// Idempotent D1 migration runner.
//   node scripts/migrate.mjs --local | --remote [--persist-to <dir>] [--db <name>] [--file <sql>]
// Runs each statement of the migration file(s) (default: 002, 003, then 004), skipping `ALTER TABLE x ADD COLUMN y`
// when column y already exists (SQLite has no ADD COLUMN IF NOT EXISTS).
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const local = args.includes('--local');
const remote = args.includes('--remote');
if (local === remote) { console.error('usage: node scripts/migrate.mjs --local|--remote [--persist-to dir] [--db name] [--file sql]'); process.exit(2); }
const db = opt('--db') ?? 'tasktracker';
const files = opt('--file') ? [resolve(root, opt('--file'))] : ['002_slice_a.sql', '003_slice_a1.sql', '004_push.sql'].map((f) => resolve(root, 'src/db/migrations', f));
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

let added = 0;
for (const file of files) {
  console.log('== ' + basename(file));
  added += migrateFile(file);
}
console.log(`done: ${added} column(s) added`);

function migrateFile(file) {
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
if (todo.length === 0) { console.log('nothing to do'); return 0; }
const dir = mkdtempSync(join(tmpdir(), 'migrate-'));
const tmp = join(dir, 'm.sql');
writeFileSync(tmp, todo.map((s) => s + ';').join('\n'));
wrangler(['--file', tmp]);
rmSync(dir, { recursive: true, force: true });
return real.length;
}
