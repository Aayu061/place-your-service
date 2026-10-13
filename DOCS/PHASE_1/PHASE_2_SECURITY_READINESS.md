# PYS Phase 1 — Phase 2 Security Readiness & Authorization Plan

**Document Date:** 14 October 2026  
**Phase:** Phase 1 — Evidence Collection, Data-Integrity Baseline & Business-Rule Decisions  
**Target Execution:** Phase 2 — Security & Authorization Boundary Remediation  
**Status:** Readiness Specification & Test Matrix

---

## 1. Executive Summary

Phase 1 evidence collection confirmed that the dominant security risk in Place Your Service (PYS) is not unauthenticated external infiltration, but an **unhardened database authorization boundary** (Defect `PYS-010` and `PYS-018`):

1. **Direct Supabase REST Bypass (PYS-010):**
   - The foundation migration executed `GRANT ALL ON ALL TABLES/SEQUENCES/ROUTINES IN SCHEMA public TO anon, authenticated`.
   - The live RLS policies permit any `authenticated` user with a Staff role to execute direct `INSERT` and `UPDATE` statements on operational tables (`customers`, `ac_assets`, `amc_contracts`, `service_schedules`, `service_reports`).
   - Although the frontend React application correctly routes operational requests through the Express backend API, any authenticated staff member with a valid Supabase JWT can make direct HTTP calls to `https://<supabase-url>/rest/v1/...` and mutate records, bypassing all Express validators, business invariants, and logging.
2. **Audit-Log Spoofing (PYS-010):**
   - RLS policy `activity_logs_insert_authorized` permits `authenticated` Staff and Admin users to insert arbitrary audit logs directly, enabling tampering or forging of audit trails.
3. **Public Bootstrap Vulnerability (PYS-018):**
   - The endpoint `POST /api/v1/auth/bootstrap-admin` is publicly accessible without an administrative installation token or secret.

Phase 2 will remediate these boundary flaws without breaking legitimate application workflows. This document details the operational mutation inventory, target authorization architecture, isolated-environment test matrix, and rollback criteria.

---

## 2. Operational Mutation Inventory & Target Boundaries

The table below maps every application mutation from observed source code to its intended enforcement boundary:

