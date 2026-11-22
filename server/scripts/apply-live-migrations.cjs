// Applies a fixed, reviewed list of migrations to the LIVE database (LIVE_DATABASE_URL in server/.env).
// Each file runs in its own transaction and is recorded in supabase_migrations.schema_migrations,
// so the Supabase dashboard shows it like any other migration. Already-recorded versions are skipped.
// Usage: node server/scripts/apply-live-migrations.cjs [--dry-run]
// Take a backup first. Remove LIVE_DATABASE_URL from .env when finished.
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { Client } = require('pg');

const LIVE_REF = 'jvccvdxfilzlncbgiplk';
const STAGING_REF = 'eqhnaarawjbnjikajfpz';
const FILES = [
  '20261118000000_reconcile_live_schema.sql',
  '20261118010000_business_numbers_and_sr_integrity.sql',
  '20261118020000_service_catalog.sql',
  '20261118030000_integration_clients_and_outbox.sql',
  '20261118040000_web_intakes.sql',
  '20261118050000_technician_security.sql',
  '20261119000000_schedule_reschedule_events.sql',
  '20261119010000_ess_storefront_foundations.sql',
  '20261120000000_ac_enquiries.sql',
  '20261121000000_ess_catalog_display_atomic.sql',
];

const url = process.env.LIVE_DATABASE_URL || '';
if (!url.includes(LIVE_REF) || url.includes(STAGING_REF)) {
  console.error('Refusing to run: LIVE_DATABASE_URL is missing or does not point at the live project.');
  process.exit(1);
}
const dryRun = process.argv.includes('--dry-run');
const DIR = path.join(__dirname, '..', '..', 'supabase', 'migrations');

(async () => {
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();
  const who = await client.query('select current_database() db, current_user usr');
  console.log('connected to LIVE:', who.rows[0].db, who.rows[0].usr);
  const done = new Set(
    (await client.query('select version from supabase_migrations.schema_migrations')).rows.map((r) => r.version),
  );
  let applied = 0;
  for (const f of FILES) {
    const [version, ...rest] = f.replace(/\.sql$/, '').split('_');
    const name = rest.join('_');
    if (done.has(version)) { console.log('skip (already recorded)', f); continue; }
    const sql = fs.readFileSync(path.join(DIR, f), 'utf8');
    if (dryRun) { console.log('would apply', f, `${sql.length} bytes`); continue; }
    try {
      await client.query('begin');
      await client.query(sql);
      await client.query(
        'insert into supabase_migrations.schema_migrations(version, name, statements) values ($1, $2, $3)',
        [version, name, [sql]],
      );
      await client.query('commit');
      applied++;
      console.log('OK  ', f);
    } catch (e) {
      await client.query('rollback').catch(() => {});
      console.log('FAIL', f, '- rolled back; later files not attempted');
      console.log('     ', (e.message || '').split('\n')[0].slice(0, 300), e.position ? `(at char ${e.position})` : '');
      await client.end();
      process.exit(2);
    }
  }
  console.log(`done: ${applied} applied`);
  await client.end();
})().catch((e) => { console.error('ERROR', (e.message || '').slice(0, 300)); process.exit(1); });
