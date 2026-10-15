# PYS API & Database Contract Matrix

**Document Version:** 2.0  
**Date:** 14 October 2026  
**Repository:** `Aayu061/place-your-service` (`main` @ `7f8cfab`)  
**Scope:** Complete map of REST APIs, roles, schemas, database tables, side effects, and contract discrepancies.

---

## 1. Authentication & System Baseline Matrix

| Method | Endpoint | Role | Request Schema | Response Schema | Backend Handler | DB Tables Mutated | Side Effects | Test Coverage |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/health` | Public | None | `{ success: true, timestamp, status }` | `healthController.check` | None | None | `health.test.ts` (Unit/Int) |
| `GET` | `/api/v1/health/ready` | Public | None | `{ success: true, database: 'healthy' }` | `healthController.ready` | None | Pings Supabase connection | `health.test.ts` (Int) |
| `POST`| `/api/v1/auth/session` | Public | `{ accessToken: string }` | `{ success: true, user: { id, email, role, fullName } }` | `authController.exchangeSession` | `activity_logs` | Logs login action | `auth.test.ts` (Int) |
| `GET` | `/api/v1/auth/me` | Auth | None (Bearer JWT) | `{ success: true, user: StaffUser }` | `authController.getCurrentUser` | None | None | `auth.test.ts` (Int) |
| `POST`| `/api/v1/auth/logout` | Auth | None | `{ success: true, message: string }` | `authController.logout` | `activity_logs` | Logs logout action | `auth.test.ts` (Int) |

---

## 2. Staff Administration Matrix

| Method | Endpoint | Role | Request Schema | Response Schema | Backend Handler | DB Tables Mutated | Side Effects | Test Coverage |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/staff` | `ADMIN` | Query: `{ role, search, limit, offset }` | `{ success: true, data: StaffMember[], total }` | `staffController.listStaff` | None | None | `staff.test.ts` (Int) |
| `GET` | `/api/v1/staff/:id` | `ADMIN` | Params: `{ id: UUID }` | `{ success: true, data: StaffMember }` | `staffController.getStaffById` | None | None | `staff.test.ts` (Int) |
| `POST`| `/api/v1/staff` | `ADMIN` | `{ email, fullName, role, phone? }` | `{ success: true, data: StaffMember }` | `staffController.createStaff` | `staff`, `profiles`, `activity_logs` | Invites user via Supabase Auth | `staff.test.ts` (Int) |
| `PATCH`| `/api/v1/staff/:id` | `ADMIN` | `{ role?, phone?, isActive? }` | `{ success: true, data: StaffMember }` | `staffController.updateStaff` | `staff`, `profiles`, `activity_logs` | Logs mutation | `staff.test.ts` (Int) |
| `DELETE`| `/api/v1/staff/:id` | `ADMIN` | Params: `{ id: UUID }` | `{ success: true, message: string }` | `staffController.deactivateStaff` | `staff` (`isActive=false`), `activity_logs` | Soft deactivation | `staff.test.ts` (Int) |

---

## 3. Customer & Site Management Matrix