| Domain / Entity | Operation | Current Source Route | Current Database Enforcement | Target Phase 2 Boundary |
|---|---|---|---|---|
| **Auth** | Login / Issue JWT | `POST /auth/login` | Supabase Auth API | Express Route + Supabase Auth |
| **Auth** | Bootstrap Admin | `POST /auth/bootstrap-admin` | Public endpoint (checks admin count in code) | **RESTRICTED:** Require deployment setup secret (`BOOTSTRAP_SECRET`) |
| **Staff** | Create / Update Staff | `POST/PUT /staff` | Express middleware (`requireAdmin`) + RLS Admin policy | Express Route (`requireAdmin`) + Service Role |
| **Customers** | Create Customer | `POST /customers` | Express Zod validation + Open Staff RLS | Express Route + Service Role; Revoke direct RLS write |
| **Customers** | Update Customer | `PUT /customers/:id` | Express Zod validation + Open Staff RLS | Express Route + Service Role; Revoke direct RLS write |
| **Sites** | Create / Update Site | `POST/PUT /sites` | Express Zod validation + Open Staff RLS | Express Route + Service Role; Revoke direct RLS write |
| **Assets** | Register AC Asset | `POST /assets` | Express Zod validation + Open Staff RLS | Express Route + Service Role; Revoke direct RLS write |
| **Assets** | Update AC Asset | `PUT /assets/:id` | Express Zod validation + Open Staff RLS | Express Route + Service Role; Revoke direct RLS write |
| **Assets** | Soft Deactivate Asset | `PATCH /assets/:id/status` | Express route + Open Staff RLS | Express Route + Service Role; Revoke direct RLS write |
| **Master Data** | Create / Update Brand | `POST/PUT /master-data/brands` | Express `requireAdmin` + Admin RLS | Express Route (`requireAdmin`) + Service Role |
| **Master Data** | Create / Update Model | `POST/PUT /master-data/models` | Express `requireAdmin` + Admin RLS | Express Route (`requireAdmin`) + Service Role |
| **Technicians** | Create / Update Technician | `POST/PUT /technicians` | Express Zod validation + Open Staff RLS | Express Route + Service Role; Revoke direct RLS write |
| **AMC** | Create AMC Contract | `POST /amc` | Express Zod validation + Open Staff RLS | Express Route + Service Role; Revoke direct RLS write |
| **AMC** | Update AMC (Allocation) | `PATCH /amc/:id` | Express Zod validation + Open Staff RLS | Express Route + Service Role; Revoke direct RLS write |
| **AMC** | Renew AMC Contract | `POST /amc/:id/renew` | Express Zod validation + Open Staff RLS | Express Route + Service Role; Revoke direct RLS write |
| **AMC** | Cancel AMC Contract | `POST /amc/:id/cancel` | Express Zod validation + Open Staff RLS | Express Route + Service Role; Revoke direct RLS write |
| **AMC** | Generate PM Schedules | `POST /amc/:id/generate-pm` | Express route + Open Staff RLS | Express Route + Service Role; Revoke direct RLS write |
| **Schedules** | Create / Assign Schedule | `POST /schedules` | Express Zod validation + Open Staff RLS | Express Route + Service Role; Revoke direct RLS write |
| **Schedules** | Reschedule Visit | `POST /schedules/:id/reschedule`| Express route + Open Staff RLS | Express Route + Service Role; Revoke direct RLS write |
| **Schedules** | Cancel Schedule | `POST /schedules/:id/cancel` | Express route + Open Staff RLS | Express Route + Service Role; Revoke direct RLS write |
| **Reports** | Issue Service Report | `POST /service-reports` | Express Zod validation + Open Staff RLS | Express Route + Service Role; Revoke direct RLS write |
| **Reports** | Amend Report | `PUT /service-reports/:id` | Express Zod validation + Open Staff RLS | Express Route + Service Role; Revoke direct RLS write |
| **Audit Logs** | Insert Audit Event | `POST /api/v1/activity-logs` | `activity_logs_insert_authorized` (Permits direct client insert!) | **STRICT SERVER/TRIGGER ONLY:** Revoke all client insert privileges |

---

## 3. Phase 2 Target Architecture: Hardened Boundary

```mermaid
graph TD
    subgraph Browser Client
        BrowserApp["React Application"]
        AuthModule["Supabase Auth (Tokens & Session)"]
    end

    subgraph Public Internet
        AnonReq["Public / Unauthenticated Attacker"]
        StaffClient["Authenticated Staff User (REST Client / Postman)"]
    end

    subgraph Secure Backend Boundary (Render API)
        ExpressServer["Express API Server (place-your-service-api)"]
        JWTMiddleware["JWT & Profile Verifier"]
        RoleGuard["Admin / Staff Role Guards"]
        ZodValidator["Zod Business Invariants"]
        AuditService["Server-Side Audit Logger"]
    end

    subgraph Supabase Database (PostgreSQL 17)
        DBTables["Operational Tables (Customers, Assets, AMCs, Reports)"]
        AuditTable["activity_logs (Immutable Audit Trail)"]
    end

    BrowserApp -->|1. Authenticate| AuthModule
    BrowserApp -->|2. Validated API Requests| ExpressServer
    
    ExpressServer --> JWTMiddleware
    JWTMiddleware --> RoleGuard
    RoleGuard --> ZodValidator
    ZodValidator -->|3. Authorized Mutation via Service Role| DBTables
    ZodValidator --> AuditService
    AuditService -->|4. Server-Side Logging| AuditTable

    AnonReq -.->|BLOCKED BY RLS & GRANTS| DBTables
    StaffClient -.->|BLOCKED: Direct Table Writes Revoked| DBTables
    StaffClient -.->|BLOCKED: Client Log Inserts Revoked| AuditTable
```

