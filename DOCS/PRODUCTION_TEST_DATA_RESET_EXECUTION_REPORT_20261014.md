# PYS — Production Database Demo Customer Reset: Execution & Verification Report

**Executed:** 2026-10-14 20:41 UTC+05:30  
**Target Environment:** Live Production Supabase (`ap-south-1`)  
**Target Project:** `place-your-service` (`jvccvdxfilzlncbgiplk`)  
**Host Endpoint:** `db.jvccvdxfilzlncbgiplk.supabase.co:5432`  
**Database Engine:** PostgreSQL 17.11 on `aarch64`  
**Execution Status:** **SUCCESSFULLY EXECUTED & DUAL-VERIFIED** (Atomic Transaction Committed in 213ms)  
**Total Customer-Owned Operational Records Deleted:** **102 records across 11 tables**  
**Total Preserved Records:** **442 records across 8 tables + 1 sequence**  

---

## 1. Executive Summary & Outcome

Pursuant to explicit approval and directives, the production database reset for all 9 demo customers and their associated customer-owned operational records was successfully executed in a single atomic transaction.

All pre-flight assertions, cycle-breaking foreign key nullifications, reverse-dependency targeted deletions, and post-flight zero-state assertions completed with **zero errors**. The transaction committed in **213ms**.

Subsequent dual-channel independent verification (via Direct PostgreSQL connection and Supabase Management API) confirmed:
1. **0 demo customers and 0 customer-owned operational records remain** in the live database.
2. **100% of staff accounts, administrative profiles, field technicians, master equipment catalogs, AMC plan definitions, audit logs, and the ESSC asset code sequence are strictly preserved.**

---

## 2. Target Project Identity Verification

Concrete evidence collected and verified prior to execution:

| Parameter | Verified Telemetry Value | Source / Method | Verification Status |
| :--- | :--- | :--- | :---: |
| **Project Reference** | `jvccvdxfilzlncbgiplk` | Supabase API (`get_project`) & Host DSN | **VERIFIED MATCH** |
| **Project Name** | `place-your-service` | Supabase Management Metadata | **VERIFIED MATCH** |
| **Database Host** | `db.jvccvdxfilzlncbgiplk.supabase.co` | Supabase Infrastructure Engine | **VERIFIED MATCH** |
| **Cloud Region** | AWS `ap-south-1` (Mumbai, India) | Supabase Configuration Telemetry | **VERIFIED MATCH** |
| **Engine Version** | PostgreSQL 17.11 on `aarch64-unknown-linux-gnu` | Live SQL `SELECT version()` | **VERIFIED MATCH** |
| **Current User & Database**| `postgres` on database `postgres` | Live SQL `current_user`, `current_database()` | **VERIFIED MATCH** |
| **Health Status** | `ACTIVE_HEALTHY` | Supabase Infrastructure Health | **VERIFIED MATCH** |

---

## 3. Pre-Flight Verification & Safety Audits

### A. Pre-Flight Count Validation (100% Match with Manifest)
Prior to execution, all 25 public tables were queried. Zero unexpected records, foreign key divergences, or missing dependencies were found:

- Target Customers: **9** (Exact match)
- Customer Sites: **10** (Exact match)
- AC Registered Assets: **10** (`ESSC-0001` through `ESSC-0010`)
- AMC Contracts: **9** (`AMC-2026-0001` through `AMC-2026-0009`)
- AMC Covered Assets: **10**
- Service Schedules: **38**
- Service Requests: **2** (`SR-2026-202878`, `SR-2026-692138`)
- Service Assignments: **7**
- Service Reports: **3** (`REP-001`, `123`, `456`)
- Service Report Assets: **3**
- Service Report Items: **1**
- **Total Operational Candidates:** **102 rows**

### B. Trigger & Dependency Audits
- **Triggers:** Audited all 19 active triggers across `public`. **Zero `ON DELETE` triggers exist.** Triggers only handle `BEFORE UPDATE` (such as `set_updated_at()`) or conflict checks on schedule booking. No trigger writes to or deletes from `activity_logs` during deletions.
- **Foreign Key Constraints:**
  - `payments.customer_id` (`RESTRICT`): Verified table `payments` has **0 rows** and `payment_transactions` has **0 rows**.
  - `activity_logs`: Only references `actor_profile_id -> profiles.id` (`SET NULL`). No foreign keys point from or to candidate deletion tables.
  - Cycle breaking was executed within the transaction for `service_schedules` (`rescheduled_from_id`, `pm_obligation_id`), `service_reports` (`originating_report_id`, `resolving_report_id`, `follow_up_schedule_id`, `service_schedule_id`), and `amc_contracts` (`previous_contract_id`).

---

