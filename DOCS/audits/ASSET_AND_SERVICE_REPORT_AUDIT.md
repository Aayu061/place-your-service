# Phase 1: Read-Only Audit & Data-Flow Analysis Report
## Asset Specification & Professional Service Report Integrity

**Place Your Service (PYS) Platform**  
**Repository:** `https://github.com/Aayu061/place-your-service.git`  
**Branch:** `main`  
**Date:** 10 October 2026  
**Execution Mode:** STRICT READ-ONLY AUDIT  
**Status:** Audit Complete — Ready for Sequential Phase 2, 3 & 4 Implementation

---

## 1. Executive Summary

An exhaustive, end-to-end data-flow audit was conducted across the PostgreSQL database (Supabase project `jvccvdxfilzlncbgiplk`), Express/TypeScript backend services, and React/TypeScript frontend application.

The primary objective was to investigate:
1. Why Indoor Unit (IDU) and Outdoor Unit (ODU) serial numbers and relevant asset specifications were perceived as missing or inadequately presented in the **Asset Specification** modal and **Edit AC Asset** form.
2. Why IDU/ODU serial numbers, technical specifications, and full location details are completely missing from the customer-facing **Printable Service Report** (`ServiceReportPrintView.tsx`).
3. How historical service report integrity behaves when underlying asset records are updated.

### Key Audit Findings
1. **Asset Register Storage is Sound**:
   - The PostgreSQL table `ac_assets` already contains dedicated columns for `indoor_serial_number`, `outdoor_serial_number`, `serial_number`, `brand`, `model_number`, `technology`, `capacity_tons`, `star_rating`, `refrigerant_type`, `floor_location`, `room_location`, `purchase_date`, `installation_date`, `warranty_start_date`, `warranty_end_date`, `asset_status`, and `asset_condition`.
   - The backend `AssetService.getAssetById` and `listAssets` correctly retrieve and return these fields in `AcAssetResponse`.
2. **Asset Specification UI Hierarchy Weakness**:
   - In `src/pages/CustomerManagement.tsx`, serial numbers were buried in a general, flat grid under an "Asset" card, intermixed with status, condition, and capacity.
   - No dedicated, high-priority **Equipment Identification** section existed.
   - No copy controls were provided for serial numbers.
   - Outdoor serial number displayed `'N/A (Single Unit)'` when null, which misrepresents split systems where the ODU serial was merely not recorded.
   - Purchase and installation dates were placed at the very bottom under Warranty rather than in Installation & Location.
3. **Service Report Data-Flow Disconnect (The Primary Defect)**:
   - **Database**: Table `service_report_assets` only stores inspection outcomes (`fault_reported`, `diagnosis_findings`, `work_performed`, `asset_outcome`, `final_condition`, `refrigerant_added`, `refrigerant_qty_kg`, `notes`). It persists **zero** snapshot equipment identifiers or specifications.
   - **Backend Query Omission**: When `serviceReport.service.ts` (`getReportById`) queries `service_report_assets`, its joined select on `ac_assets` only requests `(id, asset_tag, brand, model_number, room_location)`. It **completely omits** `indoor_serial_number`, `outdoor_serial_number`, `floor_location`, `ac_type`, `technology`, `capacity_tons`, `star_rating`, and `refrigerant_type`.
   - **Backend DTO Omission**: `ServiceReportAssetResponse` in `server/src/types/index.ts` has no fields for serial numbers, equipment specifications, or floor location.
   - **Frontend Type & Template Omission**: `ServiceReportAsset` in `src/domain/types.ts` lacks serial numbers and specifications. `ServiceReportPrintView.tsx` renders a compressed table without columns for IDU/ODU serial numbers, technology, capacity, or refrigerant.
4. **Historical Report Vulnerability Identified**:
   - Because `service_report_assets` does not store snapshot data, existing reports rely on live joins to `ac_assets`. If a technician edits an asset's serial number or location today, already-issued service reports dynamically change their displayed equipment details.
   - **Remedy**: A non-destructive, backward-compatible addition of snapshot columns to `service_report_assets` with an idempotent backfill of existing reports protects historical report immutability.

---

## 2. Actual Schema & Relevant Relationships