| Method | Endpoint | Role | Request Schema | Response Schema | Backend Handler | DB Tables Mutated | Side Effects | Test Coverage |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/customers` | `ADMIN`, `STAFF` | Query: `{ type, search, limit, offset }` | `{ success: true, data: Customer[], total }` | `customerController.list` | None | None | `customer.test.ts` (Int) |
| `GET` | `/api/v1/customers/:id` | `ADMIN`, `STAFF` | Params: `{ id: UUID }` | `{ success: true, data: CustomerDetail }` | `customerController.getById` | None | Loads sites, assets, active contracts | `customer.test.ts` (Int) |
| `POST`| `/api/v1/customers` | `ADMIN`, `STAFF` | `{ name, customerType, phone, email?, billingAddress?, siteName?, siteAddress? }` | `{ success: true, data: Customer }` | `customerController.create` | `customers`, `customer_sites`, `activity_logs` | Auto-creates primary site if address provided | `customer.test.ts` (Int) |
| `PATCH`| `/api/v1/customers/:id` | `ADMIN`, `STAFF` | `{ name?, phone?, email?, billingAddress?, isActive? }` | `{ success: true, data: Customer }` | `customerController.update` | `customers`, `activity_logs` | Updates record | `customer.test.ts` (Int) |
| `POST`| `/api/v1/customers/:id/convert` | `ADMIN`, `STAFF` | Params: `{ id: UUID }` | `{ success: true, data: Customer }` | `customerController.convertToPermanent` | `customers`, `activity_logs` | Sets `customer_type = 'PERMANENT'` | `customer.test.ts` (Int) |
| `GET` | `/api/v1/sites` | `ADMIN`, `STAFF` | Query: `{ customerId: UUID }` | `{ success: true, data: CustomerSite[] }` | `siteController.listByCustomer` | None | None | `site.service.test.ts` |
| `POST`| `/api/v1/sites` | `ADMIN`, `STAFF` | `{ customerId, siteName, address, contactPerson?, contactPhone? }` | `{ success: true, data: CustomerSite }` | `siteController.create` | `customer_sites`, `activity_logs` | Logs site creation | `site.service.test.ts` |
| `PATCH`| `/api/v1/sites/:id` | `ADMIN`, `STAFF` | `{ siteName?, address?, contactPerson?, contactPhone?, isPrimary? }` | `{ success: true, data: CustomerSite }` | `siteController.update` | `customer_sites`, `activity_logs` | Updates primary site | `site.service.test.ts` |

---

## 4. AC Master Data Matrix (Brands, Models, Variants)

| Method | Endpoint | Role | Request Schema | Response Schema | Backend Handler | DB Tables Mutated | Side Effects | Test Coverage |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/ac-brands` | `ADMIN`, `STAFF` | Query: `{ includeInactive?: boolean }` | `{ success: true, data: AcBrand[] }` | `brandController.list` | None | None | `masterData.service.test.ts` |
| `POST`| `/api/v1/ac-brands` | `ADMIN` | `{ name, countryOfOrigin? }` | `{ success: true, data: AcBrand }` | `brandController.create` | `ac_brands`, `activity_logs` | Brand registration | `masterData.service.test.ts` |
| `PATCH`| `/api/v1/ac-brands/:id/status` | `ADMIN` | `{ isActive: boolean }` | `{ success: true, data: AcBrand }` | `brandController.updateStatus` | `ac_brands`, `activity_logs` | Soft toggle | `brandDeactivation.test.ts` |
| `GET` | `/api/v1/ac-models` | `ADMIN`, `STAFF` | Query: `{ brandId?, acType?, refrigerant?, includeInactive? }` | `{ success: true, data: AcModel[] }` | `modelController.list` | None | Joins `ac_brands` | `masterData.service.test.ts` |
| `POST`| `/api/v1/ac-models` | `ADMIN` | `{ brandId, modelNumber, modelName?, acType, capacityTons?, refrigerant?, technology?, starRating? }` | `{ success: true, data: AcModel }` | `modelController.create` | `ac_models`, `activity_logs` | Model registration | `masterData.service.test.ts` |
| `PATCH`| `/api/v1/ac-models/:id` | `ADMIN` | `{ modelNumber?, modelName?, acType?, capacityTons?, refrigerant?, technology?, starRating? }` | `{ success: true, data: AcModel }` | `modelController.update` | `ac_models`, `activity_logs` | Specification update | `masterData.service.test.ts` |
| `GET` | `/api/v1/ac-variants` | `ADMIN`, `STAFF` | Query: `{ modelId?: UUID }` | `{ success: true, data: AcModelVariant[] }` | `variantController.list` | None | Joins `ac_models` | `masterData.service.test.ts` |
| `POST`| `/api/v1/ac-variants` | `ADMIN` | `{ modelId, variantCode, capacityTons, refrigerant?, starRating? }` | `{ success: true, data: AcModelVariant }` | `variantController.create` | `ac_model_variants`, `activity_logs` | Variant registration | `masterData.service.test.ts` |

---

## 5. AC Asset Register Matrix

