# Place Your Service — Backend API Specification (v1)

## 1. Overview & Locked Architecture

The Place Your Service (PYS) backend is a production-ready Node.js + TypeScript + Express REST API designed for deployment on **Render**, communicating with **Supabase PostgreSQL** and consumed by the React/Vite frontend hosted on **Vercel**.

```text
                    PLACE YOUR SERVICE
                           │
                    ┌──────┴──────┐
                    │             │
                 VERCEL         RENDER
                FRONTEND      BACKEND API
             (React / Vite)  (Node / Express)
                    │             │
                    └──────┬──────┘
                           │
                        SUPABASE
                           │
                ┌──────────┴──────────┐
                │                     │
             PostgreSQL            Storage
```

---

## 2. API Versioning

All API routes are strictly versioned under `/api/v1`.

Base URL:
- Local Development: `http://localhost:5000/api/v1`
- Production (Render): `https://<service-name>.onrender.com/api/v1`

---

## 3. Standard Response Contracts

### 3.1 Success Response (`2xx`)

```json
{
  "success": true,
  "data": { ... },
  "meta": {
    "page": 1,
    "pageSize": 20,
    "total": 100
  }
}
```

### 3.2 Error Response (`4xx` / `5xx`)

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": [
      {
        "field": "email",
        "message": "Invalid email address format"
      }
    ]
  }
}
```

Standard error codes:
- `400`: `BAD_REQUEST`
- `401`: `UNAUTHORIZED` (Missing, malformed, or expired token)
- `403`: `FORBIDDEN` (Insufficient role permissions, inactive account)
- `404`: `NOT_FOUND`
- `409`: `CONFLICT`
- `422`: `VALIDATION_ERROR` (Request body/query/params validation failure)
- `429`: `RATE_LIMIT_EXCEEDED`
- `500`: `INTERNAL_SERVER_ERROR` (Internal errors sanitized in production)

---

## 4. Endpoints (Phase 2 Foundation)

### 4.1 Liveness Health Check

Verifies that the Express API process is alive and accepting HTTP traffic.

- **Method:** `GET`
- **Route:** `/api/v1/health`
- **Access:** Public
- **Headers:** None required
- **Success Status:** `200 OK`

#### Example Response:
```json
{
  "success": true,
  "data": {
    "service": "place-your-service-api",
    "status": "healthy",
    "version": "0.1.0",
    "timestamp": "2026-10-07T00:00:00.000Z",
    "uptimeSeconds": 342,
    "environment": "development"
  }
}
```

---

### 4.2 Readiness Health Check

Verifies that backing dependencies (Supabase PostgreSQL database) are reachable and healthy.

- **Method:** `GET`
- **Route:** `/api/v1/health/ready`
- **Access:** Public
- **Success Status:** `200 OK` (when database is reachable)
- **Degraded Status:** `503 Service Unavailable` (when database check fails)

#### Example Success Response:
```json
{
  "success": true,
  "data": {
    "service": "place-your-service-api",
    "status": "healthy",
    "version": "0.1.0",
    "timestamp": "2026-10-07T00:00:00.000Z",
    "uptimeSeconds": 342,
    "environment": "production",
    "database": {
      "connected": true,
      "latencyMs": 14
    }
  }
}
```

#### Example Failure Response (503):
```json
{
  "success": true,
  "data": {
    "service": "place-your-service-api",
    "status": "unhealthy",
    "version": "0.1.0",
    "timestamp": "2026-10-07T00:00:00.000Z",
    "uptimeSeconds": 342,
    "environment": "production",
    "database": {
      "connected": false,
      "latencyMs": 250,
      "error": "Database connection check failed"
    }
  }
}
```

---

## 5. Authentication & Authorization Foundation

### 5.1 Token Extraction & Verification

All protected endpoints require an HTTP header:
```http
Authorization: Bearer <supabase-jwt-token>
```

The server-side middleware `requireAuth`:
1. Extracts the Bearer token from the `Authorization` header.
2. Validates the JWT cryptographically via Supabase Auth.
3. Resolves the user's `profiles` record.
4. Resolves the user's `staff` record to verify role (`ADMIN` or `STAFF`) and active status (`is_active = true`).
5. Populates `req.user` with trusted, server-derived context:
   ```typescript
   req.user = {
     userId: string;
     email: string;
     role: 'ADMIN' | 'STAFF';
     profileId: string;
     staffId: string;
     isActive: boolean;
   };
   ```

### 5.2 Role Enforcement

Protected endpoints use `requireRole('ADMIN')` or `requireRole('ADMIN', 'STAFF')`.
Roles sent from the client or request body are NEVER trusted.

### 5.3 Admin Singleton Rule

By business rule and database constraint (`idx_staff_singleton_admin`), exactly ONE active record with `role = 'ADMIN'` can exist in the system.

---

## 6. Environment Configuration

| Variable | Description | Example / Default |
| :--- | :--- | :--- |
| `PORT` | HTTP port for server binding | `5000` (Local) / `10000` (Render) |
| `NODE_ENV` | Runtime environment | `development` / `production` / `test` |
| `CORS_ORIGIN` | Allowed frontend origin(s) | `http://localhost:5173` / `https://pys.vercel.app` |
| `SUPABASE_URL` | Supabase project URL | `https://your-project.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Privileged service key (SERVER ONLY) | `your-service-role-key` |
| `RATE_LIMIT_WINDOW_MS` | Rate limiting sliding window | `900000` (15 min) |
| `RATE_LIMIT_MAX` | Max requests per IP in window | `100` |

---

## 7. Endpoint Organization Status

- `/api/v1/auth` (Phase 3: Admin & Staff Authentication — IMPLEMENTED)
- `/api/v1/staff` (Phase 3: Staff Management — IMPLEMENTED)
- `/api/v1/customers` (Phase 4: Customer Management — IMPLEMENTED)
- `/api/v1/customers/:customerId/sites`, `/api/v1/assets` (Phase 5: Site + AC Asset Management — IMPLEMENTED)
- `/api/v1/service-requests` (Phase 6: Service Request Management — IMPLEMENTED)
- `/api/v1/technicians` (Phase 7: Technician Management & Recommendation — UPCOMING)
- `/api/v1/amc` (Phase 8: AMC Contracts & Generation — UPCOMING)
- `/api/v1/inventory` (Phase 9: Parts & Inventory Ledger — UPCOMING)
- `/api/v1/payments` (Phase 10: Payments & Financial Records — UPCOMING)
- `/api/v1/notifications` (Phase 13: Operational Notifications — UPCOMING)
- `/api/v1/activity-logs` (Phase 13: Activity & Audit Logs — UPCOMING)

---

## 8. Customer Management API (Phase 4)

All Customer endpoints require a valid Supabase JWT and role check:
`requireAuth` + `requireRole('ADMIN', 'STAFF')`.

Customers are domain data entities, NOT application login users.

### 8.1 List Customers
- **Method:** `GET`
- **Route:** `/api/v1/customers`
- **Query Parameters:**
  - `page` (number, default: 1)
  - `pageSize` (number, default: 20, max: 100)
  - `search` (string, optional: searches name, company, phone, email, customer_code)
  - `customerType` (`TEMPORARY` | `PERMANENT`, optional)
  - `isActive` (boolean, optional)
- **Response:**
  ```json
  {
    "success": true,
    "data": {
      "customers": [ ... ],
      "total": 42,
      "page": 1,
      "pageSize": 20,
      "totalPages": 3
    }
  }
  ```

### 8.2 Get Customer by ID
- **Method:** `GET`
- **Route:** `/api/v1/customers/:id`
- **Params:** `id` (UUID)
- **Response:**
  ```json
  {
    "success": true,
    "data": {
      "id": "uuid",
      "customerCode": "CUST-100201",
      "name": "Metropolitan Hospital",
      "companyName": "Metro Health Ltd",
      "customerType": "TEMPORARY",
      "phone": "9876543210",
      "alternatePhone": "9876543211",
      "email": "facility@metro.example",
      "address": "Sector 5, Salt Lake",
      "city": "Kolkata",
      "state": "West Bengal",
      "postalCode": "700091",
      "notes": "24x7 emergency backup critical",
      "isActive": true,
      "createdAt": "2026-10-01T10:00:00.000Z",
      "updatedAt": "2026-10-01T10:00:00.000Z",
      "sites": [ ... ]
    }
  }
  ```

### 8.3 Create Customer
- **Method:** `POST`
- **Route:** `/api/v1/customers`
- **Request Body:**
  ```json
  {
    "name": "Metropolitan Hospital",
    "companyName": "Metro Health Ltd",
    "customerType": "TEMPORARY",
    "phone": "9876543210",
    "alternatePhone": "9876543211",
    "email": "facility@metro.example",
    "address": "Sector 5, Salt Lake",
    "city": "Kolkata",
    "state": "West Bengal",
    "postalCode": "700091",
    "siteName": "Main Hospital Building",
    "siteContactPerson": "Dr. Sen",
    "siteContactPhone": "9876543210",
    "notes": "24x7 emergency backup critical"
  }
  ```
- **Response:** `201 Created` with created customer entity.
- **Duplicate Protection:** Returns `409 Conflict` if phone or email matches an existing customer.

### 8.4 Update Customer
- **Method:** `PATCH`
- **Route:** `/api/v1/customers/:id`
- **Request Body:** Partial update fields (`name`, `companyName`, `phone`, `email`, `address`, `city`, `state`, `postalCode`, `notes`).
- **Response:** `200 OK` with updated customer entity.

### 8.5 Update Customer Status
- **Method:** `PATCH`
- **Route:** `/api/v1/customers/:id/status`
- **Request Body:**
  ```json
  {
    "isActive": false
  }
  ```
- **Response:** `200 OK` with updated customer entity. Preserves referential integrity by avoiding destructive hard deletion.

### 8.6 Convert Customer to PERMANENT
- **Method:** `POST`
- **Route:** `/api/v1/customers/:id/convert-to-permanent`
- **Params:** `id` (UUID)
- **Response:** `200 OK` with converted customer entity (`customerType = 'PERMANENT'`).
- **Invariants:**
  - In-place update preserving customer UUID ID, customer code, operational history, notes, and site relationships.
  - Idempotent: Returns `409 Conflict` with code `ALREADY_PERMANENT` if customer is already PERMANENT.
  - Audits `CUSTOMER_CONVERTED_TO_PERMANENT` in `activity_logs`.

---

## 9. Customer Site Endpoints (Phase 5)

All Site endpoints require `requireAuth` + `requireRole('ADMIN', 'STAFF')`.

### 9.1 List Customer Sites
- **Method:** `GET`
- **Route:** `/api/v1/customers/:customerId/sites`
- **Params:** `customerId` (UUID)
- **Query:** `includeInactive` (boolean, optional)
- **Response:** `200 OK`
  ```json
  {
    "success": true,
    "data": {
      "sites": [
        {
          "id": "site-uuid",
          "customerId": "cust-uuid",
          "siteName": "Head Office",
          "address": "123 Nariman Point",
          "city": "Mumbai",
          "state": "Maharashtra",
          "postalCode": "400021",
          "contactPerson": "R. Sharma",
          "contactPhone": "9876543210",
          "contactEmail": "facility@mumbai.example",
          "isPrimary": true,
          "isActive": true,
          "assetCount": 5,
          "createdAt": "2026-10-01T10:00:00.000Z",
          "updatedAt": "2026-10-01T10:00:00.000Z"
        }
      ],
      "total": 1
    }
  }
  ```

### 9.2 Get Single Site
- **Method:** `GET`
- **Route:** `/api/v1/sites/:id`
- **Params:** `id` (UUID)
- **Response:** `200 OK` with site entity including `assetCount`.

### 9.3 Create Customer Site
- **Method:** `POST`
- **Route:** `/api/v1/customers/:customerId/sites`
- **Request Body:**
  ```json
  {
    "siteName": "Navi Mumbai Branch",
    "address": "Plot 42, Vashi Sector 17",
    "city": "Navi Mumbai",
    "state": "Maharashtra",
    "postalCode": "400703",
    "contactPerson": "A. Patil",
    "contactPhone": "9820123456",
    "contactEmail": "branch@vashi.example",
    "isPrimary": false,
    "notes": "Service gate on north wing"
  }
  ```
- **Response:** `201 Created` with created site entity.
- **Invariants:** If `isPrimary = true`, existing primary sites for this customer are atomically demoted. Audits `SITE_CREATED`.

### 9.4 Update Site
- **Method:** `PATCH`
- **Route:** `/api/v1/sites/:id`
- **Request Body:** Partial update fields (`siteName`, `address`, `city`, `state`, `postalCode`, `contactPerson`, `contactPhone`, `contactEmail`, `isPrimary`, `notes`).
- **Response:** `200 OK` with updated site entity. Audits `SITE_UPDATED`.

### 9.5 Set Primary Site
- **Method:** `POST`
- **Route:** `/api/v1/sites/:id/set-primary`
- **Params:** `id` (UUID)
- **Response:** `200 OK` with updated site entity (`isPrimary = true`).
- **Invariants:**
  - Atomic promotion: demotes any existing primary site for this customer first.
  - Enforced at database level via partial unique index `idx_customer_sites_single_primary`.
  - Audits `SITE_SET_PRIMARY`.

### 9.6 Update Site Status
- **Method:** `PATCH`
- **Route:** `/api/v1/sites/:id/status`
- **Request Body:** `{ "isActive": false }`
- **Response:** `200 OK` with updated site entity.
- **Invariants:** Deactivation is blocked (HTTP 400 `ACTIVE_ASSETS_EXIST`) if the site contains active AC units. Audits `SITE_STATUS_CHANGED`.

---

## 10. AC Asset Endpoints (Phase 5)

All Asset endpoints require `requireAuth` + `requireRole('ADMIN', 'STAFF')`.

### 10.1 List Site AC Assets
- **Method:** `GET`
- **Route:** `/api/v1/sites/:siteId/assets`
- **Params:** `siteId` (UUID)
- **Query:** `acType`, `warrantyStatus`, `search`, `includeInactive`
- **Response:** `200 OK` with `assets` array and `total`.

### 10.2 Get Single AC Asset
- **Method:** `GET`
- **Route:** `/api/v1/assets/:id`
- **Params:** `id` (UUID)
- **Response:** `200 OK` with asset entity and site name.

### 10.3 Create AC Asset
- **Method:** `POST`
- **Route:** `/api/v1/sites/:siteId/assets`
- **Params:** `siteId` (UUID)
- **Request Body:**
  ```json
  {
    "assetTag": "AC-100201",
    "brand": "Daikin",
    "modelNumber": "FTKM50",
    "serialNumber": "DKN-982144",
    "acType": "SPLIT",
    "capacityTons": 1.5,
    "refrigerantType": "R32",
    "installationDate": "2025-01-15",
    "floorLocation": "2nd Floor",
    "roomLocation": "ICU Ward 3",
    "warrantyStatus": "UNDER_WARRANTY",
    "notes": "Outdoor unit mounted on east balcony"
  }
  ```
- **Response:** `201 Created` with created AC asset.
- **Duplicate Protection:** Returns `409 Conflict` if duplicate asset tag or duplicate serial number for brand exists.
- **Invariants:** Resolves customer ID from site. Collision-resistant `assetTag` generated if omitted (`AC-######`). Audits `ASSET_CREATED`.