## 4. Deletion Manifest & Executed Records (102 Records Deleted)

### A. 9 Target Customers Deleted
| # | Customer Code | Customer Name | Immutable Internal UUID | Status |
| :-: | :--- | :--- | :--- | :---: |
| 1 | `CUST-383676` | Sachin Parekh | `513e4b83-937c-4fe2-83dc-ed0689dc0387` | **DELETED** |
| 2 | `CUST-222913` | Vijay Gollar | `4ea00c4e-3ba0-4d76-9743-8469ca567d37` | **DELETED** |
| 3 | `CUST-540410` | Dhiraj Jain | `31ef07c9-dca0-4aaf-acb4-9da1c5dc170f` | **DELETED** |
| 4 | `CUST-321358` | Vijay Devkar | `45b51f0c-5261-4094-b256-27fdaf64b948` | **DELETED** |
| 5 | `CUST-892951` | Rahul Banthia | `d2030dcb-535f-4bc1-a46b-e7a6fe2eddef` | **DELETED** |
| 6 | `CUST-992423` | Anup Jhaveri | `51134d24-79cb-41e8-8b1d-ed35d90b6795` | **DELETED** |
| 7 | `CUST-497221` | Adv. Susheel Mahadeshwar | `94a33f3f-67b7-40e3-9054-71f193df63c0` | **DELETED** |
| 8 | `CUST-961330` | Mr Hiren Mehta | `5a3dc1c9-e4f0-481e-b6b9-efc71cf3635f` | **DELETED** |
| 9 | `CUST-400589` | KOTAK EDUCATION FOUNDATION | `dddee4a7-1b28-43d0-bd91-5398d457f4b1` | **DELETED** |

### B. 10 Customer Sites Deleted
1. `8dd50208-0fa7-49d4-bc92-cb4244b901f6` — Sachin Parekh (Residence)
2. `d1edfbb4-0806-482e-89f8-e5b34bb2ea9f` — Sachin Parekh (Keel Logistics)
3. `abe24715-0b68-413c-af8c-db47461dfd22` — Vijay Gollar (Resident)
4. `d19eed11-0a73-4446-8874-b75087ab931e` — Dhiraj Jain (Gyaneshwar Apartment)
5. `d93a9de2-6c09-4655-b741-9b96604f0a22` — Vijay Devkar (Office)
6. `761423b7-fafd-4a9f-ad62-d37c1a8bc099` — Rahul Banthia (Laxmi ratan Bunglow)
7. `6dc93141-d1e9-4459-a35a-d55cabfd7b08` — Anup Jhaveri (Giriraj Building)
8. `2dc5bc68-f995-4126-ac2f-a098fb02ea12` — Adv. Susheel Mahadeshwar (Fountain Chambers)
9. `1e904459-95f6-43e1-8d74-6bfb5d1678aa` — Mr Hiren Mehta (Main Site)
10. `da2d8488-4a35-4b5d-87aa-a315e0c5c7dd` — KOTAK EDUCATION FOUNDATION (Site)

### C. Operational Records Breakdown Deleted
- `service_report_items`: **1 row** (`9dc3c7be-b415-4428-83f7-afde841ac246`)
- `service_report_assets`: **3 rows** (`db6a5c20-506e-4f7d-82af-5dac6555d1b8`, `4198fb04-ee23-4077-8646-efc3be199ded`, `d384690b-cc9e-4c68-bab2-83a6cdbcbaaf`)
- `service_reports`: **3 rows** (`b429cab4-a754-41a3-b312-611c99736940` [123], `f67f8a06-c151-4ddb-8e2d-0c3e051926b6` [456], `6f092e7f-4d0a-4e97-8cc4-97e94eb2771d` [REP-001])
- `service_assignments`: **7 rows** (`4704015b-...`, `4c7b4121-...`, `5cf92ece-...`, `74d57053-...`, `2fdc69a0-...`, `95f5ac69-...`, `256e505f-...`)
- `service_schedules`: **38 rows** (All scheduled PM and breakdown slots)
- `service_requests`: **2 rows** (`83839ac0-8ac8-4163-95a0-4506ab2126e6` [SR-2026-202878], `eab112a7-07b8-405c-8920-fca2ebc05547` [SR-2026-692138])
- `amc_assets`: **10 rows**
- `amc_contracts`: **9 rows** (`AMC-2026-0001` through `AMC-2026-0009`)
- `ac_assets`: **10 rows** (`ESSC-0001` through `ESSC-0010`)
- `customer_sites`: **10 rows**
- `customers`: **9 rows**

---

## 5. Post-Execution Database Verification Audit

Immediately following transaction commit, an exhaustive audit across all 25 tables was performed:

| Table Category | Table Name | Pre-Reset Count | Deleted Count | Post-Reset Count | Status |
| :--- | :--- | :---: | :---: | :---: | :---: |
| **Customer Data** | `customers` | 9 | 9 | **0** | **CLEAN (ZERO)** |
| **Customer Data** | `customer_sites` | 10 | 10 | **0** | **CLEAN (ZERO)** |
| **Operational** | `ac_assets` | 10 | 10 | **0** | **CLEAN (ZERO)** |
| **Operational** | `amc_contracts` | 9 | 9 | **0** | **CLEAN (ZERO)** |
| **Operational** | `amc_assets` | 10 | 10 | **0** | **CLEAN (ZERO)** |
| **Operational** | `service_schedules` | 38 | 38 | **0** | **CLEAN (ZERO)** |
| **Operational** | `service_requests` | 2 | 2 | **0** | **CLEAN (ZERO)** |
| **Operational** | `service_assignments`| 7 | 7 | **0** | **CLEAN (ZERO)** |
| **Operational** | `service_reports` | 3 | 3 | **0** | **CLEAN (ZERO)** |
| **Operational** | `service_report_assets`| 3 | 3 | **0** | **CLEAN (ZERO)** |
| **Operational** | `service_report_items` | 1 | 1 | **0** | **CLEAN (ZERO)** |
| **Master Catalog** | `ac_brands` | 14 | 0 | **14** | **PRESERVED 100%** |
| **Master Catalog** | `ac_models` | 110 | 0 | **110** | **PRESERVED 100%** |
| **Master Catalog** | `ac_model_variants` | 106 | 0 | **106** | **PRESERVED 100%** |
| **Master Catalog** | `amc_plans` | 4 | 0 | **4** | **PRESERVED 100%** |
| **Auth & Staff** | `staff` | 2 | 0 | **2** | **PRESERVED 100%** |
| **Auth & Staff** | `profiles` | 2 | 0 | **2** | **PRESERVED 100%** |
| **Workforce** | `technicians` | 4 | 0 | **4** | **PRESERVED 100%** |
| **Audit Logs** | `activity_logs` | 200 | 0 | **200** | **PRESERVED 100%** |
| **Empty Table** | `inventory_transactions`| 0 | 0 | **0** | Preserved |
| **Empty Table** | `notifications` | 0 | 0 | **0** | Preserved |
| **Empty Table** | `parts` | 0 | 0 | **0** | Preserved |
| **Empty Table** | `payment_transactions` | 0 | 0 | **0** | Preserved |
| **Empty Table** | `payments` | 0 | 0 | **0** | Preserved |
| **Empty Table** | `service_parts` | 0 | 0 | **0** | Preserved |

---

## 6. Verification of Strictly Preserved Assets

### A. Administrative Staff & User Profiles (2 Accounts Preserved)
- `fcabf3cd-a62b-4ed9-822d-7eba09a175e6` | **ADMIN** | System Administrator (`dpk.panchal79@gmail.com`)
- `cfea18a0-33a2-4bb5-8511-369a97ab7323` | **STAFF** | Aayush Panchal (`aayu.panchal61@gmail.com`)

### B. Field Technicians (4 Preserved)
- `TECH-0001`: Santosh Bhardwaj (`d6b28759-53a4-4db6-8167-11814555d37c`)
- `TECH-0002`: Deepak Panchal (`e709ffad-30cc-4fb9-852b-e4ccaf851ed4`)
- `TECH-0003`: Mohammad (`153a2ec8-3013-4d65-b89d-4ceecb230143`)
- `TECH-0004`: Hafeez Chudhry (`08f24748-db38-47f5-a286-ec176beb35cf`)

### C. Master Equipment Catalog & Plans (234 Records Preserved)
- 14 AC Brands
- 110 AC Models
- 106 AC Model Variants
- 4 AMC Service Plans

### D. Audit Trail (200 Logs Preserved)
- All 200 `activity_logs` entries remain intact. Zero log entries were truncated or dropped.

### E. Sequential Number Counter Preserved
- `public.ac_asset_code_seq`:
  - `last_value`: **17**
  - `is_called`: **true**
  - Next asset registered will be assigned **`ESSC-0018`** without identifier collisions.

---

## 7. Execution Artifacts & Reproducibility

The exact atomic transaction script executed is permanently archived in the repository:
- Script File: [`DOCS/EXECUTE_RESET_TRANSACTION_20261014.sql`](file:///c:/Users/aayup/Desktop/PYS/DOCS/EXECUTE_RESET_TRANSACTION_20261014.sql)

**Conclusion:** The production customer database has been completely cleared of demo records and is in a pristine, ready-for-production state with all administrative, workforce, and catalog infrastructure intact.