| Method | Endpoint | Role | Request Schema | Response Schema | Backend Handler | DB Tables Mutated | Side Effects | Test Coverage |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/assets` | `ADMIN`, `STAFF` | Query: `{ siteId?, customerId?, search?, limit?, offset? }` | `{ success: true, data: AcAsset[], total }` | `assetController.list` | None | Joins site, brand, model, variant | `asset.test.ts` (Int) |
| `GET` | `/api/v1/assets/:id` | `ADMIN`, `STAFF` | Params: `{ id: UUID }` | `{ success: true, data: AcAssetDetail }` | `assetController.getById` | None | Loads service history & AMC | `asset.test.ts` (Int) |
| `POST`| `/api/v1/assets` | `ADMIN`, `STAFF` | `{ siteId, brandId, modelId, variantId?, floorLocation?, roomLocation?, serialNumber?, indoorSerialNumber?, outdoorSerialNumber?, refrigerantType?, purchaseDate?, warrantyStartDate?, warrantyEndDate?, totalWarrantyServices?, dryWarrantyVisits?, jetWarrantyVisits?, pumpdownWarrantyVisits? }` | `{ success: true, data: AcAsset }` | `assetController.create` | `ac_assets`, `activity_logs` | Generates `ESSC-XXXXXX` via DB sequence | `asset.service.test.ts` |
| `PATCH`| `/api/v1/assets/:id` | `ADMIN`, `STAFF` | `{ floorLocation?, roomLocation?, serialNumber?, refrigerantType?, warrantyEndDate?, assetCondition?, assetStatus? }` | `{ success: true, data: AcAsset }` | `assetController.update` | `ac_assets`, `activity_logs` | Updates asset details | `asset.service.test.ts` |

---

## 6. Technicians Master Matrix

| Method | Endpoint | Role | Request Schema | Response Schema | Backend Handler | DB Tables Mutated | Side Effects | Test Coverage |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/technicians` | `ADMIN`, `STAFF` | Query: `{ isAvailable?, search?, serviceArea? }` | `{ success: true, data: Technician[] }` | `technicianController.list` | None | None | `technician.test.ts` (Int) |
| `GET` | `/api/v1/technicians/:id` | `ADMIN`, `STAFF` | Params: `{ id: UUID }` | `{ success: true, data: TechnicianDetail }` | `technicianController.getById` | None | Loads current active schedules | `technician.test.ts` (Int) |
| `POST`| `/api/v1/technicians` | `ADMIN`, `STAFF` | `{ name, phone, email?, skills?, serviceAreas?, maxDailyJobs? }` | `{ success: true, data: Technician }` | `technicianController.create` | `technicians`, `activity_logs` | Generates `TECH-XXXX` | `technician.service.test.ts` |
| `PATCH`| `/api/v1/technicians/:id` | `ADMIN`, `STAFF` | `{ name?, phone?, email?, skills?, serviceAreas?, isAvailable?, maxDailyJobs? }` | `{ success: true, data: Technician }` | `technicianController.update` | `technicians`, `activity_logs` | Updates resource profile | `technician.service.test.ts` |
| `DELETE`| `/api/v1/technicians/:id`| `ADMIN` | Params: `{ id: UUID }` | `{ success: true, message: string }` | `technicianController.deactivate` | `technicians` (`is_active=false`) | Soft deactivates resource | `technician.service.test.ts` |

---

## 7. AMC Contracts, Quotations & PM Generation Matrix

