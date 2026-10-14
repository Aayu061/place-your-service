# PYS Implementation Status — Re-Audit 11 October 2026

This status is derived from the current main source tree at 826a0b3, migrations, tests, and documentation. “Verified” means source/code-path verification, not a claim that live production data was inspected.

## Verified implemented capabilities

| Capability | Status / evidence |
|---|---|
| Admin and Staff authentication/authorization | Implemented. Supabase Auth, server JWT/profile/staff checks, Admin-only staff routes, browser session handling, and tests exist. |
| Customer, site, and asset workspaces | Implemented. Customer/site/asset services, routes, validation, React management screens, soft active/inactive status, and asset specification view are present. |
| Physical asset vs master catalogue separation | Implemented. AC brands/models/variants and customer ac_assets are separate migration/API/UI concepts. ESSC sequence generation is present. |
| Service requests | Implemented. Create/list/detail/update/status/cancel server paths and UI are present. |
| Technicians and assignment recommendations | Implemented. Technician master, skill/area/workload data, assignment and overlap logic, and scheduler UI are present. GPS is not implemented, consistently with scope. |
| AMC plan/contract lifecycle | Implemented but not safe for all business invariants. Contracts, covered assets, renewal, cancellation, PM generation, allocation fields, and UI exist. See PYS-001–004 and PYS-013–014. |
| Planned/performed service types | Implemented. Schema fields, UI, report validation, display and printing exist. Contract allocation lifecycle is incomplete. |
| Service reports, print, snapshots, and follow-up UI | Implemented but unsafe for material history/resolution cases. Per-asset snapshot display, printable reports, resolution links, and revisit scheduling exist. See PYS-005–009 and PYS-012. |
| Security foundations | Implemented. Helmet, CORS config, rate limiting, validation, server secret handling, JWT checks, and structured redaction exist. The direct database authorization boundary is not adequate (PYS-010). |

## Partially implemented or requiring remediation

| Area | Current status | Required work before production reliance |
|---|---|---|
| AMC allocation planner | UI/backend field validation exists, but cadence/count/asset semantics are not reconciled. | Define obligation model; enforce database invariant; protect allocation history; preserve allocation on renewal. |
| AMC completion and remaining visits | Calculated in more than one way. | Make one authoritative obligation state and do not count revisit appointments as extra included visits. |
| Report resolution | Header, item, and asset data exist, but exact issue scope is absent. | Normalize issue/item/follow-up relationships; make resolution atomic and idempotent. |
| Historical snapshots | Snapshot read/print support exists. | Stop post-issue rebuilds; use immutable/versioned corrections; repair migration strategy. |
| Scheduling / rescheduling | Core scheduling and conflict logic exist. | Correct asset ownership mapping, enforce time range, and keep rescheduled work actionable. |
| Metrics | AMC/report summary APIs and cards exist. | Correct domain filters, use distinct unresolved items where labelled, state card filter scope. |
| Asset catalogue and warranty behavior | CRUD is present. | Validate master relationships on update, apply customer filter, and align warranty display/filter source. |
| Audit logging | Server logging service and table exist. | Make insertion tamper-resistant and create a functional review workspace. |

## Deferred, UI-only, or missing modules

The following are declared in the PRD/MEMORY but are explicitly shown by App.tsx and ModuleShellPlaceholder.tsx as planned shells. The foundation migration contains several underlying tables, but no functional API/service/UI workflow was found:

| Module | Current classification |
|---|---|
| Parts catalogue and inventory ledger | UI-only placeholder; no routes/services |
| Payments and transaction ledger | UI-only placeholder; no routes/services |
| Notifications | UI-only placeholder; TopBar says Shell Preview |
| Activity/audit-log review | UI-only placeholder; no route/service/workspace |
| Dashboard KPIs/analytics | UI-only dashboard shell with explicitly labelled Preview values and demonstration rows |
| System settings | UI-only placeholder |
| Customer portal, technician login/mobile app, vendor portal, GPS tracking | Out of scope for V1; not a defect |

## Historical and lifecycle posture

- **Asset deactivation/reactivation:** implemented as active status changes.
- **Permanent asset deletion:** no application route was found. This is an appropriate conservative default for protected history, but a documented admin-only retention/deletion policy is still absent.
- **Issued ESSC reuse:** sequence-based identity is present; source review found no reuse path.
- **AMC coverage removal:** currently hard-deletes membership and therefore does not preserve full historic coverage context (PYS-013).
- **Reports:** historical snapshot fallback/read paths exist, but editing can overwrite the snapshot/items (PYS-007).
- **Renewals:** predecessor/successor links exist, but allocation does not carry forward (PYS-003).

## Documentation contradictions

1. DOCS/MEMORY.md describes ac_assets.customer_id; current foundation schema does not create it, while schedule code attempts to query it.
2. Several documents call earlier phases complete and report clean verification. The current code still has the allocation, report, migration, and security-boundary gaps catalogued in the re-audit.
3. PRD/MEMORY include inventory, payments, notifications, dashboard analytics, and activity/audit review in scope, while current App navigation routes them to explicit future-phase placeholders.

## Additional verification needed

- Run a disposable PostgreSQL/Supabase integration suite applying every migration in order.
- Test actual deployed RLS with anon, Staff, and Admin JWTs, including direct REST writes.
- Audit existing production rows before any repair migration, especially report snapshots, allocation totals, report-per-schedule duplicates, and resolution links.
- Execute transaction fault-injection and concurrency tests against a real database.
- Exercise responsive and assistive-technology flows in a browser with real operational data; this re-audit reviewed code and component tests, not authenticated live UI data.

## Release gate recommendation

Do not represent AMC allocation, AMC visit completion, report resolution, or immutable historical reporting as production-safe until PYS-001 through PYS-013 are remediated and verified against PostgreSQL. Deferred modules should remain clearly marked as unavailable until their server workflows exist.

