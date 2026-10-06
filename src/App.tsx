import React from 'react';
import { AppShell } from '@/layouts/AppShell';
import { DashboardShell } from '@/pages/DashboardShell';
import { ModuleShellPlaceholder } from '@/pages/ModuleShellPlaceholder';
import { PhaseZeroOverview } from '@/pages/PhaseZeroOverview';
import { ErrorBoundary } from '@/components/feedback/ErrorBoundary';
import { ToastProvider } from '@/components/ui/Toast';

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
    phase: 'Phase 3 — Customer & Site Management',
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
  staff: {
    name: 'Staff Management',
    category: 'ADMIN AREA',
    phase: 'Phase 2 / Phase 4 — Staff Onboarding & Auth',
    description:
      'Administrative provisioning of operational staff accounts with activation/deactivation controls.',
    features: [
      'Admin provision of operational staff credentials',
      'Staff activation and deactivation toggles',
      'Audit log attribution for staff actions',
      'Singleton Admin security protections',
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

export const App: React.FC = () => {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <AppShell>
          {({ currentRole, activeItem, onNavigate }) => {
            if (activeItem === 'dashboard') {
              return (
                <DashboardShell
                  currentRole={currentRole}
                  onNavigate={onNavigate}
                />
              );
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
          }}
        </AppShell>
      </ToastProvider>
    </ErrorBoundary>
  );
};

export default App;
