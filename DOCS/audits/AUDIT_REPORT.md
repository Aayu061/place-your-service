# Place Your Service — Website and Project Audit

**Audit date:** 5 November 2026  
**Repository:** Local worktree based on `ab4f82b` (`main`); implementation changes are uncommitted  
**Audit type:** Source, configuration, migrations, documentation, local tests/builds, dependency review, and disposable local PostgreSQL-compatible migration replay  
**Overall assessment:** The V1 enhancements are implemented in the local source and the local checks pass. The project is **not release-ready yet** because the historical production Admin password still needs to be reset, the full mutating workflow and database permissions have not been verified on isolated staging, Resend has not been tested live, and the responsive/accessibility review has not been completed in a real browser.

## Executive summary

The website is a React 19 and TypeScript single-page application built with Vite, backed by an Express/TypeScript API and Supabase/PostgreSQL. The current worktree contains V1 changes for server-only operational data access, one-time Admin provisioning, AMC and service-report integrity, schedule/analytics consistency, inventory and payment ledgers, notifications, activity history, global search, filtered spreadsheet exports, report-email delivery/retry, and addressable UI navigation.

### What changed in this worktree

- Browser authentication now uses Supabase Auth and server verification through `/auth/me`; the separate `localStorage` bearer-token fallback and public first-Admin bootstrap route were removed.
- New database access controls revoke direct browser access to operational data; server operations use the service role. A guarded Admin provisioning script replaces the public bootstrap workflow.
- AMC cadence/allocation, asset/site/customer ownership, service-report snapshots and follow-up scope, scheduling checks, immutable history, and server KPI definitions were tightened in source and migrations.
- Inventory, payment records and reversals, notifications, activity logs, search, exports, and report-email delivery have authenticated APIs and connected UI workspaces.
- Dashboard values now come from the API; URL/history state preserves workspaces and filters; global-search focus handling and follow-up input labels were improved.
- Backend Zod was upgraded to v4; frontend and backend dependency scans now report zero vulnerabilities.
- The local migration replay found a broken dynamic `format()` call in the service-report migration. The call is corrected and an additive idempotent repair migration is included.

### Confirmed remaining work

- Reset the production Admin password whose old value appeared in Git history. Rotation status is unknown, so it must be treated as unchanged until reset.
- Apply and verify the migrations on an isolated staging database, including direct Data API denial, role/function grants, transaction rollback, ledger balances, constraints, and concurrent/idempotent requests.
- Run the full mutating PRD workflow in staging with disposable data. The present staging harness covers health and authenticated reads; it does not create the complete workflow.
- Configure a staging Resend sender and verify delivery, persisted attempts, failure handling, and retry.
- Review responsive behavior, keyboard navigation, screen-reader labels, and real server data in a browser. Local component checks do not substitute for this review.
- Resolve the single existing frontend fast-refresh lint warning when convenient; it does not currently fail lint.

No production credential was used, and no production migration, write, or deployment was performed. The user chose local verification, so no billed Supabase branch was created.

## Scope and method

Reviewed project structure, package manifests and lockfiles, Vercel/Render configuration, frontend application and auth flow, backend app/auth/routing setup, Supabase migration policies, workflow services, UI modules, project rules and product documentation, and the prior full-system re-audit. Also ran the frontend/backend suites, type checks, builds, lint and dependency audits; parsed the SQL files; and replayed the migrations against a disposable local PGlite database with minimal Supabase Auth roles/functions stubbed for migration execution.

This is a code and configuration audit. It does not establish whether a migration has been applied in production, whether deployed environment variables are correct, or whether the public endpoints are currently reachable. Findings about runtime impact should be confirmed against a controlled staging deployment and the live database catalog.

## Architecture and project health