### 2.1 Customer AC Assets (`public.ac_assets`)
| Column | Type | Nullable | Description / Default |
| :--- | :--- | :--- | :--- |
| `id` | uuid | NO | PK (`gen_random_uuid()`) |
| `asset_tag` | text | NO | Unique ESSC code (`generate_next_essc_code()`) |
| `site_id` | uuid | NO | FK -> `customer_sites.id` |
| `brand` | text | NO | Brand display string |
| `brand_id` | uuid | YES | FK -> `ac_brands.id` |
| `model_number` | text | YES | Model number string |
| `model_id` | uuid | YES | FK -> `ac_models.id` |
| `variant_id` | uuid | YES | FK -> `ac_model_variants.id` |
| `serial_number` | text | YES | Legacy single serial number |
| `indoor_serial_number` | text | YES | IDU serial number |
| `outdoor_serial_number` | text | YES | ODU serial number |
| `ac_type` | text | NO | e.g., 'Split AC', 'Window AC' |
| `technology` | text | YES | e.g., 'Inverter', 'Non-Inverter' |
| `capacity_tons` | numeric | YES | e.g., 1.5, 1.95 |
| `star_rating` | text | YES | e.g., '3 Star', '5 Star' |
| `refrigerant_type` | text | YES | e.g., 'R32', 'R410A' |
| `floor_location` | text | YES | e.g., 'Ground Floor', '1st Floor' |
| `room_location` | text | YES | e.g., 'Living Room', 'Server Room' |
| `purchase_date` | date | YES | Equipment purchase date |
| `installation_date` | date | YES | Initial commissioning date |
| `warranty_start_date` | date | YES | Warranty commencement date |
| `warranty_end_date` | date | YES | Warranty expiry date |
| `warranty_status` | text | NO | 'UNDER_WARRANTY' (dynamically calculated) |
| `asset_status` | text | NO | 'Active', 'Temporarily Inactive', 'Decommissioned' |
| `asset_condition` | text | NO | 'Good', 'Needs Maintenance', 'Critical' |
| `is_active` | boolean | NO | Active flag (`true`) |
| `notes` | text | YES | Technician/operator notes |
| `created_at` / `updated_at` | timestamptz | NO | Audit timestamps (`now()`) |

*Current Database Inventory*: Exactly 4 assets exist (`ESSC-0001`, `ESSC-0002`, `ESSC-0003`, `ESSC-0004`).

### 2.2 Service Reports Header (`public.service_reports`)
| Column | Type | Nullable | Description / Default |
| :--- | :--- | :--- | :--- |
| `id` | uuid | NO | PK (`gen_random_uuid()`) |
| `report_number` | text | NO | Unique report number (e.g., 'REP-001', '123') |
| `service_request_id` | uuid | YES | FK -> `service_requests.id` |
| `service_schedule_id` | uuid | YES | FK -> `service_schedules.id` |
| `technician_id` | uuid | NO | FK -> `technicians.id` |
| `customer_id` | uuid | YES | FK -> `customers.id` |
| `site_id` | uuid | YES | FK -> `customer_sites.id` |
| `service_date` | date | NO | Attendance date |
| `start_time` / `end_time` | text | YES | Attendance time range |
| `visit_type` | text | NO | 'SERVICE_REQUEST' or 'PREVENTIVE' |
| `primary_outcome` | text | NO | 'COMPLETED', 'PENDING_PARTS', 'PENDING_REPAIRS' |
| `work_description` | text | YES | High-level summary of work performed |
| `technician_remarks` | text | YES | Internal technician remarks |
| `customer_representative` | text | YES | Name of customer representative on site |
| `customer_acknowledgement` | text | YES | Customer feedback / acknowledgement |
| `follow_up_schedule_id` | uuid | YES | FK -> `service_schedules.id` (revisit) |
| `status` | text | NO | 'SUBMITTED', 'DRAFT' |

*Current Database Inventory*: Exactly 3 reports exist (`REP-001`, `123`, `456`).

