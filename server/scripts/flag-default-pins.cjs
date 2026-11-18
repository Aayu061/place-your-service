// One-off: flags every technician whose stored PIN hash still verifies against a known default
// PIN ('1234') so they must set a new 6-digit PIN at next login (pin_reset_required = true).
// Needs migration 20261118050000_technician_security.sql applied first.
//
// Database URL (first one set wins): FLAG_PINS_DATABASE_URL, STAGING_DATABASE_URL (server/.env).
// Refuses the LIVE project unless --live is passed. Prints only counts and technician codes,
// never hashes or PINs.
//
// Usage:
//   node server/scripts/flag-default-pins.cjs --dry-run      # report only
//   node server/scripts/flag-default-pins.cjs                # flag (staging / non-live URL)
//   node server/scripts/flag-default-pins.cjs --live         # flag on LIVE (needs approval)
const crypto = require('crypto');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { Client } = require('pg');

const LIVE_REF = 'jvccvdxfilzlncbgiplk';
const DEFAULT_PINS = ['1234'];
const LEGACY_PIN_SALT = 'pys-tech-salt-2026';
const SCRYPT_KEY_BYTES = 32;

const args = process.argv.slice(2);
const allowLive = args.includes('--live');
const dryRun = args.includes('--dry-run');

const url = process.env.FLAG_PINS_DATABASE_URL || process.env.STAGING_DATABASE_URL || '';
if (!url) {
  console.error('Refusing to run: set FLAG_PINS_DATABASE_URL (or STAGING_DATABASE_URL in server/.env).');
  process.exit(1);
}
const isLive = url.includes(LIVE_REF);
if (isLive && !allowLive) {
  console.error('Refusing to run against the LIVE project without --live.');
  process.exit(1);
}

// Mirrors verifyPin() in server/src/utils/techAuth.ts.
function verifyPin(pin, storedHash) {
  if (!storedHash) return false;
  if (storedHash.startsWith('scrypt$')) {
    const parts = storedHash.split('$');
    if (parts.length !== 3) return false;
    const [, salt, expectedHex] = parts;
    if (!salt || !/^[a-f0-9]+$/i.test(expectedHex) || expectedHex.length !== SCRYPT_KEY_BYTES * 2) return false;
    const derived = crypto.scryptSync(pin, salt, SCRYPT_KEY_BYTES);
    return crypto.timingSafeEqual(derived, Buffer.from(expectedHex, 'hex'));
  }
  if (!/^[a-f0-9]{64}$/i.test(storedHash)) return false;
  const legacy = crypto.createHash('sha256').update(`${pin}${LEGACY_PIN_SALT}`).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(legacy), Buffer.from(storedHash.toLowerCase()));
}

(async () => {
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log(`target: ${isLive ? 'LIVE' : 'non-live'} database${dryRun ? ' (dry run)' : ''}`);

  const col = await client.query(
    `select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'technicians' and column_name = 'pin_reset_required'`
  );
  if (col.rowCount === 0) {
    console.error('technicians.pin_reset_required does not exist. Apply migration 20261118050000 first.');
    await client.end();
    process.exit(2);
  }

  const { rows } = await client.query(
    'select id, technician_code, pin_hash, pin_reset_required from public.technicians order by technician_code'
  );
  const matches = rows.filter((r) => DEFAULT_PINS.some((pin) => verifyPin(pin, r.pin_hash)));
  const toFlag = matches.filter((r) => !r.pin_reset_required);

  console.log(`technicians checked: ${rows.length}`);
  console.log(`using a default PIN: ${matches.length} (${matches.map((r) => r.technician_code).join(', ') || 'none'})`);
  console.log(`already flagged: ${matches.length - toFlag.length}`);

  if (dryRun || toFlag.length === 0) {
    console.log(dryRun ? 'dry run: nothing changed' : 'nothing to change');
    await client.end();
    return;
  }

  await client.query('begin');
  try {
    const res = await client.query(
      'update public.technicians set pin_reset_required = true, updated_at = now() where id = any($1::uuid[]) and pin_reset_required = false',
      [toFlag.map((r) => r.id)]
    );
    await client.query('commit');
    console.log(`flagged: ${res.rowCount}`);
  } catch (e) {
    await client.query('rollback').catch(() => {});
    throw e;
  }
  await client.end();
})().catch((e) => {
  console.error('ERROR', String((e && e.message) || e).split('\n')[0].slice(0, 300));
  process.exit(1);
});