---

## 4. Phase 2 Remediation Workstreams

### Workstream 1: RLS Table Hardening & Privilege Revocation
1. **Revoke Public Grants:** Revoke `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE` privileges on all operational public tables from `anon` and `authenticated`.
2. **Restrict Writes to `service_role`:** Retain full write privileges exclusively for `service_role` (used only by the backend Express server).
3. **Preserve Authorized Read Access (Optional/Staged):** If frontend reads require direct Supabase queries in any module, restrict policies strictly to read-only (`SELECT`). In current architecture, all frontend modules query the backend API, so direct browser reads can also be safely disabled.

### Workstream 2: Audit-Log Trust Boundary Hardening
1. Drop the permissive policy `activity_logs_insert_authorized`.
2. Restrict `activity_logs` INSERT privileges strictly to:
   - Database triggers (e.g., status changes); and
   - The backend server via `service_role`.
3. Add a check constraint or trigger ensuring `actor_profile_id` cannot be forged.

### Workstream 3: Bootstrap-Admin Endpoint Protection
1. Require a deployment environment variable `INITIAL_BOOTSTRAP_TOKEN` on the server.
2. In `POST /api/v1/auth/bootstrap-admin`, require header `X-Bootstrap-Token` matching the server secret.
3. Once an active Admin profile exists in the database, permanently disable the route by returning `404 Not Found` or `403 Forbidden` regardless of token.

---

## 5. Isolated Disposable Environment Test Matrix

Before applying any security changes to production, all changes will be rehearsed in an isolated disposable Supabase/PostgreSQL environment.

| Test ID | Test Scenario | Actor / Role | Expected Result | Acceptance Criteria |
|---|---|---|---|---|
| **SEC-01** | Direct Supabase REST table write attempt | Authenticated Staff JWT | **403 Forbidden / 401 Unauthorized** | Staff cannot insert or update `customers`, `ac_assets`, `amc_contracts`, or `service_reports` via Supabase REST. |
| **SEC-02** | Direct Supabase REST audit log insert attempt | Authenticated Staff JWT | **403 Forbidden / 401 Unauthorized** | Staff cannot insert forged rows into `activity_logs`. |
| **SEC-03** | Public Supabase REST read/write attempt | Unauthenticated / Anon | **401 Unauthorized / 403 Forbidden** | Anon key cannot read or write operational tables. |
| **SEC-04** | Normal customer creation via Express API | Authenticated Staff JWT | **201 Created** | Backend Express API succeeds using service role. |
| **SEC-05** | Normal service report issuance via Express API | Authenticated Staff JWT | **201 Created** | Full report lifecycle succeeds through backend API. |
| **SEC-06** | Admin master data update via Express API | Authenticated Admin JWT | **200 OK** | Admin routes function normally. |
| **SEC-07** | Staff attempt on Admin-only master data route | Authenticated Staff JWT | **403 Forbidden** | Backend `requireAdmin` correctly rejects Staff. |
| **SEC-08** | Unauthenticated call to bootstrap-admin without token | Public Caller | **401 / 403 Forbidden** | Public caller rejected. |
| **SEC-09** | Valid call to bootstrap-admin with correct token | Installation Admin | **201 Created** | Singleton admin provisioned. |
| **SEC-10** | Second call to bootstrap-admin after admin exists | Installation Admin | **409 Conflict / 403 Forbidden** | Cannot re-bootstrap existing system. |

---

## 6. Rollback & Go/No-Go Criteria

### Rollback Criteria for Phase 2:
- If legitimate frontend operations via the Express backend fail due to database permission errors, immediately execute the pre-staged rollback migration restoring previous RLS definitions.
- If backend service-role connection experiences permission degradation, abort deployment and roll back.

### Acceptance Gate for Phase 2 Completion:
1. All 10 tests in the test matrix pass in the isolated disposable environment.
2. Both frontend and backend mocked unit/integration test suites pass with zero regressions.
3. Verification that zero operational routes require direct browser write access.
