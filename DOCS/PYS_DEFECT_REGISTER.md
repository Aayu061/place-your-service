# PYS Defect Register — Re-Audit 11 October 2026

**Counts:** P0 0 | P1 13 | P2 5 | P3 2  
**Status terms:** VERIFIED = proven from current source/migrations. LIKELY = deterministic risky migration behavior, but no live database state was inspected. TECHNICAL DEBT = verified maintainability/test/documentation concern.

## P1 — High

### PYS-001 — VERIFIED — AMC allocation generation ignores the included-visit contract

- **Module / evidence:** AMC PM generator; server/src/services/amc.service.ts:54-79, 84-125, 1162-1175, 1229-1254.
- **Reproduce:** Create a 2026 quarterly contract with three included visits allocated 1 Dry/1 Jet/1 Pumpdown. Generate PM work; four dates are produced and a fourth Dry fallback is inserted. Add a second asset to multiply schedules.
- **Expected / actual:** Allocation must exactly map to included obligations. Actual generation maps allocation to cadence dates per asset.
- **Impact:** wrong contracted work, misleading allocation display, incorrect billing/completion basis.
- **Action / dependencies:** decide contract-level versus per-asset visit semantics; validate cadence/count before save; generate explicit obligation rows in one transaction; migrate/reconcile affected data.
- **Acceptance test:** all frequencies, month boundaries, arbitrary valid counts, zero-count service types, one/multiple assets, and repeated generation produce exactly the defined obligation set.

### PYS-002 — VERIFIED — AMC PATCH permits invalid allocation and historical plan drift

- **Module / evidence:** server/src/validators/amc.validator.ts:137-156; server/src/services/amc.service.ts:863-921; migration 20261011010000_amc_service_allocation_planner.sql:4-36.
- **Reproduce:** PATCH only dryServiceVisits after an allocated contract exists. No merged sum is checked; generated schedules remain unchanged.
- **Expected / actual:** merged allocation must equal totalVisits and generated/completed records must be protected. Actual state can become invalid and un-reconciled.
- **Impact:** corrupted contract terms and rewritten intended future service mix.
- **Action / dependencies:** database check or normalized allocation table, merged-state validation, immutable/versioned plan once work exists, controlled regeneration.
- **Acceptance test:** partial PATCH, total-change PATCH, completed visit, and direct database/RLS write all reject or follow a documented versioning flow.

### PYS-003 — VERIFIED — renewal silently loses allocation

- **Module / evidence:** server/src/validators/amc.validator.ts:179-198; server/src/services/amc.service.ts:1417-1444; legacy fallback 90-94.
- **Reproduce:** renew an allocated contract without a new allocation. Successor allocation fields are null and sequence reverts to Dry/Jet alternation.
- **Expected / actual:** successor receives explicit validated allocation or disclosed carry-forward. Actual allocation is discarded.
- **Impact:** contract commitments differ after renewal.
- **Action / dependencies:** add allocation to renewal payload or copy/validate predecessor allocation; update UI and migration/API contracts.
- **Acceptance test:** renew Dry/Jet/Pumpdown allocation and verify successor PM types/counts exactly.

### PYS-004 — VERIFIED — completion counts do not recognize valid revisit resolution

- **Module / evidence:** AMC counts server/src/services/amc.service.ts:427-460, 586-617; asset counts server/src/services/asset.service.ts:166-198.
- **Reproduce:** submit a pending report for an AMC obligation, arrange/complete a linked follow-up, then compare contract and asset completed counts.
- **Expected / actual:** original obligation becomes complete once after valid resolution. Actual contract excludes it while asset aggregation can count the follow-up.
- **Impact:** remaining visits, AMC status, and dashboard decisions are wrong.
- **Action / dependencies:** model obligation state separately from appointment/report state; resolve exactly once through an atomic transition.
- **Acceptance test:** completed, pending, resolved follow-up, cancelled follow-up, and retry cases reconcile identically on all screens.

### PYS-005 — VERIFIED — report/schedule hierarchy can be corrupted

- **Module / evidence:** server/src/services/serviceReport.service.ts:102-167, 283-338; server/src/services/schedule.service.ts:497-535, 731-784.
- **Reproduce:** submit a known asset UUID from a different site/customer in a report payload for a scheduled visit.
- **Expected / actual:** asset, site, customer, request, and schedule must agree. Actual service code does not enforce those relationships.
- **Impact:** cross-customer service history/data attribution corruption.
- **Action / dependencies:** server-side ownership joins plus database trigger/RPC validation; do not trust UUID payloads.
- **Acceptance test:** every cross-entity combination is rejected with 400/409 and leaves no writes.

### PYS-006 — VERIFIED — resolution can close an arbitrary report or too many items

