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

## 7. Future Endpoint Organization

Subsequent phases will mount dedicated routers onto `/api/v1`:
- `/api/v1/auth` (Phase 3: Admin & Staff Authentication)
- `/api/v1/customers` (Phase 4: Customer & Site Management)
- `/api/v1/assets` (Phase 5: AC Asset Register)
- `/api/v1/technicians` (Phase 6: Technician Management & Recommendation)
- `/api/v1/services` (Phase 7: Service Requests & Schedules)
- `/api/v1/amc` (Phase 8: AMC Contracts & Generation)
- `/api/v1/inventory` (Phase 9: Parts & Inventory Ledger)
- `/api/v1/payments` (Phase 10: Payments & Financial Records)
- `/api/v1/notifications` (Phase 13: Operational Notifications)
- `/api/v1/activity-logs` (Phase 13: Activity & Audit Logs)