| Area | Current implementation |
|---|---|
| Frontend | React 19, TypeScript, Vite, custom CSS tokens, lazy-loaded screens |
| Backend | Express 4, TypeScript, versioned `/api/v1` routes, Zod validation |
| Identity | Supabase Auth; backend validates JWT and resolves the staff role |
| Database | Supabase PostgreSQL with SQL migrations and RLS |
| Frontend hosting | Vercel rewrite to `index.html`; static assets receive immutable caching |
| API hosting | Render web service, health-check endpoint, secrets supplied through environment variables |
| Automated checks available | Frontend/backend tests, type checks, lint scripts, and builds are defined in package scripts |

### Positive controls observed

- The backend uses Helmet, allow-listed CORS, JSON and URL-encoded body limits, a global API rate limiter, request IDs, and a centralized error handler in [server/src/app.ts](server/src/app.ts).
- Environment values are validated in [server/src/config/env.ts](server/src/config/env.ts); Render marks the Supabase URL and service-role key as non-synchronized secret settings in [render.yaml](render.yaml).
- API routes generally apply authentication and role middleware at the router level. The authentication middleware fetches the user from Supabase Auth, loads profile/staff records, and rejects inactive staff in [server/src/middleware/auth.ts](server/src/middleware/auth.ts).
- `.env` and `DATABSE pass.txt` are ignored by Git and were not tracked at this revision. Their contents were not opened or copied into this report.
- `vercel.json` has an SPA rewrite and long-lived caching for hashed asset paths.

## Historical prioritized findings from the pre-implementation snapshot

The findings in this section describe the earlier source snapshot at `ab4f82b` before the current V1 implementation work. Their current source status is listed in the implementation update below; do not read the original recommendation text as an assertion that the old code is still present.

### High priority

#### A-01 — Direct Supabase access can bypass backend business rules

**Evidence:** [src/services/supabase.ts](src/services/supabase.ts) creates a browser Supabase client with the public anon key. The base migration enables RLS but grants `ALL` on all tables, sequences, and routines to `anon` and `authenticated` (`supabase/migrations/20261007000000_foundation_schema.sql`, lines 624–630). Its dynamically generated operational policies allow authenticated users broad reads and writes, and the activity-log policy permits authenticated inserts (around lines 544–617). Later migrations add more authenticated-facing tables and policies.

**Impact:** A legitimate signed-in user can call Supabase’s data API directly with the public project URL/key and their user token. Those requests do not pass through Express validators, state-transition checks, transaction orchestration, or server-generated audit logic. The current frontend appears to use the browser client primarily for authentication, but that does not prevent an authenticated client from calling the exposed data API independently.

**Recommendation:** Make the API the sole operational write boundary. Revoke unnecessary `anon`/`authenticated` table, sequence, and routine grants; narrow policies to required operations and roles; avoid client-authenticated writes to audit tables; and validate direct REST access with negative permission checks after the migration change.

#### A-02 — First-admin bootstrap is an unauthenticated provisioning endpoint

**Evidence:** [server/src/routes/auth.routes.ts](server/src/routes/auth.routes.ts) registers `POST /bootstrap-admin` with request validation but without `requireAuth` or a deployment secret. The handler delegates to the bootstrap service, which checks whether an Admin already exists before creating one.

**Impact:** On a fresh or reset deployment with no Admin account, a public caller can race to claim initial administrative access. The route is not safe to leave enabled as a general production endpoint.

**Recommendation:** Gate bootstrap with a one-time deployment secret or run provisioning out of band; disable the route after initial setup. Make the zero-admin check and account creation resistant to concurrent calls.

#### A-03 — Backend production dependency advisories

**Evidence:** `npm audit --prefix server --omit=dev --audit-level=high` reported:

| Package | Resolved version | Severity | Audit detail |
|---|---:|---|---|
| `body-parser` | 1.20.8 | High | Denial of service advisory for trailing bytes after a compressed request body; a compatible fix was reported available. |
| `zod` | 3.25.76 | High | Memory exhaustion advisory for oversized constrained collections; the audit tool reports the available fix on Zod 4 as a breaking upgrade. |
| `qs` | 6.16.0 | Moderate | Advisory involving `qs.stringify` with `arrayFormat: 'comma'`; present in the Express/body-parser dependency path. |