### 10.4 Update AC Asset
- **Method:** `PATCH`
- **Route:** `/api/v1/assets/:id`
- **Request Body:** Partial update fields (`brand`, `modelNumber`, `serialNumber`, `acType`, `capacityTons`, `refrigerantType`, `installationDate`, `floorLocation`, `roomLocation`, `warrantyStatus`, `notes`).
- **Response:** `200 OK` with updated asset entity. Audits `ASSET_UPDATED`.

### 10.5 Update AC Asset Status
- **Method:** `PATCH`
- **Route:** `/api/v1/assets/:id/status`
- **Request Body:** `{ "isActive": false }`
- **Response:** `200 OK` with updated asset entity. Non-destructive deactivation. Audits `ASSET_STATUS_CHANGED`.

---

## 11. Service Request Endpoints (Phase 6)

All Service Request endpoints require `requireAuth` + `requireRole('ADMIN', 'STAFF')`. Inactive staff accounts are rejected with `403 Forbidden`.

### 11.1 List Service Requests
- **Method:** `GET`
- **Route:** `/api/v1/service-requests`
- **Query Parameters:**
  - `search`: string (searches `request_number`, `description`, `notes`, customer name/phone)
  - `status`: `ALL` | `REQUESTED` | `PENDING` | `SCHEDULED` | `ASSIGNED` | `IN_PROGRESS` | `RESOLVED` | `COMPLETED` | `CANCELLED` | `ON_HOLD` | etc.
  - `priority`: `ALL` | `LOW` | `MEDIUM` | `HIGH` | `URGENT` | `EMERGENCY`
  - `requestType`: `ALL` | `BREAKDOWN` | `GENERAL_SERVICE` | `INSTALLATION` | `INSPECTION` | `REPAIR` | `PREVENTIVE_MAINTENANCE` | `OTHER`
  - `customerId`: UUID (optional)
  - `siteId`: UUID (optional)
  - `assetId`: UUID (optional)
  - `page`: integer (default: 1)
  - `pageSize`: integer (default: 20, max: 100)
