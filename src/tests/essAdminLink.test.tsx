import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';

// @ts-expect-error React 19 act environment flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import { Sidebar } from '@/layouts/Sidebar';
import { NAV_STRUCTURE } from '@/layouts/navStructure';
import { ExtremeSalesManagementWorkspace } from '@/pages/integrations/ExtremeSalesManagementWorkspace';
import { ToastProvider } from '@/components/ui/Toast';
import { ThemeProvider } from '@/context/ThemeContext';
import { AuthContext, AuthContextType } from '@/context/authContextDef';
import { apiClient } from '@/services/api/client';
import { intakeService } from '@/services/intakeService';
import { config } from '@/config/env';
import type { UserRole } from '@/domain/types';

const ESS_ADMIN_URL = 'https://extreme-sales-services.vercel.app/admin';

let container: HTMLDivElement;
let root: Root;

const flush = () => act(async () => { await Promise.resolve(); });

// The PYS dashboard only has ADMIN and STAFF (technicians use their own portal).
type Role = UserRole;

const makeAuth = (role: Role): AuthContextType => ({
  user: { id: 'u1', email: 'u@pys.internal', fullName: 'Test User', role, isActive: true },
  session: null,
  isLoading: false,
  error: null,
  login: vi.fn(),
  logout: vi.fn(),
  clearError: vi.fn(),
  refreshUser: vi.fn(),
});

const renderSidebar = async (role: Role, opts: { isCollapsed?: boolean; isMobileOpen?: boolean } = {}) => {
  const onItemSelect = vi.fn();
  const onCloseMobile = vi.fn();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(
      <ThemeProvider>
        <AuthContext.Provider value={makeAuth(role)}>
          <Sidebar
            currentRole={role}
            activeItem="dashboard"
            onItemSelect={onItemSelect}
            isCollapsed={opts.isCollapsed ?? false}
            onToggleCollapse={vi.fn()}
            isMobileOpen={opts.isMobileOpen ?? false}
            onCloseMobile={onCloseMobile}
          />
        </AuthContext.Provider>
      </ThemeProvider>
    );
  });
  await flush();
  return { onItemSelect, onCloseMobile };
};

const essLink = () => document.querySelector<HTMLAnchorElement>('a[data-testid="ess-admin-link"]');

describe('ESS website admin link', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(intakeService, 'stats').mockResolvedValue({
      pending: 0,
      approvedToday: 0,
      rejectedToday: 0,
      spam: 0,
      oldestPendingAt: null,
    });
  });
  afterEach(() => {
    act(() => root?.unmount());
    container?.remove();
    document.body.innerHTML = '';
  });

  it('defaults to the ESS admin address with no tokens or query', () => {
    expect(config.essAdminUrl).toBe(ESS_ADMIN_URL);
    expect(config.essAdminUrl).not.toMatch(/[?#]/);
  });

  it('sits directly below Extreme S&S Portal in ADMIN AREA, admin only', () => {
    const adminArea = NAV_STRUCTURE.find((g) => g.group === 'ADMIN AREA')!;
    const ids = adminArea.items.map((i) => i.id);
    expect(ids.indexOf('ess-admin-link')).toBe(ids.indexOf('ess-management') + 1);
    const item = adminArea.items.find((i) => i.id === 'ess-admin-link')!;
    expect(item.adminOnly).toBe(true);
    expect(item.label).toBe('ESS website admin');
    expect(item.href).toBe(ESS_ADMIN_URL);
  });

  it('admin sees a new-tab link with the exact address and rel', async () => {
    await renderSidebar('ADMIN');
    const a = essLink();
    expect(a).not.toBeNull();
    expect(a!.textContent).toContain('ESS website admin');
    expect(a!.getAttribute('href')).toBe(ESS_ADMIN_URL);
    expect(a!.getAttribute('target')).toBe('_blank');
    expect(a!.getAttribute('rel')).toBe('noopener noreferrer');
    expect(a!.textContent).toContain('opens in a new tab');
  });

  it('staff does not see it', async () => {
    await renderSidebar('STAFF');
    expect(essLink()).toBeNull();
    expect(document.body.textContent).not.toContain('ESS website admin');
  });

  it('clicking it does not select a PYS page or close the menu', async () => {
    const { onItemSelect, onCloseMobile } = await renderSidebar('ADMIN', { isMobileOpen: true });
    const a = essLink()!;
    a.addEventListener('click', (e) => e.preventDefault()); // keep jsdom from navigating
    await act(async () => {
      a.click();
    });
    expect(onItemSelect).not.toHaveBeenCalled();
    expect(onCloseMobile).not.toHaveBeenCalled();
    expect(a.getAttribute('aria-current')).toBeNull();
  });

  it('renders in the collapsed sidebar', async () => {
    await renderSidebar('ADMIN', { isCollapsed: true });
    const a = essLink();
    expect(a).not.toBeNull();
    expect(a!.getAttribute('href')).toBe(ESS_ADMIN_URL);
    expect(a!.getAttribute('target')).toBe('_blank');
    expect(a!.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('renders in the open mobile sidebar', async () => {
    await renderSidebar('ADMIN', { isMobileOpen: true });
    expect(document.querySelector('.sidebar.mobile-open')).not.toBeNull();
    expect(essLink()?.getAttribute('href')).toBe(ESS_ADMIN_URL);
  });

  it('leaves the neighbouring menu items as buttons', async () => {
    await renderSidebar('ADMIN');
    expect(document.body.textContent).toContain('Extreme S&S Portal');
    expect(document.querySelectorAll('a[href]')).toHaveLength(1);
  });

  it('workspace header has the same shortcut', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue({ requests: [], products: [] });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root.render(
        <ToastProvider>
          <ExtremeSalesManagementWorkspace onNavigate={vi.fn()} />
        </ToastProvider>
      );
    });
    await flush();
    const a = document.querySelector<HTMLAnchorElement>('a[data-testid="ess-admin-link-header"]');
    expect(a).not.toBeNull();
    expect(a!.textContent).toContain('Open ESS website admin');
    expect(a!.getAttribute('href')).toBe(ESS_ADMIN_URL);
    expect(a!.getAttribute('target')).toBe('_blank');
    expect(a!.getAttribute('rel')).toBe('noopener noreferrer');
  });
});

describe('ESS website admin link is never a PYS page', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(intakeService, 'stats').mockResolvedValue({
      pending: 0,
      approvedToday: 0,
      rejectedToday: 0,
      spam: 0,
      oldestPendingAt: null,
    });
  });
  afterEach(() => {
    act(() => root?.unmount());
    container?.remove();
    window.history.replaceState(null, '', '/');
  });

  it('?workspace=ess-admin-link falls back to the Dashboard', async () => {
    const { AppShell } = await import('@/layouts/AppShell');
    window.history.replaceState(null, '', '/?workspace=ess-admin-link');
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root.render(
        <ThemeProvider>
          <ToastProvider>
            <AuthContext.Provider value={makeAuth('ADMIN')}>
              <AppShell role="ADMIN">
                {({ activeItem }) => <span data-testid="active-item">{activeItem}</span>}
              </AppShell>
            </AuthContext.Provider>
          </ToastProvider>
        </ThemeProvider>
      );
    });
    await flush();
    expect(document.querySelector('[data-testid="active-item"]')?.textContent).toBe('dashboard');
  });
});