The API limits parsed request bodies to 1 MB, which may reduce exposure to oversized payloads, but the dependency findings still need remediation and version-specific assessment. The root production dependency audit found zero vulnerabilities.

**Recommendation:** Update the server dependency tree to patched compatible versions where available. Plan and validate the Zod major-version migration separately, or add explicit payload-shape/size protections and track the unresolved advisory until migration. Re-run both audits after updating the lockfile.

#### A-04 — Existing workflow-integrity defects remain a release concern

The repository’s [DOCS/PYS_FULL_SYSTEM_REAUDIT.md](DOCS/PYS_FULL_SYSTEM_REAUDIT.md), dated 11 October 2026, records 20 actionable findings after source and test review. The report’s detailed source-level scenarios should be treated as the current known-defect register until each is individually closed with evidence. The most consequential groups are:

- **AMC accounting and history:** generated visit schedules can diverge from included visit counts and asset cardinality; contract allocation edits and renewals can lose or invalidate the intended allocation; resolved revisits can be counted inconsistently; removing coverage can erase historical membership.
- **Service-report integrity:** schedule, customer/site, and asset relationships are not consistently enforced; issue resolution can target broader work than the linked follow-up; report snapshots/items can be rewritten by ordinary edits; some read paths update records; related writes use manual cleanup rather than a database transaction.
- **Scheduling and metrics:** rescheduling without a technician can leave work in a non-actionable state; KPI definitions and filters can disagree with UI labels; schedule validation and asset/customer mapping contain known mismatches.

The 15 October migration added a unique index for active reports per schedule (`supabase/migrations/20261015000000_service_report_unique_schedule_and_hardening.sql`), so it addresses one specific concurrency gap from the earlier report. It does not by itself provide atomicity across report header, item, asset, schedule, and audit updates or resolve the other findings. The audit did not replay the prior report’s full database scenarios against the current revision.

**Recommendation:** Use the prior re-audit’s implementation order as the defect backlog. Start with direct database writes and bootstrap; then enforce hierarchy and history invariants in PostgreSQL transactions/RPCs; then repair AMC semantics, report follow-up scope, rescheduling queue behavior, and metric definitions. Close each item with regression evidence from PostgreSQL-backed tests.

### Medium priority

#### A-05 — API authentication fallback persists bearer token in local storage

**Evidence:** [src/context/AuthContext.tsx](src/context/AuthContext.tsx) saves the `/auth/login` fallback token under `pys_auth_token` in `localStorage` and reads it during session restoration when the browser Supabase client is unavailable.

**Impact:** JavaScript running on the origin can read the token if an XSS defect occurs. This path is reachable when Supabase browser configuration is absent, so its use depends on deployment environment configuration that was not inspected.

**Recommendation:** Prefer the Supabase-managed session path or move fallback authentication to a server-managed, `HttpOnly`, `Secure`, `SameSite` cookie. If retaining local storage, treat CSP and XSS prevention as token-security controls and avoid storing a second long-lived token.

#### A-06 — Several advertised workspace modules are placeholders

**Evidence:** [src/App.tsx](src/App.tsx) routes unknown dedicated modules through `ModuleShellPlaceholder`; [src/pages/ModuleShellPlaceholder.tsx](src/pages/ModuleShellPlaceholder.tsx) explicitly calls them scheduled/planned and says database models/endpoints will activate the workspace. `src/layouts/navStructure.ts` exposes Inventory, Payments, Notifications, and Activity Log navigation.

**Impact:** These modules are visible in the signed-in product but do not implement their described operations. The UI does identify them as planned, which reduces the risk of users mistaking them for complete workflows, but product scope and project-level “complete” claims should distinguish delivered features from roadmap items.

**Recommendation:** Label these consistently as planned in release documentation and acceptance criteria, or remove them from production navigation until operational workflows exist.

#### A-07 — Frontend token persistence, session, and error behavior need deployment review

