# Place Your Service (PYS)

> Modern, internal AC Service Management Web Platform designed for end-to-end service, asset, AMC, technician, inventory, and payment operations.

---

## 1. Project Overview

**Place Your Service** is a production-oriented internal web platform engineered for an air-conditioning sales and service business. It replaces disconnected spreadsheets and ad-hoc communication with a single, auditable operational workspace.

### Core Principle
**No fake functionality.** Dashboards reflect actual calculated database records, service workflows follow strict state transitions, stock mutations produce immutable transaction logs, and operations run against a real PostgreSQL/Supabase backend.

---

## 2. Current Application Scope (Locked)

The application is strictly designed for internal operational management.

### Active Application Roles
1. **Admin**
   - Fixed / singleton administrative account.
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

## 3. Current Development Phase

- **Current Phase:** `Phase 1 — Design System + Application Shell`
- **Status:** **Completed & Verified**
- **Next Phase:** `Phase 2 — Backend Foundation + Render + Supabase`

Phase 1 delivers the complete visual and structural foundation: centralized Vanilla CSS design tokens, typography hierarchy, responsive role-aware application shell (Sidebar, TopBar, Main Content), structural operational dashboard, reusable UI primitives (Buttons, Inputs, Selects, Cards, Badges, StatusBadges, Tabs, Tables, Modals, Drawers, Dropdowns, Tooltips, Toasts), and an accessible motion system respecting `prefers-reduced-motion`.

---

## 4. Documentation Source of Truth

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

---

## 5. Technology Stack

- **Frontend Core:** React 19, TypeScript (Strict Mode)
- **Build Tooling:** Vite 6
- **Styling Architecture:** Modern Vanilla CSS with CSS Custom Properties (Design Tokens), zero runtime CSS overhead, accessible semantic HTML
- **Icons:** Lucide React
- **Backend Foundation:** Supabase (`@supabase/supabase-js`, PostgreSQL, Row-Level Security, Supabase Auth)
- **Testing:** Vitest
- **Code Quality:** ESLint Flat Config, TypeScript ESLint

---

## 6. Directory Structure

```text
PYS/
├── DOCS/                        # Project source of truth (8 Markdown specifications)
├── public/                      # Static assets and favicon
├── src/
│   ├── assets/                  # Images, branding assets
│   ├── components/
│   │   ├── feedback/            # EmptyState, ErrorBoundary
│   │   └── ui/                  # Reusable Button, Card, Badge, StatusBadge, Skeleton
│   ├── config/                  # Safe typed environment configuration (env.ts)
│   ├── domain/                  # Business domain models, state machines & AMC algorithms
│   │   ├── types.ts             # Core TypeScript contracts (Customer, AC, AMC, Service, etc.)
│   │   ├── stateMachines.ts     # Service lifecycle validation (RULES.md §11)
│   │   └── amcCalculator.ts     # Calendar-aware AMC visit schedule generation (RULES.md §7)
│   ├── layouts/                 # AppShell, Sidebar, TopBar
│   ├── pages/                   # Application views (PhaseZeroOverview.tsx)
│   ├── services/                # Supabase client singleton & connection diagnostics
│   ├── styles/                  # Modular CSS design tokens, reset, typography, motion, layout
│   │   ├── tokens.css           # Color palette, spacing, typography scale, radii, motion tokens
│   │   ├── reset.css            # Modern CSS reset
│   │   ├── typography.css       # Heading hierarchy & text utilities
│   │   ├── motion.css           # Centralized motion classes & prefers-reduced-motion overrides
│   │   ├── layout.css           # App shell layout & responsive grid/flex
│   │   ├── components.css       # Button, Card, Badge, Form input styles
│   │   └── index.css            # Master stylesheet
│   ├── tests/                   # Automated unit tests for domain logic & security
│   ├── utils/                   # Formatters for currency, dates, and labels
│   ├── App.tsx                  # Root application component
│   └── main.tsx                 # DOM entry point
├── .env.example                 # Environment variable template
├── .gitignore                   # Excludes secrets, node_modules, and build artifacts
├── eslint.config.js             # ESLint configuration
├── package.json                 # Project dependencies & scripts
├── tsconfig.json                # TypeScript project configuration
├── vite.config.ts               # Vite configuration with @ path alias
└── README.md                    # Project documentation
```

---

## 7. Getting Started

### Prerequisites
- **Node.js:** v20.0.0 or higher (v24+ recommended)
- **npm:** v10.0.0 or higher

### Installation
1. Clone the repository:
   ```bash
   git clone https://github.com/Aayu061/place-your-service.git
   cd place-your-service
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment configuration:
   ```bash
   cp .env.example .env
   ```

### Available Scripts

| Command | Action |
| :--- | :--- |
| `npm run dev` | Starts Vite local development server on `http://localhost:3000` |
| `npm run build` | Compiles TypeScript and builds production bundle to `dist/` |
| `npm run preview` | Previews the production build locally |
| `npm run lint` | Runs ESLint across all TypeScript source files |
| `npm run typecheck` | Validates TypeScript types across the entire project |
| `npm test` | Runs the Vitest test suite |

---

## 8. Security & Environment Policy

- **No Secrets in Source Control:** `.env` is strictly ignored by Git. Never commit actual secret keys or API credentials.
- **Client Key Restriction:** Only the Supabase anonymous public key (`VITE_SUPABASE_ANON_KEY`) may be consumed by the frontend. The Supabase `service_role` key must **never** be included in frontend code.
- **RLS Boundary:** Row-Level Security in PostgreSQL is the final security boundary for all database tables.

---

## 9. Development Workflow & Git Rules

- Every development phase must be validated with:
  1. `npm run lint`
  2. `npm run typecheck`
  3. `npm test`
  4. `npm run build`
- Every completed phase must be committed with a conventional commit message and pushed to the remote GitHub repository.