- **Module / evidence:** server/src/services/serviceReport.service.ts:146-157, 185-225, 378-470.
- **Reproduce:** create a completed report naming another pending same-site report as originating; use generic/no-asset or multi-asset items.
- **Expected / actual:** a linked follow-up resolves only selected unresolved issue/assets. Actual checks only broad report context and can set all items/source state.
- **Impact:** false resolution, bad KPIs, and lost operational follow-up.
- **Action / dependencies:** persistent issue/item scope, uniqueness/locking on resolution, aggregate outcome derived from asset/item state.
- **Acceptance test:** unrelated same-site source, already resolved source, multi-asset partial completion, and generic item all fail or resolve precisely.

### PYS-007 — VERIFIED — report edits rewrite issued history; GET mutates records

- **Module / evidence:** server/src/services/serviceReport.service.ts:621-641, 1073-1163.
- **Reproduce:** edit a report after an AC asset changes or after its items are resolved; separately GET a report whose follow-up is cancelled.
- **Expected / actual:** snapshots/items/read APIs remain immutable/audited. Actual edit rebuilds snapshots from live assets and resets item resolution; GET clears follow-up linkage.
- **Impact:** historical evidence and audit trail become unreliable.
- **Action / dependencies:** append-only correction/version model, immutable database trigger, explicit audited repair endpoint.
- **Acceptance test:** asset edit, report amendment, resolved item, and GET must not alter issued historical values without an authorized correction record.

### PYS-008 — VERIFIED — report issuance is race-prone and accepts cancelled schedules

- **Module / evidence:** server/src/services/serviceReport.service.ts:102-144, 118-129, 240-483; migration 20261010000000_service_visit_reports.sql:31-40.
- **Reproduce:** concurrently submit two different report numbers for one schedule; submit a report for a cancelled schedule.
- **Expected / actual:** one report per valid appointment, atomically issued. Actual check-then-insert has no database uniqueness/transaction and lacks terminal-state rejection.
- **Impact:** duplicate reports and cancelled work marked completed.
- **Action / dependencies:** partial/unique schedule report index, idempotency key, transaction, terminal-state policy.
- **Acceptance test:** concurrent submits yield one success/one conflict; cancelled/completed states are rejected.

### PYS-009 — VERIFIED — follow-up scope uses first asset but can resolve all source assets

- **Module / evidence:** server/src/services/serviceReport.service.ts:1246-1290 and 392-421.
- **Reproduce:** create a report with two pending assets, with the second asset requiring work; schedule and complete a follow-up.
- **Expected / actual:** follow-up persists selected issue/asset scope. Actual schedule selects assets[0] and resolution can close all.
- **Impact:** wrong technician context and premature closure.
- **Action / dependencies:** normalize follow-up-to-item/asset links; require resolution payload to match them.
- **Acceptance test:** first asset not pending, two pending assets, and partial revisit scenarios preserve unresolved work.

### PYS-010 — VERIFIED — authenticated direct Supabase writes bypass backend controls

- **Module / evidence:** src/services/supabase.ts:16-38; foundation migration 20261007000000:544-586, 603-610, 624-630.
- **Reproduce:** with an authenticated Staff JWT, call Supabase REST for an operational table or activity_logs instead of the backend API.
- **Expected / actual:** business writes and audit entries must be backend/trigger enforced. Actual broad Staff RLS permits direct write and audit insert.
- **Impact:** bypass of validation/status/transaction rules and spoofable audit entries.
- **Action / dependencies:** revoke browser table write privileges; use narrowly scoped RPCs/claims or backend-only service role; make audit log insert trigger/server-only.
- **Acceptance test:** direct authenticated REST mutation and audit insert are denied; intended API flow still succeeds.

### PYS-011 — VERIFIED — reschedule without technician strands the appointment

- **Module / evidence:** server/src/services/schedule.service.ts:424-432, 1421-1530.
- **Reproduce:** reschedule an existing appointment while omitting targetTechId, then open unscheduled work.
- **Expected / actual:** an actionable replacement or unassigned schedule remains visible. Actual same row becomes RESCHEDULED and is excluded from the queue.
- **Impact:** missed service work.
- **Action / dependencies:** atomically create successor or retain SCHEDULED/UNASSIGNED status; update state-machine/UI labels.
- **Acceptance test:** no-tech reschedule, tech replacement, cancellation, and retry all retain exactly one actionable work item.

### PYS-012 — LIKELY — history backfills can fabricate snapshots and resolve unrelated work

- **Module / evidence:** migrations 20261010040000_service_report_assets_snapshot_integrity.sql:24-42 and 20261011010000_amc_service_allocation_planner.sql:43-69.
- **Reproduce:** apply to legacy reports after asset attributes changed or when several same-site pending reports/follow-ups exist.
- **Expected / actual:** unknown old data remains unknown and only exact linked issues resolve. Actual SQL copies current live asset fields and matches resolution by customer/site.
- **Impact:** permanent historical misstatement or over-resolution after migration.
- **Action / dependencies:** do not run broad update unreviewed; backup, dry-run/count, migrate only provable joins, leave unknowns null, provide repair ledger.
- **Acceptance test:** fixture with changed assets and same-site unrelated pending issues proves no fabricated snapshot or unrelated closure.

