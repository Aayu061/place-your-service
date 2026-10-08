import React, { Suspense, lazy } from 'react';
import { AppShell } from '@/layouts/AppShell';
import { Login } from '@/pages/Login';
import { ErrorBoundary } from '@/components/feedback/ErrorBoundary';
import { ToastProvider } from '@/components/ui/Toast';
import { AuthProvider } from '@/context/AuthContext';
import { useAuth } from '@/hooks/useAuth';

// Route-level code-splitting: lazy load pages on-demand to optimize bundle size and startup performance
const DashboardShell = lazy(() => import('@/pages/DashboardShell').then((m) => ({ default: m.DashboardShell })));
const CustomerManagement = lazy(() => import('@/pages/CustomerManagement').then((m) => ({ default: m.CustomerManagement })));
const AmcManagement = lazy(() => import('@/pages/AmcManagement').then((m) => ({ default: m.AmcManagement })));
const ServiceRequestManagement = lazy(() => import('@/pages/ServiceRequestManagement').then((m) => ({ default: m.ServiceRequestManagement })));
const TechnicianManagement = lazy(() => import('@/pages/TechnicianManagement').then((m) => ({ default: m.TechnicianManagement })));
const StaffManagement = lazy(() => import('@/pages/StaffManagement').then((m) => ({ default: m.StaffManagement })));
const AcMasterManagement = lazy(() => import('@/pages/AcMasterManagement').then((m) => ({ default: m.AcMasterManagement })));
const ServiceScheduleManagement = lazy(() => import('@/pages/ServiceScheduleManagement').then((m) => ({ default: m.ServiceScheduleManagement })));
const PhaseZeroOverview = lazy(() => import('@/pages/PhaseZeroOverview').then((m) => ({ default: m.PhaseZeroOverview })));
const ModuleShellPlaceholder = lazy(() => import('@/pages/ModuleShellPlaceholder').then((m) => ({ default: m.ModuleShellPlaceholder })));

const RouteLoadingFallback: React.FC = () => (
  <div
    style={{
      padding: 'var(--space-8)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 'var(--space-3)',
      minHeight: '300px',
    }}
    role="status"
    aria-live="polite"
  >
    <span
      className="animate-spin"
      style={{
        width: '28px',
        height: '28px',
        border: '3px solid var(--color-brand)',
        borderRightColor: 'transparent',
        borderRadius: '50%',
      }}
      aria-hidden="true"
    />
    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontWeight: 500 }}>
      Loading workspace module...
    </div>
  </div>
);

const MODULE_DEFINITIONS: Record<
  string,
  {
    name: string;
    category: string;
    phase: string;
    description: string;
    features: string[];
  }
> = {
  customers: {
    name: 'Customers & Sites',
    category: 'OPERATIONS',
    phase: 'Phase 4 — Customer & Site Management',
    description:
      'Manage temporary and permanent customer accounts, branch sites, and locations with zero duplicate records.',
    features: [
      'Temporary to Permanent conversion preserving history',
      'Customer branch sites & multiple location contacts',
      'AC asset register linking per site',
      'Customer 360-degree operational overview workspace',
      'Site contact persons and billing addresses',
    ],
  },
  'service-requests': {
    name: 'Service Requests',
    category: 'OPERATIONS',
    phase: 'Phase 6 — Service Requests & State Machine',
    description:
      'Operational breakdown ticketing, complaints, emergency repairs, and installations with strict lifecycle transition rules.',
    features: [
      'Unplanned repair & breakdown ticketing',
      'Strict status transitions (Requested → Pending → Scheduled → Assigned → In Progress → Closed)',
      'Technician assignment & recommendation scoring',
      'Service report generation and parts consumption linkage',
      'Auditable manual overrides and hold states',
    ],
  },
  'service-schedule': {
    name: 'Service Schedule',
    category: 'OPERATIONS',
    phase: 'Phase 7 — Preventive Maintenance & AMC Execution',
    description:
      'Calendar-based planned preventive maintenance execution queue generated automatically from AMC contracts.',
    features: [
      'Calendar and timeline view of scheduled visits',
      'Overdue service warnings and status tracking',
      'Technician dispatch and area-based filtering',
      'Idempotent schedule generation without duplicate visits',
    ],
  },
  technicians: {
    name: 'Technicians Master',
    category: 'OPERATIONS',
    phase: 'Phase 5 — Technicians Master & Assignment Algorithm',
    description:
      'Managed operational resources with HVAC skill tags, service areas, and real-time workload tracking (resources, not login accounts).',
    features: [
      'HVAC skill ratings and specializations',
      'Geographic service area mapping',
      'Active workload monitoring and availability',
      'Recommendation scoring algorithm (Area 40%, Availability 20%, Proximity 20%, Workload 10%, Skill 10%)',
    ],
  },
  amc: {
    name: 'AMC Contracts',
    category: 'CONTRACTS',
    phase: 'Phase 7 — AMC Contracts & Automatic Generation',
    description:
      'Formal contracts defining preventive maintenance frequency, asset coverage, and renewal tracking.',
    features: [
      'Contract intervals (Monthly, Quarterly, Half-Yearly, Yearly)',
      'Calendar-aware automatic visit date generation',
      'Expiring contract detection and renewal tracking',
      'Covered AC asset linking and inspection history',
    ],
  },
  parts: {
    name: 'Parts Catalog',
    category: 'INVENTORY',
    phase: 'Phase 9 — Parts & Inventory Management',
    description:
      'Air-conditioning spare parts, refrigerants, and consumables master list with pricing and threshold alerts.',
    features: [
      'Spare parts catalog with SKU codes and brands',
      'Low-stock threshold triggers and alerts',
      'Unit pricing and specification tracking',
    ],
  },
  inventory: {
    name: 'Inventory Ledger',
    category: 'INVENTORY',
    phase: 'Phase 9 — Parts & Inventory Management',
    description:
      'Immutable transaction logs tracking opening stock, purchases, service consumption, adjustments, and returns.',
    features: [
      'Transaction-based calculated stock ledger',
      'Direct linkage to service execution reports',
      'Auditable stock adjustments with mandatory reasons',
      'Strict prevention of negative stock levels',
    ],
  },
  payments: {
    name: 'Payments & Ledger',
    category: 'FINANCE',
    phase: 'Phase 10 — Payments & Financial Tracking',
    description:
      'Auditable payment records across cash collections and trusted online transactions.',
    features: [
      'Outstanding balance calculation (Total Due - Payments + Adjustments)',
      'Cash collection tracking attributable to Staff',
      'Payment statuses: Pending, Partially Paid, Paid, Failed, Refunded',
      'Receipt references linking to service and AMC orders',
    ],
  },
  notifications: {
    name: 'Notifications',
    category: 'SYSTEM',
    phase: 'Phase 13 — Notifications & Activity Audit',
    description:
      'Persistent alerts for expiring AMCs, overdue services, low stock, and administrative events.',
    features: [
      'Expiring AMC contract warnings',
      'Overdue maintenance reminders',
      'Low inventory threshold notifications',
      'Read / unread status tracking',
    ],
  },
  'activity-logs': {
    name: 'Activity & Audit Log',
    category: 'SYSTEM',
    phase: 'Phase 13 — Notifications & Activity Audit',
    description:
      'Immutable operational audit trails logging actor, action, timestamp, and entity mutations.',
    features: [
      'Traceability for customer, service, AMC, and staff operations',
      'Tamper-resistant audit storage',
      'Before / after state capture for critical operational changes',
    ],
  },
  settings: {
    name: 'System Settings',
    category: 'ADMIN AREA',
    phase: 'Phase 14 — System Polish & Administration',
    description:
      'System-wide parameters including notification thresholds, service areas, and assignment weights.',
    features: [
      'Technician recommendation algorithm weights configuration',
      'AMC default renewal warning lead time',
      'Service area master list maintenance',
      'Phase 0 foundation review',
    ],
  },
};

