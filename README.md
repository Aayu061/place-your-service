# Place Your Service (PYS)

> Modern, internal AC Service Management Web Platform designed for end-to-end service, asset, AMC, technician, inventory, and payment operations.

---

## 1. Project Overview

**Place Your Service** is a production-oriented internal web platform engineered for an air-conditioning sales and service business. It replaces disconnected spreadsheets and ad-hoc communication with a single, auditable operational workspace.

### Core Principle
**No fake functionality.** Dashboards reflect actual calculated database records, service workflows follow strict state transitions, stock mutations produce immutable transaction logs, and operations run against a real PostgreSQL/Supabase backend.

---

## 2. Locked Deployment Architecture

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

### Architectural Responsibilities

- **VERCEL:** React 19 + TypeScript + Vite frontend. Manages UI, UX, motion system, and API consumption.
- **RENDER:** Node.js + TypeScript + Express backend API. Authoritative business logic, validation, authentication, authorization, service state machine enforcement, and secure database operations.
- **SUPABASE:** PostgreSQL relational database, Row Level Security (RLS), Supabase Storage for attachments/photos, and user identity persistence.
- **GITHUB:** Source control and automated deployment pipelines.

---

## 3. Current Application Scope (Locked)

The application is strictly designed for internal operational management.

### Active Application Roles
1. **Admin**
   - Fixed / singleton administrative account (enforced via database constraint).
   - Complete system visibility and operational control.
   - Creates, configures, and manages Staff members.
2. **Staff**
   - Multiple operational users created and managed by Admin.
   - Manages daily service operations: customers, sites, AC assets, service requests, preventive maintenance schedules, technician assignments, inventory, and payment records.

### Explicitly Excluded from Scope
To maintain focused execution on the core service platform, the following applications are **strictly excluded**:
- ❌ Customer mobile application
- ❌ Customer web portal
- ❌ Customer self-registration
- ❌ Technician mobile application
- ❌ Technician login accounts
- ❌ Vendor dashboard / vendor portal
- ❌ Vendor staff application

> **Note:** Customers and Technicians exist as central business entities and managed data records within the platform, but they are not web portal login accounts in this release.

---

## 4. Current Development Phase

- **Current Phase:** `Phase 2 — Backend Foundation + Render + Supabase`
- **Status:** **Completed & Verified**
- **Next Phase:** `Phase 3 — Admin + Staff Authentication & Authorization`

Phase 2 establishes the production-quality backend platform:
1. Self-contained TypeScript Express backend under `/server` ready for Render deployment.
2. Centralized server-side Supabase client with protected service-role key handling.
3. Database migration foundation (`/supabase/migrations/`) defining all relational schemas, UUIDs, check constraints, foreign keys, and Row Level Security (RLS) policies.
4. Admin singleton enforcement at both the application and database level.
5. Typed authentication (`requireAuth`) and role authorization (`requireRole`) middleware.
6. Centralized request validation using Zod.
7. Structured, secret-redacted logging with UUID request correlation IDs (`X-Request-Id`).
8. HTTP security headers (Helmet), configurable CORS, and rate limiting.
9. Health endpoints: `GET /api/v1/health` (liveness) and `GET /api/v1/health/ready` (readiness with database verification).
10. Frontend API client (`src/services/api/`) consuming `VITE_API_BASE_URL` with typed error normalization.
11. Full test coverage across both frontend (26 tests) and backend (21 tests).

---

## 5. Documentation Source of Truth

All requirements, architectural standards, business algorithms, and compliance rules are documented in `/DOCS`:

| File | Purpose |
| :--- | :--- |
| [`DOCS/PRD.md`](./DOCS/PRD.md) | Product Requirements Document & Definition of Complete |
| [`DOCS/TRD.md`](./DOCS/TRD.md) | Technical Requirements Document & Stack Specifications |
| [`DOCS/DESIGN.md`](./DOCS/DESIGN.md) | UI/UX Specification, Layout, & Motion Guidelines |
| [`DOCS/ARCHITECTURE.md`](./DOCS/ARCHITECTURE.md) | System Architecture, Data Flows & Layer Boundaries |
| [`DOCS/RULES.md`](./DOCS/RULES.md) | Business Logic, State Machines & Idempotent Algorithms |
| [`DOCS/PRIVACY.md`](./DOCS/PRIVACY.md) | Data Protection, Access Control & Privacy by Design |
| [`DOCS/POLICY.md`](./DOCS/POLICY.md) | Operational Security Controls & Change Management |
| [`DOCS/MEMORY.md`](./DOCS/MEMORY.md) | Compact Reference for AI Coding Sessions |
| [`DOCS/API.md`](./DOCS/API.md) | Backend API Specification (v1) |

---

## 6. Directory Structure