- **Response:** `200 OK` with paginated requests array and metadata (`total`, `page`, `pageSize`, `totalPages`).

### 11.2 Get Single Service Request
- **Method:** `GET`
- **Route:** `/api/v1/service-requests/:id`
- **Params:** `id` (UUID)
- **Response:** `200 OK` with full service request entity, joining customer details (`name`, `customerCode`, `phone`), site details (`siteName`, `address`), and AC asset details (`assetTag`, `brand`, `modelNumber`).
- **Error:** `404 Not Found` if request ID does not exist.

### 11.3 Create Service Request
- **Method:** `POST`
- **Route:** `/api/v1/service-requests`
- **Request Body:**
  ```json
  {
    "customerId": "11111111-1111-1111-1111-111111111111",
    "siteId": "22222222-2222-2222-2222-222222222222",
    "assetId": "55555555-5555-5555-5555-555555555555",
    "requestType": "BREAKDOWN",
    "priority": "HIGH",
    "description": "AC unit not cooling in conference room",
    "preferredDate": "2026-10-08",
    "notes": "Urgent cooling required for board meeting"
  }
  ```
- **Relational Integrity Invariants:**
  1. Customer exists, is active (404/400 otherwise).
  2. Site exists, is active, and belongs to Customer (`SITE_CUSTOMER_MISMATCH` 400).
  3. AC Asset (if provided) exists, is active, and belongs to Site (`ASSET_SITE_MISMATCH` 400).
  4. Unique collision-resistant request number generated server-side (`SR-YYYY-XXXXXX`).
  5. Initial status strictly set to `REQUESTED`.