### 2.3 Service Report Assets (`public.service_report_assets`)
| Column | Type | Nullable | Current State |
| :--- | :--- | :--- | :--- |
| `id` | uuid | NO | PK (`gen_random_uuid()`) |
| `report_id` | uuid | NO | FK -> `service_reports.id` (ON DELETE CASCADE) |
| `asset_id` | uuid | NO | FK -> `ac_assets.id` |
| `fault_reported` | text | YES | Reported problem |
| `diagnosis_findings` | text | YES | Technical diagnosis |
| `work_performed` | text | YES | Exact work completed on this unit |
| `asset_outcome` | text | NO | 'COMPLETED', 'PENDING_PARTS', 'PENDING_REPAIRS' |
| `final_condition` | text | YES | Post-service condition |
| `refrigerant_added` | boolean | NO | Gas charging flag |
| `refrigerant_qty_kg` | numeric | YES | Gas quantity in kg |
| `notes` | text | YES | Asset-specific notes |

*Current Database Inventory*: Exactly 3 rows exist (linking `REP-001` -> `ESSC-0001`, `123` -> `ESSC-0003`, `456` -> `ESSC-0003`).

---

## 3. Field-by-Field Data-Flow Matrix

| Target Field | Database Storage | Backend Retrieval | API DTO Response | Frontend Domain Model | Asset Spec UI | Service Report Data | Printable Report Output | Classification (1-7) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **ESSC Asset Code** | `ac_assets.asset_tag` | `mapAssetRecord` | `AcAssetResponse.assetTag` | `AcAsset.assetTag` | Rendered prominently | `ServiceReportAsset.assetTag` | Rendered in table | **1** (Correctly stored & rendered) |
| **Brand & Model** | `ac_assets.brand`, `model_number` | `mapAssetRecord` | `brand`, `modelNumber` | `brand`, `modelNumber` | Rendered | `brand`, `modelNumber` | Rendered in table | **1** (Correctly stored & rendered) |
| **Indoor Unit Serial (IDU)** | `ac_assets.indoor_serial_number` | `mapAssetRecord` | `indoorSerialNumber` | `AcAsset.indoorSerialNumber` | Rendered (buried in grid) | **Omitted from query & DTO** | **Omitted from print template** | **2, 3** (Stored; omitted in report API & print) |
| **Outdoor Unit Serial (ODU)** | `ac_assets.outdoor_serial_number` | `mapAssetRecord` | `outdoorSerialNumber` | `AcAsset.outdoorSerialNumber` | Rendered (buried in grid) | **Omitted from query & DTO** | **Omitted from print template** | **2, 3** (Stored; omitted in report API & print) |
| **AC Type** | `ac_assets.ac_type` | `mapAssetRecord` | `acType` | `AcAsset.acType` | Rendered | **Omitted from query & DTO** | **Omitted from print template** | **2, 3** (Stored; omitted in report API & print) |
| **Technology** | `ac_assets.technology` | `mapAssetRecord` (normalized) | `technology` | `AcAsset.technology` | Rendered | **Omitted from query & DTO** | **Omitted from print template** | **2, 3** (Stored; omitted in report API & print) |
| **Capacity (Tons)** | `ac_assets.capacity_tons` | `mapAssetRecord` | `capacityTons` | `AcAsset.capacityTons` | Rendered | **Omitted from query & DTO** | **Omitted from print template** | **2, 3** (Stored; omitted in report API & print) |
| **Energy Rating** | `ac_assets.star_rating` | `mapAssetRecord` | `starRating` | `AcAsset.starRating` | Rendered | **Omitted from query & DTO** | **Omitted from print template** | **2, 3** (Stored; omitted in report API & print) |
| **Refrigerant Gas** | `ac_assets.refrigerant_type` | `mapAssetRecord` | `refrigerantType` | `AcAsset.refrigerantType` | Rendered | **Omitted from query & DTO** | **Omitted from print template** | **2, 3** (Stored; omitted in report API & print) |
| **Floor Location** | `ac_assets.floor_location` | `mapAssetRecord` | `floorLocation` | `AcAsset.floorLocation` | Rendered | **Omitted from query & DTO** | **Omitted from print template** | **2, 3** (Stored; omitted in report API & print) |
| **Room Location** | `ac_assets.room_location` | `mapAssetRecord` | `roomLocation` | `AcAsset.roomLocation` | Rendered | `ServiceReportAsset.roomLocation` | Rendered in table | **1** (Correctly stored & rendered) |
| **Purchase Date** | `ac_assets.purchase_date` | `mapAssetRecord` | `purchaseDate` | `AcAsset.purchaseDate` | Rendered under warranty | N/A (asset-only) | N/A | **3** (Rendered in sub-optimal location) |
| **Installation Date** | `ac_assets.installation_date` | `mapAssetRecord` | `installationDate` | `AcAsset.installationDate` | Rendered under warranty | N/A (asset-only) | N/A | **3** (Rendered in sub-optimal location) |
| **Warranty Start/End** | `ac_assets.warranty_start_date`, `end_date` | `mapAssetRecord` | `warrantyStartDate`, `warrantyEndDate` | `AcAsset.warrantyStartDate`, `warrantyEndDate` | Rendered | N/A (asset-only) | N/A | **1** (Correctly stored & rendered) |
| **Current AMC** | `amc_contracts`, `amc_assets` | `resolveCurrentAmcForAssets` | `currentAmc` | `AcAsset.currentAmc` | Rendered with progress | Joined via `service_reports.amc_id` | Rendered in report header | **1** (Correctly stored & rendered) |

