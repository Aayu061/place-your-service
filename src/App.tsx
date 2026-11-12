import React, { Suspense, lazy, useState, useEffect } from 'react';
import { AppShell } from '@/layouts/AppShell';
import { Login } from '@/pages/Login';
import { ErrorBoundary } from '@/components/feedback/ErrorBoundary';
import { ToastProvider } from '@/components/ui/Toast';
import { AuthProvider } from '@/context/AuthContext';
import { ThemeProvider } from '@/context/ThemeContext';
import { useAuth } from '@/hooks/useAuth';
import { OperationalWorkspace, SettingsWorkspace } from '@/pages/OperationalWorkspace';
import { ServerWarmupIndicator } from '@/components/feedback/ServerWarmupIndicator';

// Route-level code-splitting: lazy load pages on-demand to optimize bundle size and startup performance
const DashboardShell = lazy(() => import('@/pages/DashboardShell').then((m) => ({ default: m.DashboardShell })));
const OverallAnalytics = lazy(() => import('@/pages/OverallAnalytics').then((m) => ({ default: m.OverallAnalytics })));
const CustomerManagement = lazy(() => import('@/pages/CustomerManagement').then((m) => ({ default: m.CustomerManagement })));
const AmcManagement = lazy(() => import('@/pages/AmcManagement').then((m) => ({ default: m.AmcManagement })));
const ServiceRequestManagement = lazy(() => import('@/pages/ServiceRequestManagement').then((m) => ({ default: m.ServiceRequestManagement })));
const TechnicianManagement = lazy(() => import('@/pages/TechnicianManagement').then((m) => ({ default: m.TechnicianManagement })));
const StaffManagement = lazy(() => import('@/pages/StaffManagement').then((m) => ({ default: m.StaffManagement })));
const AcMasterManagement = lazy(() => import('@/pages/AcMasterManagement').then((m) => ({ default: m.AcMasterManagement })));
const ServiceScheduleManagement = lazy(() => import('@/pages/ServiceScheduleManagement').then((m) => ({ default: m.ServiceScheduleManagement })));
const ServiceReportsManagement = lazy(() => import('@/pages/ServiceReportsManagement').then((m) => ({ default: m.ServiceReportsManagement })));
const PhaseZeroOverview = lazy(() => import('@/pages/PhaseZeroOverview').then((m) => ({ default: m.PhaseZeroOverview })));
const TechnicianPortal = lazy(() => import('@/pages/technician/TechnicianPortal').then((m) => ({ default: m.TechnicianPortal })));

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

const getInitialPortal = (): 'admin' | 'tech' => {
  if (typeof window === 'undefined') return 'admin';
  const path = window.location.pathname;
  const search = new URLSearchParams(window.location.search);
  return path.startsWith('/tech') || search.get('portal') === 'tech' ? 'tech' : 'admin';
};

interface AuthenticatedAppProps {
  onSwitchToTech: () => void;
}

const AuthenticatedApp: React.FC<AuthenticatedAppProps> = ({ onSwitchToTech }) => {
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
    return <Login onSwitchToTech={onSwitchToTech} />;
  }

  // 3. Authenticated State -> Render AppShell with Server-Verified Role
  return (
    <>
      <ServerWarmupIndicator />
      <AppShell role={user.role}>
        {({ currentRole, activeItem, onNavigate, activeSubTab }) => {
        const renderModule = () => {
          if (activeItem === 'dashboard') {
            return (
              <DashboardShell
                currentRole={currentRole}
                onNavigate={onNavigate}
                activeSubTab={activeSubTab}
              />
            );
          }

          // Dedicated Phase 11 Overall Operations & SLA Analytics
          if (activeItem === 'analytics') {
            return <OverallAnalytics onNavigate={onNavigate} />;
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

          // Service Visit Report & Completion Management Module (Admin & Staff)
          if (activeItem === 'service-reports') {
            return <ServiceReportsManagement onNavigate={onNavigate} role={currentRole} />;
          }

          // AC Master Data Management (Admin)
          if (activeItem === 'ac-master') {
            return <AcMasterManagement onNavigate={onNavigate} />;
          }

          if (activeItem === 'phase-zero-review') {
            return <PhaseZeroOverview currentRole={currentRole} />;
          }

          if (['parts', 'inventory', 'payments', 'notifications', 'activity-logs'].includes(activeItem)) {
            return <OperationalWorkspace moduleId={activeItem} role={currentRole} onNavigate={onNavigate} />;
          }

          if (activeItem === 'settings') return <SettingsWorkspace />;

          // Fallback to Dashboard
          return (
            <DashboardShell
              currentRole={currentRole}
              onNavigate={onNavigate}
              activeSubTab={activeSubTab}
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
    </>
  );
};

export const App: React.FC = () => {
  const [portal, setPortal] = useState<'admin' | 'tech'>(getInitialPortal);

  useEffect(() => {
    const handlePopState = () => {
      setPortal(getInitialPortal());
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const switchToTech = () => {
    setPortal('tech');
    const url = new URL(window.location.href);
    url.searchParams.set('portal', 'tech');
    window.history.pushState({ portal: 'tech' }, '', url.toString());
  };

  const switchToAdmin = () => {
    setPortal('admin');
    const url = new URL(window.location.href);
    url.searchParams.delete('portal');
    if (url.pathname.startsWith('/tech')) {
      url.pathname = '/';
    }
    window.history.pushState({ portal: 'admin' }, '', url.toString());
  };

  return (
    <ErrorBoundary>
      <ToastProvider>
        <ThemeProvider>
          {portal === 'tech' ? (
            <Suspense fallback={<RouteLoadingFallback />}>
              <TechnicianPortal onSwitchToAdmin={switchToAdmin} />
            </Suspense>
          ) : (
            <AuthProvider>
              <AuthenticatedApp onSwitchToTech={switchToTech} />
            </AuthProvider>
          )}
        </ThemeProvider>
      </ToastProvider>
    </ErrorBoundary>
  );
};

export default App;