- **Response:** `201 Created` with created service request entity. Audits `SERVICE_REQUEST_CREATED`.

### 11.4 Update Service Request Details
- **Method:** `PATCH`
- **Route:** `/api/v1/service-requests/:id`
- **Params:** `id` (UUID)
- **Request Body:** Partial update fields (`requestType`, `priority`, `description`, `preferredDate`, `notes`, `siteId`, `assetId`).
- **Guards:** Cannot modify requests in terminal state (`CANCELLED` or `CLOSED`) -> 400. Re-validates customer/site/asset integrity if relationships are updated.
- **Response:** `200 OK` with updated service request entity. Audits `SERVICE_REQUEST_UPDATED`.

### 11.5 Transition Status
- **Method:** `POST`
- **Route:** `/api/v1/service-requests/:id/status`
- **Params:** `id` (UUID)
- **Request Body:**
  ```json
  {
    "status": "PENDING",
    "reason": "Staff assigned to review premises"
  }
  ```
- **State Machine Rules:** Strictly enforces `ALLOWED_SERVICE_TRANSITIONS`. Invalid transitions (e.g. `REQUESTED -> COMPLETED`) rejected with `409 Conflict`. Idempotent if already in target state. Terminal states cannot transition.
- **Response:** `200 OK` with updated request entity. Audits `SERVICE_REQUEST_STATUS_CHANGED`.