const AuthenticatedApp: React.FC = () => {
  const { user, isLoading } = useAuth();

  // 1. Session Restoration / Loading State (Eliminates Auth Flicker)
  if (isLoading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'var(--bg-canvas)',
          gap: 'var(--space-4)',
        }}
        role="status"
        aria-live="polite"
      >
        <span
          className="animate-spin"
          style={{
            width: '36px',
            height: '36px',
            border: '3px solid var(--color-brand)',
            borderRightColor: 'transparent',
            borderRadius: '50%',
          }}
          aria-hidden="true"
        />
        <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', fontWeight: 500 }}>
          Restoring secure authenticated session...
        </div>
      </div>
    );
  }

  // 2. Unauthenticated State -> Render Secure Login View
  if (!user) {
    return <Login />;
  }

  // 3. Authenticated State -> Render AppShell with Server-Verified Role
  return (
    <AppShell role={user.role}>
      {({ currentRole, activeItem, onNavigate }) => {
        const renderModule = () => {
          if (activeItem === 'dashboard') {
            return (
              <DashboardShell
                currentRole={currentRole}
                onNavigate={onNavigate}
              />
            );
          }

          // Dedicated Phase 3 Staff Management (Admin Only)
          if (activeItem === 'staff') {
            return <StaffManagement />;
          }

          // Dedicated Phase 4 Customer Management (Admin & Staff)
          if (activeItem === 'customers') {
            return <CustomerManagement onNavigate={onNavigate} />;
          }

          // Dedicated Phase 6 Service Request Management (Admin & Staff)
          if (activeItem === 'service-requests') {
            return <ServiceRequestManagement onNavigate={onNavigate} />;
          }

          // Dedicated Phase 7 Technician Management (Admin & Staff)
          if (activeItem === 'technicians') {
            return <TechnicianManagement onNavigate={onNavigate} />;
          }

          // Dedicated Phase 8 AMC & Preventive Maintenance (Admin & Staff)
          if (activeItem === 'amc') {
            return <AmcManagement onNavigate={onNavigate} />;
          }

          // Dedicated Phase 9 Service Schedule & Assignment (Admin & Staff)
          if (activeItem === 'service-schedule') {
            return <ServiceScheduleManagement onNavigate={onNavigate} />;
          }

          // AC Master Data Management (Admin)
          if (activeItem === 'ac-master') {
            return <AcMasterManagement onNavigate={onNavigate} />;
          }

          if (activeItem === 'phase-zero-review') {
            return <PhaseZeroOverview currentRole={currentRole} />;
          }

          const moduleDef = MODULE_DEFINITIONS[activeItem];
          if (moduleDef) {
            return (
              <ModuleShellPlaceholder
                moduleId={activeItem}
                moduleName={moduleDef.name}
                category={moduleDef.category}
                plannedPhase={moduleDef.phase}
                description={moduleDef.description}
                plannedFeatures={moduleDef.features}
                onBackToDashboard={() => onNavigate('dashboard')}
              />
            );
          }

          // Fallback to Dashboard
          return (
            <DashboardShell
              currentRole={currentRole}
              onNavigate={onNavigate}
            />
          );
        };

        return (
          <Suspense fallback={<RouteLoadingFallback />}>
            {renderModule()}
          </Suspense>
        );
      }}
    </AppShell>
  );
};

export const App: React.FC = () => {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <AuthProvider>
          <AuthenticatedApp />
        </AuthProvider>
      </ToastProvider>
    </ErrorBoundary>
  );
};

export default App;