| Method | Endpoint | Role | Request Schema | Response Schema | Backend Handler | DB Tables Mutated | Side Effects | Test Coverage |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/amc-contracts` | `ADMIN`, `STAFF` | Query: `{ customerId?, status?, search?, limit?, offset? }` | `{ success: true, data: AmcContract[], total }` | `amcController.list` | None | Joins customer, plan, covered assets | `amc.test.ts` (Int) |
| `GET` | `/api/v1/amc-contracts/:id` | `ADMIN`, `STAFF` | Params: `{ id: UUID }` | `{ success: true, data: AmcContractDetail }` | `amcController.getById` | None | Loads PM schedules & asset coverage | `amc.test.ts` (Int) |
| `POST`| `/api/v1/amc-contracts` | `ADMIN`, `STAFF` | `{ customerId, planId, siteId, startDate, endDate, totalAmount, coveredAssetIds: UUID[], frequency?, dryServiceVisits?, jetServiceVisits?, pumpdownServiceVisits? }` | `{ success: true, data: AmcContract }` | `amcController.create` | `amc_contracts`, `amc_assets`, `activity_logs` | Generates `AMC-XXXXXX`. If `ACTIVE`, generates PM obligations | `amc.service.test.ts` |
| `PATCH`| `/api/v1/amc-contracts/:id`| `ADMIN`, `STAFF` | `{ startDate?, endDate?, totalAmount?, frequency?, dryServiceVisits?, jetServiceVisits?, pumpdownServiceVisits? }` | `{ success: true, data: AmcContract }` | `amcController.update` | `amc_contracts`, `activity_logs` | Reconciles allocation breakdown | `amcAllocationPlanner.test.ts` |
| `PATCH`| `/api/v1/amc-contracts/:id/status`| `ADMIN`, `STAFF` | `{ status: 'DRAFT' \| 'ACTIVE' \| 'EXPIRED' \| 'CANCELLED', reason? }` | `{ success: true, data: AmcContract }` | `amcController.updateStatus` | `amc_contracts`, `service_schedules`, `activity_logs` | On `ACTIVE`: triggers idempotent PM generator | `amc.test.ts` (Int) |
| `POST`| `/api/v1/amc-contracts/:id/renew` | `ADMIN`, `STAFF` | `{ startDate, endDate, totalAmount, coveredAssetIds?, dryServiceVisits?, jetServiceVisits?, pumpdownServiceVisits? }` | `{ success: true, data: AmcContract }` | `amcController.renew` | `amc_contracts`, `amc_assets`, `service_schedules`, `activity_logs` | Creates successor contract, cancels unfulfilled predecessor schedules, generates successor PMs | `amc.service.test.ts` |

---

## 8. Service Scheduling & Assignments Matrix

| Method | Endpoint | Role | Request Schema | Response Schema | Backend Handler | DB Tables Mutated | Side Effects | Test Coverage |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/service-schedules` | `ADMIN`, `STAFF` | Query: `{ dateFrom?, dateTo?, technicianId?, customerId?, status? }` | `{ success: true, data: ServiceSchedule[] }` | `scheduleController.list` | None | Joins customer, site, asset, technician | `schedule.test.ts` (Int) |
| `GET` | `/api/v1/service-schedules/:id` | `ADMIN`, `STAFF` | Params: `{ id: UUID }` | `{ success: true, data: ServiceScheduleDetail }` | `scheduleController.getById` | None | Detailed visit view | `schedule.test.ts` (Int) |
| `POST`| `/api/v1/service-schedules` | `ADMIN`, `STAFF` | `{ customerId, siteId, assetId?, scheduledDate, startTime?, endTime?, technicianId?, assistantName?, notes? }` | `{ success: true, data: ServiceSchedule }` | `scheduleController.create` | `service_schedules`, `activity_logs` | Generates `SCH-XXXXXX` | `schedule.test.ts` (Int) |
| `POST`| `/api/v1/service-schedules/:id/assign` | `ADMIN`, `STAFF` | `{ technicianId: UUID, assistantName?: string }` | `{ success: true, data: ServiceSchedule }` | `scheduleController.assign` | `service_schedules`, `activity_logs` | Sets technician & assistant | `schedule.test.ts` (Int) |
| `POST`| `/api/v1/service-schedules/:id/reschedule`| `ADMIN`, `STAFF` | `{ newDate, startTime?, endTime?, reason }` | `{ success: true, data: ServiceSchedule }` | `scheduleController.reschedule` | `service_schedules`, `activity_logs` | Records reschedule history | `schedule.test.ts` (Int) |
| `POST`| `/api/v1/service-schedules/:id/cancel` | `ADMIN`, `STAFF` | `{ reason: string }` | `{ success: true, data: ServiceSchedule }` | `scheduleController.cancel` | `service_schedules`, `activity_logs` | Cancels visit | `schedule.test.ts` (Int) |

---

## 9. Service Visit Reports & Issue Resolution Matrix