---

## 4. Root Causes of Verified Issues

### Root Cause 1: Asset Specification UI Hierarchy & Serial Presentation
- **Problem**: Serial numbers were not visually prominent, had no copy controls, were placed in an undifferentiated 7-item grid, and showed a misleading `'N/A (Single Unit)'` fallback for empty outdoor serials.
- **Verification**: In `src/pages/CustomerManagement.tsx:3805-3815`:
  ```tsx
  <div>
    <div style={{ color: 'var(--text-muted)' }}>Indoor Serial Number</div>
    <div style={{ fontWeight: 600, marginTop: '2px' }}>
      {viewingAsset.indoorSerialNumber || viewingAsset.serialNumber || 'N/A'}
    </div>
  </div>
  <div>
    <div style={{ color: 'var(--text-muted)' }}>Outdoor Serial Number</div>
    <div style={{ fontWeight: 600, marginTop: '2px' }}>
      {viewingAsset.outdoorSerialNumber || 'N/A (Single Unit)'}
    </div>
  </div>
  ```
- **Correction**: Reorganize into structured sections:
  - **A. Asset Identity**: ESSC tag, Brand/Model, Status, Condition, Warranty Status, Current AMC Status.
  - **B. Equipment Identification (Highest Priority)**: Prominent cards for Brand, Model Number, IDU Serial Number, and ODU Serial Number with clear labelling, copy-to-clipboard buttons, and `'Not recorded'` empty state.
  - **C. Technical Specifications**: AC Type, Technology, Capacity, Rating, Refrigerant, Condition.
  - **D. Installation & Location**: Customer, Site, Address, Floor, Room, Purchase Date, Installation Date.
  - **E. Warranty**: Coverage dates, status, purchase & installation context.
  - **F. Current AMC**: Preserved contract details and visit progress.

### Root Cause 2: Service Report Query Omission in Backend
- **Problem**: The backend service `serviceReport.service.ts` only requested `(id, asset_tag, brand, model_number, room_location)` from `ac_assets`.
- **Verification**: In `server/src/services/serviceReport.service.ts:360`:
  ```typescript
  ac_assets (id, asset_tag, brand, model_number, room_location)
  ```
- **Correction**: Enhance the backend query to retrieve `indoor_serial_number`, `outdoor_serial_number`, `serial_number`, `floor_location`, `ac_type`, `technology`, `capacity_tons`, `star_rating`, and `refrigerant_type`.

### Root Cause 3: Service Report DTO and Domain Model Truncation
- **Problem**: Both `ServiceReportAssetResponse` (`server/src/types/index.ts:1134`) and `ServiceReportAsset` (`src/domain/types.ts:758`) lacked serial numbers and equipment specifications.
- **Correction**: Add optional fields to both backend and frontend interfaces:
  `indoorSerialNumber`, `outdoorSerialNumber`, `serialNumber`, `floorLocation`, `acType`, `technology`, `capacityTons`, `starRating`, `refrigerantType`.

### Root Cause 4: Printable Service Report Template Incomplete
- **Problem**: `ServiceReportPrintView.tsx:354-410` rendered a simple 6-column table (`Asset Tag`, `Brand / Model`, `Location`, `Findings / Work Performed`, `Outcome`, `Condition`) without serial numbers or technical specifications. On multi-asset reports or printed PDFs, equipment identification was impossible to verify.
- **Correction**: Upgrade the `AC Assets & Inspection Findings` section in `ServiceReportPrintView.tsx` to display complete equipment identification (ESSC code, brand/model, IDU/ODU serial numbers, location, technical specs) paired with inspection findings, using a structured card layout that avoids table column squishing and preserves clean pagination and print stylesheets.