The frontend can authenticate directly with Supabase and fall back to the backend login route. This creates two session paths with different persistence behavior. The browser app also stores user-facing auth errors in context and has a session restore path that clears invalid fallback tokens. Review the deployed configuration to ensure the Supabase path is always configured where intended and that production CSP and token expiry behavior align with the chosen model.

#### A-08 — Stale or conflicting status documentation

**Evidence:** [README.md](README.md) describes a locked current phase and “completed & verified” status while multiple later feature pages and module definitions identify future or placeholder scope. Existing audit documents also note schema and phase-status mismatches.

**Impact:** Operators and contributors can mistake planned functionality or old verification results for current release guarantees.

**Recommendation:** Publish one current implementation status and separate it from historical completion reports. Make the release scope explicit for inventory, payments, notifications, and other placeholder modules.

### Low priority

#### A-09 — Follow-up modal labels are not programmatically associated with fields

**Evidence:** [src/pages/ServiceReportsManagement.tsx](src/pages/ServiceReportsManagement.tsx) renders labels for the follow-up date and start/end times without `htmlFor`/input IDs in the corresponding modal.

**Impact:** Screen readers and label-click behavior may not identify/focus the intended input reliably.

**Recommendation:** Give each input a stable ID and connect the visible label with `htmlFor`. Review the same pattern in other modal and drawer forms.

## Product and quality notes

- The app has explicit loading states, an error boundary, lazy page loading, toast feedback, and reusable UI components. This supports a coherent internal operations interface.
- The app is a client-rendered SPA. Public SEO is not a meaningful product requirement for an internal authenticated tool; accessibility, keyboard use, responsive behavior, and operational clarity are more relevant review areas.
- The source tree contains a substantial automated test suite, but test presence alone does not demonstrate production correctness. The prior audit reported that database mutation paths were mostly exercised with mocked Supabase clients and that cross-record invariants lacked live PostgreSQL regression coverage.
- At this audit, tests and builds were not run. Existing test/build outcomes documented in older reports are historical evidence, not a fresh pass for revision `ab4f82b`.
- No live database, deployed CORS settings, Render service state, Vercel environment variables, backup/restore process, or monitoring setup was inspected.

## Historical recommended action order (superseded by the implementation update)

1. Restrict direct Supabase database access to the minimum required privileges and prevent browser-originated operational writes from bypassing the API.
2. Close or strongly gate `/auth/bootstrap-admin`; verify first-admin provisioning and concurrent-call behavior.
3. Patch the vulnerable backend dependency tree, with a planned and tested Zod major upgrade if required.
4. Revalidate and resolve the prior re-audit’s AMC, report, scheduling, transaction, and KPI findings using PostgreSQL-backed regression coverage.
5. Reconcile the release scope and documentation with the actual implemented modules.
6. Improve token handling and form labeling; review the deployed CSP and environment values.

## Initial audit verification record (historical)

| Check | Result |
|---|---|
| Root production dependency audit: `npm audit --omit=dev --audit-level=high` | Pass — 0 vulnerabilities reported |
| Server production dependency audit: `npm audit --prefix server --omit=dev --audit-level=high` | Findings — 2 high and 1 moderate advisories |
| Current backend resolved versions | `body-parser@1.20.8`, `qs@6.16.0`, `zod@3.25.76` |
| Git tracking check for `.env` and `DATABSE pass.txt` | Neither file is tracked; both are ignored locally |
| Tests, lint, type checks, builds | Not run for this audit |
| Live database/deployment checks | Not performed |

## Initial audit limitations

The original pass was a source-level audit, not a penetration test or live production assessment. The current update adds local test/build evidence and a disposable local migration replay, but still does not prove deployed configuration, Supabase production/staging migration state, actual production data correctness, or exploitability. The previous full-system re-audit is dated 11 October 2026; see the current update below for remediated source items and release gates.

## Implementation update — 5 November 2026

This section updates the source status after implementing the PYS Full V1 enhancement plan. The findings above are preserved as the audit baseline for revision `ab4f82b`; this update does not claim that a production or staging database was inspected.