### PYS-013 — VERIFIED — AMC coverage removal deletes historical membership

- **Module / evidence:** server/src/services/amc.service.ts:1080 onward.
- **Reproduce:** remove a covered asset after completed PM/report history, then view contract/asset AMC history.
- **Expected / actual:** historical association remains with an end date/reason. Actual amc_assets membership is deleted.
- **Impact:** incomplete contract/service history.
- **Action / dependencies:** soft-close association and filter only active coverage for future PM.
- **Acceptance test:** removed asset remains visible in historical contract and asset history, while no new PM is generated.

## P2 — Medium

### PYS-014 — VERIFIED — critical multi-write workflows are not transactional

- **Evidence:** AMC creation service lines 799-846; renewal 1417-1525; schedule assignment 621-711; report create 240-372.
- **Expected / actual:** all-or-nothing writes. Actual code catches/logs some errors or manually compensates partial writes.
- **Impact / action:** partial contracts, assignments, reports, and audits. Move workflows to PostgreSQL transactions/RPCs and fault-injection tests.
- **Acceptance test:** force each child write to fail and verify zero partial persisted state.

### PYS-015 — VERIFIED — metric definitions and filter scope diverge

- **Evidence:** server/src/services/amc.service.ts:311-328; server/src/services/serviceReport.service.ts:949-1004; ServiceReportsManagement.tsx:105-151, 503-543.
- **Expected / actual:** AMC cards count AMC only; pending cards count distinct unresolved issues and state scope. Actual queries count unsuitable rows/report headers and summary ignores several selected filters.
- **Impact / action:** misleading operational KPIs. Define source queries/views, item-level counts, and global-versus-filtered UI labels.
- **Acceptance test:** mix AMCs/non-AMCs, resolved/unresolved items, and filters; values reconcile to fixture truth.

### PYS-016 — VERIFIED — schedule model references a column that migrations do not define and permits invalid times

- **Evidence:** schedule.service.ts:765-779; foundation migration:139-156; schedule.validator.ts; updateSchedule path.
- **Expected / actual:** resolve ownership via site and reject end <= start. Actual column query is invalid and validator accepts independent times.
- **Impact / action:** failed generic scheduling/invalid visits. Correct mapping and time invariant, preserve DB overlap conflict semantics.
- **Acceptance test:** asset-linked AMC schedule works; start=end and end<start return validation error.

### PYS-017 — VERIFIED — asset master, customer filter, and warranty behavior are inconsistent

- **Evidence:** asset.validator.ts:73-84; asset.service.ts list/update paths, warranty mapping/filter.
- **Expected / actual:** model belongs to chosen brand; customerId filter works; warranty has one authoritative calculation. Actual update/filter paths diverge.
- **Impact / action:** bad master combinations and misleading asset searches/statuses. Revalidate relationships and derive/filter warranty consistently.
- **Acceptance test:** invalid brand/model patch fails; customer filter isolates assets; warranty changes at boundary date consistently.

### PYS-018 — VERIFIED — public initial-admin bootstrap is operationally unsafe

- **Evidence:** server/src/routes/auth.routes.ts:15-20; server/src/services/auth.service.ts:58-199.
- **Expected / actual:** one-time provisioning cannot be claimed by a public first caller. Actual public endpoint creates/updates the singleton when none exists.
- **Impact / action:** initial admin takeover/race. Require deployment secret/one-time migration/manual provisioning and disable route after use.
- **Acceptance test:** public request without provisioning authority fails; authorized bootstrap runs once under concurrency.

## P3 — Low

### PYS-019 — VERIFIED — follow-up form labels are not associated to inputs

- **Evidence:** src/pages/ServiceReportsManagement.tsx:1357-1396.
- **Expected / actual:** Date/Start/End labels should use htmlFor matching input IDs. Actual labels are visual only.
- **Impact / action:** reduced assistive-technology usability. Add IDs/htmlFor and keyboard accessibility regression test.

### PYS-020 — TECHNICAL DEBT — source-of-truth documentation and test hygiene are stale

- **Evidence:** DOCS/MEMORY.md phase claims/schema description; frontend test output from npm test.
- **Expected / actual:** docs describe current schema and completion criteria; tests run without async act warning. Actual documentation includes ac_assets.customer_id and a report-modal test emits a React act warning.
- **Impact / action:** audit/implementation decisions can rely on false completion assumptions. Correct docs with each migration and resolve warning.

