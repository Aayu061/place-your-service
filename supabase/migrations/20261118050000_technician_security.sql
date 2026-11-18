-- Technician portal security (Phase 1, Agent E)
--  * pin_reset_required : technician must set a new 6-digit PIN at next login
--                         (set for default PINs and whenever the admin sets/resets a PIN)
--  * token_version      : bumped on every PIN change/reset; tokens carrying an older
--                         version are rejected on every request
--  * failed_pin_attempts / locked_until : 5 wrong PINs in a row lock the account for 15 minutes
-- Safe to re-run.

ALTER TABLE public.technicians
  ADD COLUMN IF NOT EXISTS pin_reset_required  boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS token_version       integer     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS failed_pin_attempts integer     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_until        timestamptz NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'technicians_failed_pin_attempts_nonnegative'
      AND conrelid = 'public.technicians'::regclass
  ) THEN
    ALTER TABLE public.technicians
      ADD CONSTRAINT technicians_failed_pin_attempts_nonnegative CHECK (failed_pin_attempts >= 0);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'technicians_token_version_nonnegative'
      AND conrelid = 'public.technicians'::regclass
  ) THEN
    ALTER TABLE public.technicians
      ADD CONSTRAINT technicians_token_version_nonnegative CHECK (token_version >= 0);
  END IF;
END $$;

COMMENT ON COLUMN public.technicians.pin_reset_required IS
  'true = technician must set a new 6-digit PIN before using the portal (default/admin-set PIN).';
COMMENT ON COLUMN public.technicians.token_version IS
  'Incremented on PIN change/reset; portal tokens with an older version are rejected.';
COMMENT ON COLUMN public.technicians.failed_pin_attempts IS
  'Consecutive wrong PINs; reaching 5 sets locked_until and resets to 0.';
COMMENT ON COLUMN public.technicians.locked_until IS
  'Portal login refused until this time after too many wrong PINs.';

-- Legacy fixed-value default hashes can be flagged in SQL:
--  * ab6872e3... = SHA-256('1234' || 'pys-tech-salt-2026'), the legacy default PIN 1234
--  * 8848db71... = the value migration 20261110000000 wrote as "PIN 1234"; it does NOT actually
--    match 1234 (or any known PIN), so those technicians need an admin PIN reset anyway.
-- Default PINs stored as salted scrypt hashes cannot be found in SQL: run
-- server/scripts/flag-default-pins.cjs for those.
UPDATE public.technicians
SET pin_reset_required = true
WHERE pin_hash IN (
    'ab6872e3e7df2a2b5fd94387087c80ce5c55224e0cb44011a1ceb769f267d973',
    '8848db71d368d1469f3d6dbf4eb4779417efc051a37c041f0b0949d282f9ef2d'
  )
  AND pin_reset_required = false;