### 11.6 Cancel Service Request
- **Method:** `POST`
- **Route:** `/api/v1/service-requests/:id/cancel`
- **Params:** `id` (UUID)
- **Request Body:**
  ```json
  {
    "reason": "Customer cancelled request"
  }
  ```
- **Invariants:**
  - Idempotent: if already cancelled, returns current state with 200 without duplicate side effects or audit duplication.
  - Cannot cancel if already `COMPLETED` or `CLOSED` (400).
  - Non-destructive: sets `status = 'CANCELLED'`, records `cancellation_reason`, `cancelled_at`, `cancelled_by`.
- **Response:** `200 OK` with cancelled request entity. Audits `SERVICE_REQUEST_CANCELLED`.

---

## 12. Technician Management API (`/api/v1/technicians`)

All routes require authentication (`requireAuth`) and operational roles (`ADMIN` or `STAFF`). Inactive staff members receive `403 Forbidden`. Technicians themselves are operational resources and **have no login access or authentication endpoints**.

### 12.1 List Technicians
- **Method:** `GET`
- **Route:** `/api/v1/technicians`
- **Query Parameters:**
  - `search`: string (case-insensitive substring match on technician code, name, phone, email, skills, service areas)
  - `status`: `ALL` | `AVAILABLE` | `BUSY` | `ON_LEAVE` | `OFF_DUTY` | `INACTIVE`
  - `skill`: string (optional filter by exact skill)
  - `serviceArea`: string (optional filter by service area)
  - `isActive`: boolean (`true` | `false`)
  - `page`: integer (default: 1)
  - `pageSize`: integer (default: 20, max: 100)