| Method | Endpoint | Role | Request Schema | Response Schema | Backend Handler | DB Tables Mutated | Side Effects | Test Coverage |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/service-reports` | `ADMIN`, `STAFF` | Query: `{ customerId?, technicianId?, status?, limit?, offset? }` | `{ success: true, data: ServiceReport[], total }` | `reportController.list` | None | Joins customer, schedule, technician | `serviceReport.test.ts` (Int) |
| `GET` | `/api/v1/service-reports/:id` | `ADMIN`, `STAFF` | Params: `{ id: UUID }` | `{ success: true, data: ServiceReportDetail }` | `reportController.getById` | None | Loads snapshot assets, items, parts | `serviceReport.test.ts` (Int) |
| `POST`| `/api/v1/service-reports` | `ADMIN`, `STAFF` | `{ serviceScheduleId, technicianId, assistantName?, serviceDate, workDescription?, observations?, actionTaken?, recommendation?, customerFeedback?, primaryOutcome, assetSnapshots: [], items: [], partsUsed: [] }` | `{ success: true, data: ServiceReport }` | `reportController.create` | `service_reports`, `service_report_assets`, `service_report_items`, `service_schedules`, `activity_logs` | Marks schedule `COMPLETED`. Enqueues async customer email | `serviceReport.service.test.ts` |
| `PATCH`| `/api/v1/service-reports/:id`| `ADMIN`, `STAFF` | `{ workDescription?, observations?, actionTaken?, recommendation?, technicianRemarks? }` | `{ success: true, data: ServiceReport }` | `reportController.update` | `service_reports`, `activity_logs` | Updates editable remarks | `serviceReport.service.test.ts` |
| `POST`| `/api/v1/service-reports/:id/resolve`| `ADMIN`, `STAFF` | `{ resolvingReportId: UUID, resolvedNotes: string }` | `{ success: true, data: ServiceReport }` | `reportController.resolveIssue` | `service_reports`, `activity_logs` | Resolves prior follow-up ticket | `serviceResolution.test.ts` |

---

## 10. Data Contract Inconsistencies & Flags

> [!WARNING]
> **Identified Discrepancies between Frontend, Backend, and Database:**
> 
> 1. **Warranty Services Schema Drift (Batch 2 Code Complete, Pending Production Migration):**
>    - Frontend & Backend: Require `total_warranty_services`, `dry_warranty_visits`, `jet_warranty_visits`, `pumpdown_warranty_visits`. In Batch 2, frontend input parsing (`parseWarrantyCount`), in-form reconciliation feedback, backend defensive validation, and full payload serialization were completed and verified with automated test suites (`technologyAndAssetRegistration.test.tsx` and `assetPersistence.test.ts`).
>    - Migration: `20261014000000_ac_asset_warranty_services.sql` inspected, and non-negative constraints along with allocation check invariant (`total = dry + jet + pumpdown`) were validated against the PostgreSQL 17 engine via an isolated transactional rollback execution.
>    - Live DB: Columns do not yet exist on `public.ac_assets` on production (`jvccvdxfilzlncbgiplk`) due to production hold restriction. Queued in Production Migration Plan. Outstanding blocker until schema deployment is approved.
> 
> 2. **Assistant Name Schema & Validator Alignment (Batch 1 Complete, Pending Production Migration):**
>    - Migration: `20261014010000_service_schedule_and_report_assistant_name.sql` authored with additive `assistant_name TEXT NULL` on `public.service_schedules` and `public.service_reports`, tested via transactional rollback on PostgreSQL 17 engine.
>    - Backend & Frontend: `ServiceSchedule` and `ServiceReport` interfaces, types, validators (`schedule.validator.ts`, `serviceReport.validator.ts`), and services updated and verified with automated regression tests (`assistantNameValidation.test.ts`).
>    - Live DB: Queued in Production Migration Plan.
> 
> 3. **Technician Phone Exposure:**
>    - Backend includes `technician.phone` in `getReportById` response; frontend `ServiceReportsManagement.tsx` displayed this to users. Must be removed from customer-facing views (Batch 3).
> 
> 4. **Missing Customer Email in Report Payload:**
>    - `serviceReport.service.ts` query selects `customers (id, name, customer_code, phone)` but omits `email`, making auto-email impossible without an extra lookup (Batch 5).
> 
> 5. **AMC Contract Draft-to-Active Transition:**
>    - `updateStatus` in `amc.service.ts` updates status to `ACTIVE` but does NOT invoke `generatePmObligations`, leaving draft quotations with 0 PM visits upon activation (Batch 4).
