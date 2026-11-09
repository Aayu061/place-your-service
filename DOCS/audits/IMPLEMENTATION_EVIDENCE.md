# PYS Full V1 Implementation Evidence

**Date:** 5 November 2026  
**Repository:** `C:\Users\aayup\Desktop\PYS`  
**Environment:** Local source and mocked API tests; production untouched

## Delivered in source

- Removed the production API default and embedded production login from the live E2E test. E2E requires an explicit local/staging target and staging secret variables.
- Moved first Admin provisioning to a guarded, one-time server script; removed public bootstrap route and the browser's `localStorage` API token fallback.
- Restricted browser roles from operational database tables and added server-only RPCs for ledger operations and atomic workflow invariants.
- Enforced per-asset AMC cadence entitlements and service report snapshot/follow-up scope rules through migrations and API validation.
- Added authenticated operations APIs and workspaces for inventory, payment ledgers/reversals, notifications, activity logs, global search, and filtered `.xlsx` exports.
- Added report email delivery persistence, attempt history, retry handling, a development log transport, and Resend transport support.
- Added report-email service tests for both successful and retryable failed delivery, verifying issued report records remain unchanged.
- Connected dashboard and analytics cards to server-derived metrics, added URL workspace/filter state, and improved global-search dialog keyboard focus handling.
- Upgraded server Zod to v4 and Vitest in both package trees to v5.1; refreshed compatible lockfile dependencies.

## Local verification

| Check | Result |
|---|---|
| Frontend test suite (`npm test`) | Pass — Vitest 5.1.0, 20 files, 211 passed, 15 skipped |
| Backend test suite (`npm run server:test`) | Pass — Vitest 5.1.0, 30 files, 343 passed |
| Frontend type check and production build | Pass — `npm run typecheck`, `npm run build` |
| Backend type check, build, and lint/typecheck | Pass — `npm run server:typecheck`, `npm run server:build`, `npm run server:lint` |
| Frontend lint | Pass with one existing `ThemeContext.tsx` fast-refresh warning |
| Root full and production dependency audits | Pass — 0 vulnerabilities in both scans |
| Server full and production dependency audits | Pass — 0 vulnerabilities in both scans |
| Staging E2E harness | Pass — safety test 1 passed; 15 authenticated staging checks skipped because no isolated staging secrets were configured |
| Migration syntax and local replay | Pass — 25 SQL migration files and 28 PL/pgSQL function bodies parsed; all 25 migrations applied in order in a disposable PGlite database with minimal Supabase Auth roles/functions stubbed |
| Local grants and policy check | Pass — service-report child tables have the expected 8 policies; `anon` and `authenticated` lack table read/function execution privileges; `service_role` has the required access |
| Git whitespace check | Pass after correcting the README trailing spaces; Git still prints Windows line-ending conversion notices |

The frontend lint warning is not a test failure and predates this implementation. Backend regression coverage added a 501-record notification pagination case and report-email send/failure cases. The staging harness now fails on an authentication error when staging variables are configured instead of logging the error and allowing checks to silently no-op. The local migration replay exposed a `format()` placeholder/argument mismatch in the service-report migration; the call was fixed and an idempotent later migration was added to reassert its policies.

## Not verified in this environment

- Hosted Supabase PostgreSQL migration application, hosted role grants/RLS behavior, real-data ledger backfills, transaction rollback, and concurrent request behavior. The local PGlite replay verifies SQL execution against a disposable PostgreSQL-compatible engine with minimal auth stubs; it does not match hosted Supabase extensions/catalog objects or existing data. `psql`, Docker, and an isolated staging project were unavailable.
- Full authenticated staging E2E workflow. Only the harness safety test ran; the 15 authenticated checks were skipped because isolated staging secrets were unavailable. The existing suite exercises authenticated reads and health, not the complete mutating PRD workflow.
- Resend delivery and retry against a live provider. Only source logic and the development transport are available without staging provider configuration.
- Production account password rotation. It remains an owner action because rotation status is unknown.
- Visual and assistive-technology review with real authenticated data.
- Production migration, writes, or deployment. None were performed.

## Important handoff

Treat the password in the historical production E2E revision as exposed. The current file no longer contains it, but historical Git objects were not rewritten. Reset the Supabase Auth Admin password, verify the new password privately, and only then supply a separate staging Admin credential to the staging secret store.