- **Response:** `200 OK` with paginated technician array including derived workload count (`activeAssignmentsCount`) and pagination metadata.

### 12.2 Get Single Technician
- **Method:** `GET`
- **Route:** `/api/v1/technicians/:id`
- **Params:** `id` (UUID)
- **Response:** `200 OK` with full technician profile, skills, service areas, availability schedule, and derived active workload count.
- **Error:** `404 Not Found` if technician ID does not exist.

### 12.3 Create Technician
- **Method:** `POST`
- **Route:** `/api/v1/technicians`
- **Request Body:**
  ```json
  {
    "name": "Rahul Sharma",
    "phone": "+91 98200 12345",
    "email": "rahul.sharma@example.com",
    "skills": ["Split AC", "Cassette AC", "VRF"],
    "serviceAreas": ["Panvel", "Navi Mumbai", "Kharghar"],
    "joinedDate": "2025-06-12",
    "notes": "Senior commercial AC technician",
    "availability": [
      { "day": "Monday", "isActive": true, "startTime": "09:00", "endTime": "18:00" },
      { "day": "Tuesday", "isActive": true, "startTime": "09:00", "endTime": "18:00" },
      { "day": "Wednesday", "isActive": true, "startTime": "09:00", "endTime": "18:00" },
      { "day": "Thursday", "isActive": true, "startTime": "09:00", "endTime": "18:00" },
      { "day": "Friday", "isActive": true, "startTime": "09:00", "endTime": "18:00" },
      { "day": "Saturday", "isActive": false, "startTime": "09:00", "endTime": "18:00" },
      { "day": "Sunday", "isActive": false, "startTime": "09:00", "endTime": "18:00" }
    ]
  }
  ```
- **Invariants:**
  1. Collision-safe `TECH-XXXX` code assigned server-side.
  2. Duplicate check on phone and email (returns 409 Conflict if matching technician exists).
  3. Default operational status is `AVAILABLE` and `isActive` is `true`.
  4. Availability start time must precede end time (`start < end`).
- **Response:** `201 Created` with created technician entity. Audits `TECHNICIAN_CREATED`.

### 12.4 Update Technician
- **Method:** `PATCH`
- **Route:** `/api/v1/technicians/:id`
- **Params:** `id` (UUID)
- **Request Body:** Partial update fields (`name`, `phone`, `email`, `skills`, `serviceAreas`, `joinedDate`, `notes`, `availability`).
- **Invariants:**
  - Duplicate conflict check if phone or email is changed.
  - Strict schedule validation if availability is updated.
- **Response:** `200 OK` with updated technician entity. Audits `TECHNICIAN_UPDATED`, plus `TECHNICIAN_SKILLS_UPDATED` or `TECHNICIAN_SERVICE_AREAS_UPDATED` when relevant.

### 12.5 Update Operational Status
- **Method:** `PATCH`
- **Route:** `/api/v1/technicians/:id/status`
- **Params:** `id` (UUID)
- **Request Body:**
  ```json
  {
    "status": "ON_LEAVE",
    "reason": "Family vacation"
  }
  ```
- **Invariants:**
  - Inactive technician cannot be set to `AVAILABLE` or `BUSY` (returns 400).
- **Response:** `200 OK` with updated technician entity. Audits `TECHNICIAN_STATUS_CHANGED`.

### 12.6 Update Administrative Lifecycle (Activate / Deactivate)
- **Method:** `PATCH`
- **Route:** `/api/v1/technicians/:id/lifecycle`
- **Params:** `id` (UUID)
- **Request Body:**
  ```json
  {
    "isActive": false,
    "reason": "Contract ended"
  }
  ```