### Root Cause 5: Lack of Snapshot Immutability for Historical Reports
- **Problem**: `service_report_assets` only joined `ac_assets` dynamically. If an asset is updated today, past completed reports reflect the new values.
- **Correction**:
  1. Add nullable snapshot columns to `service_report_assets`.
  2. Perform an idempotent backfill for the existing 3 report asset records from `ac_assets`.
  3. On report creation and update, persist the snapshot data into `service_report_assets`.
  4. In `getReportById`, read snapshot fields first and fall back to the dynamic join if snapshot fields are null.

---

## 5. Historical Report Integrity & Migration Assessment

### Snapshot Strategy Decision
- **Why It Is Safe**:
  - Adding nullable columns to `service_report_assets` has **zero impact** on existing queries, triggers, or foreign keys.
  - Backfilling the 3 existing rows (`REP-001`, `123`, `456`) uses the exact data currently associated with those assets, freezing their state without fabricating or guessing values.
  - The fallback mechanism (`sra.indoor_serial_number || ac_assets.indoor_serial_number`) guarantees complete backward compatibility even if any future code path leaves a snapshot column null.
- **Database Schema Changes**:
  ```sql
  ALTER TABLE public.service_report_assets
    ADD COLUMN IF NOT EXISTS asset_tag text,
    ADD COLUMN IF NOT EXISTS brand text,
    ADD COLUMN IF NOT EXISTS model_number text,
    ADD COLUMN IF NOT EXISTS indoor_serial_number text,
    ADD COLUMN IF NOT EXISTS outdoor_serial_number text,
    ADD COLUMN IF NOT EXISTS serial_number text,
    ADD COLUMN IF NOT EXISTS ac_type text,
    ADD COLUMN IF NOT EXISTS technology text,
    ADD COLUMN IF NOT EXISTS capacity_tons numeric,
    ADD COLUMN IF NOT EXISTS star_rating text,
    ADD COLUMN IF NOT EXISTS refrigerant_type text,
    ADD COLUMN IF NOT EXISTS floor_location text,
    ADD COLUMN IF NOT EXISTS room_location text;
  ```
- **Idempotent Historical Backfill**:
  ```sql
  UPDATE public.service_report_assets sra
  SET 
    asset_tag = a.asset_tag,
    brand = a.brand,
    model_number = a.model_number,
    indoor_serial_number = a.indoor_serial_number,
    outdoor_serial_number = a.outdoor_serial_number,
    serial_number = a.serial_number,
    ac_type = a.ac_type,
    technology = a.technology,
    capacity_tons = a.capacity_tons,
    star_rating = a.star_rating,
    refrigerant_type = a.refrigerant_type,
    floor_location = a.floor_location,
    room_location = COALESCE(sra.room_location, a.room_location)
  FROM public.ac_assets a
  WHERE sra.asset_id = a.id
    AND sra.asset_tag IS NULL;
  ```
- **Rollback Plan**:
  The columns can be dropped if ever necessary via `ALTER TABLE public.service_report_assets DROP COLUMN ...`, though this is not required as the columns are completely non-breaking.

---

## 6. Implementation Scope & Files Expected to Change

### Database
- Execute safe, idempotent DDL and backfill via Supabase SQL (`service_report_assets` snapshot columns).