| Finding | Current source status | Evidence and remaining verification |
|---|---|---|
| A-01 Direct Supabase access | Remediated in migration/source | A server-only privilege migration revokes `anon`/`authenticated` access to public operational tables, sequences, and routines. Apply and verify the migration with anon, Staff, and Admin JWTs on isolated staging before release. |
| A-02 Public Admin bootstrap | Remediated in source | Public bootstrap route removed; initial Admin provisioning is an out-of-band script with required environment values, an Admin-exists guard, and the singleton database constraint. Concurrent provisioning has not been exercised against PostgreSQL. |
| A-03 Dependency advisories | Remediated in current lockfiles | Zod upgraded to v4; all four root/server full and production `npm audit` runs report zero vulnerabilities. |
| A-04 Workflow integrity | Source remediation implemented; database acceptance pending | AMC cadence/allocation rules, per-asset obligation idempotency, report snapshots/follow-up scope, schedule consistency, and KPI source/filter consistency were updated with API and regression coverage. PostgreSQL concurrency, rollback, and role tests still require staging. |
| A-05 localStorage bearer fallback | Remediated in source | Authentication now uses Supabase Auth and the Express `/auth/me` server-verified profile; the API token is kept in memory and the browser localStorage fallback is removed. |
| A-06 Operational placeholders | Remediated for V1 modules | Inventory, payments, notifications, activity logs, global search, and authenticated filtered `.xlsx` exports now have API and UI implementations. The generic placeholder route remains available for modules outside the delivered V1 scope. |
| A-07 Split login/session flow | Remediated in source | The frontend signs in through Supabase Auth, forwards the current access token in memory, and uses the API to verify the profile and role. |
| A-08 Stale status documentation | Partially remediated | README, deployment notes, evidence, and this audit now describe the local V1 implementation and staging gate. Older dated status/contract reports remain historical snapshots and are explicitly superseded by newer status addenda where present. |
| A-09 Follow-up labels | Remediated in source | Follow-up asset, date, start/end time, and notes labels are associated with their inputs in `ServiceReportsManagement.tsx`. |
| A-10 Service-report migration dynamic SQL | Fixed in the local worktree | The original migration supplied 8 identifiers to a dynamic `format()` string with 16 `%I` placeholders. It now creates each policy with an individually parameterized statement; a later idempotent repair migration reasserts those policies for databases where the original migration is already recorded as applied. The entire local migration chain now replays successfully. |

### Verification on the implementation worktree

- Frontend: 20 test files passed, 211 tests passed, 15 staging-only checks skipped; type check and production build passed. Lint passed with one pre-existing fast-refresh warning in `ThemeContext.tsx`.
- Backend: 30 test files and 343 tests passed; type check, build, and lint/typecheck passed. Added coverage for report-email success/failure without report mutation and stable notification pagination across 500-row pages.
- Root and server dependency audits: full and production-only scans all reported zero vulnerabilities.
- E2E guard: 1 safety test passed. The 15 authenticated staging checks skipped because no staging URL or staging secrets were configured. The current staging suite is read-oriented and does not yet exercise the complete mutating PRD workflow.
- SQL validation: 25 migration files and 28 PL/pgSQL function bodies parsed locally. All 25 migrations then applied in order in a disposable local PGlite database with minimal Supabase Auth objects stubbed; the policy repair migration was rerun successfully. Local checks found 8 expected report-child policies, confirmed `anon` and `authenticated` cannot select those operational tables or execute the inventory RPC, and confirmed `service_role` can. This does not emulate a hosted Supabase PostgreSQL project, its actual auth/storage objects, existing production data, or concurrent traffic.
- Production account password rotation remains unknown. The account owner does not remember changing it, so the historical credential must be treated as active until reset. The current source no longer embeds that password, but the earlier committed revision remains in Git history.

No production credential was used, and no production migration, data write, or deployment was performed. Staging acceptance, live Resend delivery, the full browser workflow, and owner password reset remain required before release readiness can be claimed. The source worktree includes uncommitted changes.