- **Invariants:**
  - Deactivation safety check: verifies whether technician has active assignments in `service_assignments`. If active assignments exist, deactivation is blocked and returns `409 Conflict` (`TECHNICIAN_HAS_ACTIVE_ASSIGNMENTS`).
  - When deactivated, operational status is atomically updated to `INACTIVE`.
- **Response:** `200 OK` with updated technician entity. Audits `TECHNICIAN_ACTIVATED` or `TECHNICIAN_DEACTIVATED`.

---

## 13. AMC Contracts & Preventive Maintenance API (`/api/v1/amc-contracts`)

All routes require authentication (`requireAuth`) and operational roles (`ADMIN` or `STAFF`). Inactive staff members receive `403 Forbidden`. Technicians and customers have no access to AMC commercial endpoints.

### 13.1 List AMC Contracts
- **Method:** `GET`
- **Route:** `/api/v1/amc-contracts`
- **Query Parameters:**
  - `search`: string (case-insensitive substring match on contract number, customer name, plan name)
  - `status`: `ALL` | `DRAFT` | `ACTIVE` | `EXPIRING_SOON` | `EXPIRED` | `CANCELLED` | `RENEWED`
  - `frequency`: `ALL` | `MONTHLY` | `QUARTERLY` | `HALF_YEARLY` | `YEARLY`
  - `customerId`: UUID (optional filter by customer)
  - `planId`: UUID (optional filter by plan template)
  - `page`: integer (default: 1)
  - `pageSize`: integer (default: 20, max: 100)
- **Response:** `200 OK` with paginated contracts array, joined customer/plan metadata, covered unit counts, visit completion counts, and pagination metadata (`total`, `page`, `pageSize`, `totalPages`).

### 13.2 AMC Operational Metrics
- **Method:** `GET`
- **Route:** `/api/v1/amc-contracts/metrics`
- **Response:** `200 OK` with real database-calculated metrics:
  ```json
  {
    "success": true,
    "metrics": {
      "totalContracts": 14,
      "activeContracts": 10,
      "expiringSoon": 2,
      "expiredContracts": 2,
      "totalCoveredAssets": 42,
      "pmDueCount": 6,
      "pmOverdueCount": 1
    }
  }
  ```

### 13.3 List Active AMC Plans
- **Method:** `GET`
- **Route:** `/api/v1/amc-contracts/plans`
- **Response:** `200 OK` with active reusable commercial plan templates (`PLAN-BASIC`, `PLAN-COMPREHENSIVE`, `PLAN-SEMI-ANNUAL`, `PLAN-ANNUAL`).

### 13.4 Get Single AMC Contract
- **Method:** `GET`
- **Route:** `/api/v1/amc-contracts/:id`
- **Params:** `id` (UUID)
- **Response:** `200 OK` with contract entity, customer details, plan details, and array of covered AC assets.
- **Error:** `404 Not Found` if contract ID does not exist.

### 13.5 Create AMC Contract
- **Method:** `POST`
- **Route:** `/api/v1/amc-contracts`
- **Request Body:**
  ```json
  {
    "customerId": "11111111-1111-1111-1111-111111111111",
    "planId": "33333333-3333-3333-3333-333333333333",
    "startDate": "2026-01-01",
    "endDate": "2026-12-31",
    "frequency": "QUARTERLY",
    "totalAmount": 24000,
    "totalVisits": 4,
    "coveredAssetIds": ["55555555-5555-5555-5555-555555555555"],
    "notes": "Standard annual corporate contract"
  }
  ```
- **Invariants & Validations:**
  1. Customer must exist and be active (`CUSTOMER_INACTIVE` / `CUSTOMER_NOT_FOUND`).
  2. Plan (if provided) must exist and be active.
  3. Start date must be valid and `startDate < endDate`. Inverted date ranges rejected (`INVALID_CONTRACT_DATES` 400).
  4. Covered assets must belong to the customer through their site hierarchy (`ASSET_CUSTOMER_MISMATCH` 400).
  5. Active contract overlap prevention: Cannot cover an asset with overlapping active contracts (`CONTRACT_OVERLAP` 409).
  6. Server generates collision-safe sequential contract number `AMC-YYYY-XXXX`.
  7. Status set to `ACTIVE` (or `EXPIRING_SOON` if within 30-day window).
- **Response:** `201 Created` with created contract entity. Audits `AMC_CREATED`.

