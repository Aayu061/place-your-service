// Applies supabase/migrations/*.sql in filename order to the STAGING database only (STAGING_DATABASE_URL in server/.env).
// Refuses to run against the live project. Usage: npm --prefix server run db:staging [-- --dry-run | --from <file.sql>]
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Client } = require('pg');

const STAGING_REF = 'eqhnaarawjbnjikajfpz';
const LIVE_REF = 'jvccvdxfilzlncbgiplk';
const url = process.env.STAGING_DATABASE_URL || '';
if (!url.includes(STAGING_REF) || url.includes(LIVE_REF)) {
  console.error('Refusing to run: STAGING_DATABASE_URL is missing or does not point at the staging project.');
  process.exit(1);
}

const DIR = require('path').join(__dirname, '..', '..', 'supabase', 'migrations');
const args = process.argv.slice(2);
const fromIdx = args.indexOf('--from');
const from = fromIdx >= 0 ? args[fromIdx + 1] : null;
const dryRun = args.includes('--dry-run');

(async () => {
  let files = fs.readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort();
  if (from) files = files.slice(files.indexOf(from));
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();
  const who = await client.query('select current_database() db, current_user usr, version() v');
  console.log('connected:', who.rows[0].db, who.rows[0].usr, who.rows[0].v.split(' ').slice(0, 2).join(' '));
  await client.query(`create table if not exists public._staging_applied_migrations (name text primary key, applied_at timestamptz default now())`);
  const done = new Set((await client.query('select name from public._staging_applied_migrations')).rows.map((r) => r.name));
  let applied = 0;
  for (const f of files) {
    if (done.has(f)) { console.log('skip (already applied)', f); continue; }
    const sql = fs.readFileSync(path.join(DIR, f), 'utf8');
    if (dryRun) { console.log('would apply', f, `${sql.length} bytes`); continue; }
    try {
      await client.query('begin');
      await client.query(sql);
      await client.query('insert into public._staging_applied_migrations(name) values ($1)', [f]);
      await client.query('commit');
      applied++;
      console.log('OK  ', f);
    } catch (e) {
      await client.query('rollback').catch(() => {});
      console.log('FAIL', f);
      console.log('     ', (e.message || '').split('\n')[0].slice(0, 300), e.position ? `(at char ${e.position})` : '');
      await client.end();
      process.exit(2);
    }
  }
  console.log(`done: ${applied} applied`);
  await client.end();
})().catch((e) => { console.error('ERROR', (e.message || '').slice(0, 300)); process.exit(1); });
