# PYS Full V1 Deployment Notes

**Prepared:** 5 November 2026  
**Scope:** Local implementation and isolated staging preparation  
**Production state:** No production migration, write, credential use, or deployment was performed.

The project owner chose local-only verification. No billed Supabase staging branch was created, and the connected production project was not used for verification.

## Before staging verification

1. Create or identify a Supabase staging project and API deployment that contains no production data. The connected project inventory available during this work did not include a confirmed staging project.
2. Take a staging database backup/snapshot and record the current migration version.
3. Replace the Admin password that appeared in the historical production E2E source before using that account again. If you are unsure whether it was changed, treat it as not changed. In the Supabase Dashboard, open **Authentication → Users**, select the Admin account, and start a password recovery or set a new password through a trusted admin workflow. A password rotation means replacing that account password with a new unique password; the old password should no longer authenticate. Do not send the new password in chat. Supabase documents password reset and update flows in its [password-based Auth guide](https://supabase.com/docs/guides/auth/passwords). Password changes terminate sessions, but access tokens already issued can remain valid until expiry; Supabase describes that behavior in its [session guide](https://supabase.com/docs/guides/auth/sessions).
4. Configure staging-only secrets outside Git:
   - `PYS_E2E_MODE=staging`
   - `PYS_E2E_API_BASE_URL=https://<staging-host>/api/v1`
   - `PYS_E2E_ADMIN_EMAIL` and `PYS_E2E_ADMIN_PASSWORD`
   - server-side `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
   - optionally `RESEND_API_KEY` and `RESEND_FROM_EMAIL` for a verified staging sender
5. Confirm the E2E URL is a staging or preview host and that its test data is disposable. The test guard rejects ordinary production hosts and will skip the authenticated suite when staging credentials are absent.

## Migration sequence

Apply the repository migrations in timestamp order on staging only. The enhancement migrations are:

1. `20261105144452_secure_server_only_business_data_access.sql`
2. `20261105150632_amc_cadence_invariants.sql`
3. `20261105151827_service_report_follow_up_scopes_and_snapshots.sql`
4. `20261105153000_operational_v1_ledgers_and_delivery.sql`
5. `20261105180258_service_report_policy_format_repair.sql`

Before each apply, inspect the target project reference and migration diff. The original service-report migration had a dynamic `format()` argument mismatch; its source is corrected, and the later repair migration safely reasserts the expected policies if an existing database already recorded the earlier migration as applied. The full local chain passed a disposable PGlite replay, but it has not been applied to hosted staging. The operational ledger migration captures opening inventory and legacy paid totals, then writes explicit reconciliation entries when an existing ledger does not equal the current stock or paid balance. It aborts if the existing payment ledger exceeds the stored paid balance, and it requires an existing Admin profile when reconciliation entries need attribution. Verify the resulting ledger totals and that historical payment methods remain marked `LEGACY`.

## Staging verification

From the repository root, install the lockfile dependencies and run:

```powershell
npm run typecheck
npm run lint
npm run build
npm test
npm run server:typecheck
npm run server:lint
npm run server:build
npm run server:test
npm run test:e2e
```

Use the root Vitest E2E script only with the staging environment variables above. The current workspace had no confirmed staging API URL or staging credentials, so the authenticated staging suite has not been exercised. Confirm these business paths with disposable test data: Staff provisioning and login, customer/site/asset hierarchy, AMC cadence and obligation idempotency, assignment and rescheduling, issued report and follow-up scope, inventory consumption and return, payment receipt and reversal, notification generation/read state, exports, activity history, and report email retry state.

The current environment-gated suite performs health and authenticated read checks. It does not yet create and clean up the full mutating workflow, and it is API-level rather than browser-driven; treat the end-to-end workflow acceptance as outstanding until a disposable staging fixture and browser suite exercise the complete path.

For email, first verify the development log transport without a provider key. For actual staging delivery, configure a verified Resend sender and a non-production recipient, then confirm the durable delivery and attempt records. Email provider failure must leave the report saved and retryable.

## Rollback and recovery checklist

- Stop the rollout if migration application fails, row counts change unexpectedly, or any invariant query fails.
- Keep the staging snapshot and migration logs until the complete workflow passes.
- Roll the application back to the last version compatible with the schema only after checking migration compatibility; the new API uses the new functions and tables.
- Do not delete or rewrite inventory, payment, email-attempt, report-snapshot, or activity history as a rollback shortcut. Use compensating ledger entries for operational corrections.
- If the staging database is no longer trustworthy, restore its pre-migration snapshot and recreate the disposable E2E fixture.
- Production deployment and production migration require a separate approval and a separately reviewed production runbook.

## Outstanding owner action

The production Admin password in the historical test source was not used in this work. The account owner said they do not remember whether it was rotated, so this plan treats it as unrotated. Reset it before any future use of that account or production-directed E2E execution. Current source tests use only explicit local/staging configuration, but Git history still contains the earlier committed test revision; history rewriting was not performed.