### 13.6 Update AMC Contract Details
- **Method:** `PATCH`
- **Route:** `/api/v1/amc-contracts/:id`
- **Params:** `id` (UUID)
- **Request Body:** Partial update fields (`startDate`, `endDate`, `frequency`, `totalAmount`, `totalVisits`, `notes`).
- **Guards:** Cannot modify cancelled contracts (400). Re-validates `startDate < endDate`.
- **Response:** `200 OK` with updated contract entity. Audits `AMC_UPDATED`.

### 13.7 Transition Contract Status
- **Method:** `PATCH`
- **Route:** `/api/v1/amc-contracts/:id/status`
- **Params:** `id` (UUID)
- **Request Body:** `{ "status": "ACTIVE" | "EXPIRED" | "CANCELLED" | "RENEWED" }`
- **Response:** `200 OK` with updated status. Audits `AMC_STATUS_CHANGED`.

### 13.8 Non-Destructive Cancellation
- **Method:** `POST`
- **Route:** `/api/v1/amc-contracts/:id/cancel`
- **Params:** `id` (UUID)
- **Request Body:** `{ "reason": "Customer premises closure" }`
- **Invariants:**
  - Idempotent: returns 200 if already cancelled.
  - Non-destructive: sets `status = 'CANCELLED'`, records `cancellation_reason`, `cancelled_at`, `cancelled_by`.
  - Future unfulfilled PM schedules are soft-cancelled (`status = 'CANCELLED'`). Completed work preserved.
- **Response:** `200 OK` with cancelled contract entity. Audits `AMC_CANCELLED`.

### 13.9 Historical Renewal
- **Method:** `POST`
- **Route:** `/api/v1/amc-contracts/:id/renew`
- **Params:** `id` (UUID)
- **Request Body:** Renewal payload (`startDate`, `endDate`, `frequency`, `totalAmount`, `totalVisits`, `notes`).
- **Invariants:**
  - Preserves original contract by transitioning it to `RENEWED`.
  - Creates new linked contract with `previous_contract_id` pointing to the prior contract.
  - Copies covered equipment to the new agreement.
- **Response:** `201 Created` with new contract entity. Audits `AMC_RENEWED`.

### 13.10 Generate Preventive Maintenance Obligations
- **Method:** `POST`
- **Route:** `/api/v1/amc-contracts/:id/generate-pm`
- **Params:** `id` (UUID)
- **Invariants:**
  - Contract must be `ACTIVE` (or `EXPIRING_SOON`). Expired or cancelled contracts cannot generate PM (400).
  - Pure date calculation using UTC calendar boundary safety (`calculateScheduleDatesUtc`).
  - Contract Boundary: All generated dates strictly satisfy `scheduledDate >= startDate AND scheduledDate <= endDate`.
  - Idempotent: Repeated invocations do not duplicate schedules; database unique constraint `uq_amc_asset_schedule (amc_id, asset_id, scheduled_date)` prevents duplicates.
- **Response:** `200 OK` with generation report:
  ```json
  {
    "success": true,
    "data": {
      "contractId": "...",
      "contractNumber": "AMC-2026-0001",
      "generatedCount": 4,
      "existingCount": 8,
      "skippedCount": 0,
      "dateRange": { "startDate": "2026-01-01", "endDate": "2026-12-31" },
      "generatedDates": ["2026-01-01", "2026-04-01", "2026-07-01", "2026-10-01"]
    }
  }
  ```
  Audits `AMC_PM_GENERATED`.

### 13.11 Covered Assets Management
- `GET /api/v1/amc-contracts/:id/assets`: Returns all AC assets covered under contract with site/brand metadata.
- `POST /api/v1/amc-contracts/:id/assets`: Adds additional covered assets (`{ "assetIds": [...] }`). Validates customer ownership and overlap. Audits `AMC_ASSET_ADDED`.
- `DELETE /api/v1/amc-contracts/:id/assets/:assetId`: Removes asset coverage. Soft-cancels pending unfulfilled PM obligations for that unit. Audits `AMC_ASSET_REMOVED`.

### 13.12 PM Schedules Inspection
- `GET /api/v1/amc-contracts/:id/schedules`: Returns list of all generated PM obligations with schedule number (`PM-YYYY-XXXXXX`), asset tag, site name, scheduled date, visit number, and status (`PLANNED`, `DUE`, `OVERDUE`, `COMPLETED`, `CANCELLED`).