### Backend
1. [`server/src/types/index.ts`](file:///c:/Users/aayup/Desktop/PYS/server/src/types/index.ts):
   - Update `ServiceReportAssetResponse` to include serial numbers, specifications, and floor location.
   - Update `ServiceReportAssetInput` to optionally accept snapshot overrides.
2. [`server/src/services/serviceReport.service.ts`](file:///c:/Users/aayup/Desktop/PYS/server/src/services/serviceReport.service.ts):
   - In `createReport`: Snapshot asset fields into `service_report_assets` from `ac_assets`.
   - In `updateReport`: Preserve or snapshot asset fields.
   - In `getReportById`: Fetch snapshot columns from `service_report_assets` and fallback to `ac_assets`. Map all fields into `ServiceReportAssetResponse`.

### Frontend
1. [`src/domain/types.ts`](file:///c:/Users/aayup/Desktop/PYS/src/domain/types.ts):
   - Update `ServiceReportAsset` interface with `indoorSerialNumber`, `outdoorSerialNumber`, `serialNumber`, `floorLocation`, `acType`, `technology`, `capacityTons`, `starRating`, `refrigerantType`.
2. [`src/pages/CustomerManagement.tsx`](file:///c:/Users/aayup/Desktop/PYS/src/pages/CustomerManagement.tsx):
   - Upgrade **Asset Specifications Modal**:
     - Implement Sections A through F per Section 4.1.
     - Add prominent **Equipment Identification** section with separate IDU and ODU cards.
     - Add copy-to-clipboard buttons for IDU/ODU serial numbers.
     - Handle empty state with `'Not recorded'`.
     - Move purchase/installation dates to Installation & Location.
   - Improve **Edit AC Asset Form**:
     - Ensure serial numbers trim whitespace safely on submit without rejecting valid manufacturer characters.
     - Ensure all fields remain editable and non-destructive.
3. [`src/components/serviceReports/ServiceReportPrintView.tsx`](file:///c:/Users/aayup/Desktop/PYS/src/components/serviceReports/ServiceReportPrintView.tsx):
   - Redesign `AC Assets & Inspection Findings` section into structured, print-friendly asset cards.
   - Prominently display ESSC code, Brand, Model, IDU Serial Number, ODU Serial Number, Location, AC Type, Technology, Capacity, Star Rating, and Refrigerant Gas.
   - Preserve clean multi-asset support, print CSS, page-break handling, and signature boxes.
4. [`src/pages/ServiceReportsManagement.tsx`](file:///c:/Users/aayup/Desktop/PYS/src/pages/ServiceReportsManagement.tsx):
   - Enhance the detail drawer's asset findings card to display IDU/ODU serial numbers and technical specs.

### Tests
1. [`server/tests/serviceReportRoutes.test.ts`](file:///c:/Users/aayup/Desktop/PYS/server/tests/serviceReportRoutes.test.ts):
   - Verify report creation persists asset snapshots.
   - Verify `getReportById` returns IDU/ODU serial numbers and technical specifications.
2. [`src/tests/serviceReports.test.tsx`](file:///c:/Users/aayup/Desktop/PYS/src/tests/serviceReports.test.tsx):
   - Verify `ServiceReportPrintView` renders IDU/ODU serial numbers and specifications.
   - Verify multi-asset reports display distinct per-asset identifiers.
3. [`src/tests/technologyAndAssetRegistration.test.tsx`](file:///c:/Users/aayup/Desktop/PYS/src/tests/technologyAndAssetRegistration.test.tsx) & new test suite:
   - Verify Asset Specification modal sections, copy controls, and Edit AC Asset persistence.

---

## 7. Quality & Safety Verification Plan

| Phase / Gate | Verification Criterion | Status |
| :--- | :--- | :--- |
| **Phase 1 Audit** | Zero destructive changes, all root causes documented | **COMPLETED** |
| **Database Migration** | Idempotent schema enhancement; zero master data altered | Scheduled Phase 2/3 |
| **Asset Specification** | IDU & ODU prominently visible, copy controls functional | Scheduled Phase 2 |
| **Edit AC Asset** | IDU/ODU save & reload reliably without overwriting specs | Scheduled Phase 2 |
| **Service Report API** | Returns IDU/ODU serial numbers and specifications | Scheduled Phase 3 |
| **Printable Report** | Professional PDF/print view with full equipment traceability | Scheduled Phase 3 |
| **Frontend Quality** | `npm run typecheck`, `npm run lint`, `npm run build` | Scheduled Phase 4 |
| **Backend Quality** | `npm run typecheck`, `npm run lint`, `npm run build` | Scheduled Phase 4 |
| **Regression Tests** | 100% test pass rate across both frontend and backend | Scheduled Phase 4 |
| **GitHub Delivery** | Clean working tree, committed, pushed to `origin/main` | Scheduled Phase 4 |

---

*Phase 1 Audit is hereby concluded with zero ambiguity. Proceeding immediately to Phase 2 implementation.*