```text
PYS/
├── DOCS/                        # Project source of truth (Markdown specifications)
├── public/                      # Static assets and favicon
├── render.yaml                  # Render Blueprint deployment specification
├── server/                      # Node.js + TypeScript + Express Backend API
│   ├── src/
│   │   ├── config/              # Typed environment validation (env.ts)
│   │   ├── controllers/         # HTTP controllers (health.controller.ts)
│   │   ├── lib/                 # Backend Supabase client singleton (supabase.ts)
│   │   ├── middleware/          # auth, role, validate, logger, requestId, errorHandler
│   │   ├── routes/              # Versioned API routes (/api/v1/health)
│   │   ├── services/            # Domain service logic (health.service.ts)
│   │   ├── types/               # Server types & Express Request augmentation
│   │   ├── utils/               # Structured logger, AppError hierarchy, API responses
│   │   ├── validators/          # Zod request validation schemas
│   │   ├── app.ts               # Express application configuration
│   │   └── server.ts            # Server entrypoint with graceful shutdown
│   ├── tests/                   # Backend Vitest & Supertest test suite
│   ├── .env.example             # Backend environment template
│   ├── package.json             # Server dependencies & scripts
│   └── tsconfig.json            # Backend TypeScript configuration
├── src/                         # Frontend React 19 + TypeScript + Vite Application
│   ├── components/              # UI components, layout, and feedback
│   ├── config/                  # Safe frontend environment configuration
│   ├── domain/                  # Domain contracts, state machines, and AMC calculator
│   ├── layouts/                 # AppShell, Sidebar, TopBar
│   ├── pages/                   # Application views (DashboardShell, etc.)
│   ├── services/
│   │   ├── api/                 # Centralized HTTP API client (Vercel -> Render)
│   │   └── supabase.ts          # Public client Supabase connection
│   ├── styles/                  # Modular Vanilla CSS design tokens & components
│   └── tests/                   # Frontend Vitest test suite
├── supabase/                    # Supabase Database Migrations & Seeds
│   ├── migrations/              # 20261007000000_foundation_schema.sql
│   └── seed/                    # Master configuration templates (seed.sql)
├── .env.example                 # Frontend environment template
├── .gitignore                   # Excludes secrets, node_modules, and build outputs
├── package.json                 # Root project scripts & workspace commands
└── README.md                    # Project documentation
```

---

## 7. Local Development Setup

### Prerequisites
- **Node.js:** v20.0.0 or higher (v24+ recommended)
- **npm:** v10.0.0 or higher

### 1. Installation
Install dependencies for both frontend and backend:
```bash
# Install frontend dependencies
npm install

# Install backend dependencies
npm --prefix server install
```

### 2. Environment Configuration
Set up environment files from templates:

**Frontend Configuration (`.env` in root):**
```bash
cp .env.example .env
```
Contains:
```env
VITE_APP_NAME="Place Your Service"
VITE_APP_ENV=development
VITE_APP_VERSION=0.1.0
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key-placeholder
VITE_API_BASE_URL=http://localhost:5000
```

**Backend Configuration (`server/.env`):**
```bash
cp server/.env.example server/.env
```
Contains:
```env
PORT=5000
NODE_ENV=development
CORS_ORIGIN=http://localhost:5173
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-placeholder
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX=100
```

### 3. Running Locally

**Terminal 1 (Frontend):**
```bash
npm run dev
# Vite runs at http://localhost:5173 (or configured port)
```

**Terminal 2 (Backend API):**
```bash
npm run server:dev
# Express API runs at http://localhost:5000
```

---

## 8. Available Scripts

| Command | Action |
| :--- | :--- |
| `npm run dev` | Runs Vite frontend development server |
| `npm run build` | Builds production frontend bundle to `dist/` |
| `npm run lint` | Lints frontend codebase |
| `npm run typecheck` | Validates frontend TypeScript types |
| `npm test` | Runs frontend Vitest test suite (26 tests) |
| `npm run server:dev` | Runs backend API server in watch mode with `tsx` |
| `npm run server:build` | Compiles backend TypeScript to `server/dist/` |
| `npm run server:start` | Runs compiled backend production server |
| `npm run server:test` | Runs backend Vitest & Supertest suite (21 tests) |
| `npm run server:typecheck` | Validates backend TypeScript types |
| `npm run test:all` | Executes full test suite across both frontend and backend (47 tests) |

---

## 9. Security Policy

1. **No Secrets in Source Control:** `.env` and `server/.env` are strictly excluded in `.gitignore`. Never commit service keys or database credentials.
2. **Service Role Protection:** `SUPABASE_SERVICE_ROLE_KEY` belongs exclusively to the Render backend and must **never** be exposed in client code, browser headers, or Vite environment variables.
3. **Server-Side Authorization:** Roles are enforced authoritatively on the backend using `requireRole`. Client-submitted role claims are never trusted.
4. **Admin Singleton:** Guaranteed by the database index `idx_staff_singleton_admin` and backend validation.
5. **Sanitized Logging:** All backend logs redact sensitive keys (`password`, `token`, `secret`, `service_role_key`).
