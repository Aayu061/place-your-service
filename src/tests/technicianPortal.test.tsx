import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act } from 'react';

// Tell React 19 that act is supported in jsdom
// @ts-expect-error global React flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
import { createRoot } from 'react-dom/client';
import { TechnicianLogin } from '@/pages/technician/TechnicianLogin';
import { TechnicianLayout } from '@/layouts/TechnicianLayout';
import { TechnicianDashboard } from '@/pages/technician/TechnicianDashboard';
import { TechnicianServiceReportForm } from '@/pages/technician/TechnicianServiceReportForm';
import { TechnicianProfile } from '@/pages/technician/TechnicianProfile';
import { TechnicianPortal } from '@/pages/technician/TechnicianPortal';
import { technicianApi, TechJob, TechUser } from '@/services/technicianApi';

describe('Technician Mobile Field Portal Frontend Suite', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  const mockTechUser: TechUser = {
    id: 'tech-001',
    technicianCode: 'TECH-0001',
    name: 'Rajesh Sharma',
    phone: '9876543210',
    email: 'rajesh@example.com',
    status: 'AVAILABLE',
  };

  const mockJobs: TechJob[] = [
    {
      id: 'sched-101',
      schedule_number: 'SCH-2026-0001',
      status: 'SCHEDULED',
      scheduled_date: new Date().toISOString().split('T')[0],
      start_time: '10:00',
      end_time: '11:30',
      planned_service_type: 'Dry Service',
      customers: {
        id: 'cust-101',
        name: 'Apex Towers Corp',
        phone: '9820011223',
      },
      sites: {
        id: 'site-101',
        site_name: 'Tower A',
        address: 'Sector 15, Vashi',
        city: 'Navi Mumbai',
        landmark: 'Near Railway Station',
      },
      ac_assets: {
        id: 'asset-101',
        brand: 'Daikin',
        model_number: 'FTKF50',
        room_location: 'Server Room',
        tonnage: 2.0,
      },
    },
    {
      id: 'sched-102',
      schedule_number: 'SCH-2026-0002',
      status: 'COMPLETED',
      scheduled_date: new Date().toISOString().split('T')[0],
      start_time: '12:00',
      end_time: '13:30',
      planned_service_type: 'Wet Service',
      customers: {
        id: 'cust-102',
        name: 'Sharma Residence',
        phone: '9820044556',
      },
      sites: {
        id: 'site-102',
        site_name: 'Home Flat 402',
        address: 'Palm Beach Road',
        city: 'Navi Mumbai',
      },
      ac_assets: {
        id: 'asset-102',
        brand: 'Voltas',
        model_number: '183V',
        room_location: 'Master Bedroom',
        tonnage: 1.5,
      },
    },
  ];

  const setInputValue = (input: HTMLInputElement | HTMLTextAreaElement, value: string) => {
    const proto = input instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
    descriptor?.set?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  };

  const renderComponent = (ui: React.ReactNode) => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(ui);
    });

    return {
      container,
      cleanup: () => {
        act(() => {
          root.unmount();
        });
        container.remove();
      },
    };
  };

  describe('1. Technician Login Component', () => {
    it('renders field desk branding, code/phone input, and PIN input', () => {
      const { container, cleanup } = renderComponent(
        <TechnicianLogin onLoginSuccess={vi.fn()} onSwitchToAdmin={vi.fn()} />
      );

      expect(container.textContent).toContain('Technician Field Portal');
      expect(container.textContent).toContain('Extreme Sales & Services');
      expect(container.textContent).toContain('Sign In to Field Desk');

      const idInput = container.querySelector('input[type="text"]') as HTMLInputElement;
      const pinInput = container.querySelector('input[type="password"]') as HTMLInputElement;
      const submitBtn = container.querySelector('button[type="submit"]') as HTMLButtonElement;

      expect(idInput).not.toBeNull();
      expect(pinInput).not.toBeNull();
      expect(submitBtn).not.toBeNull();
      expect(submitBtn.textContent).toContain('Sign In to Field Desk');

      cleanup();
    });

    it('validates required fields and reports error when identifier is missing', async () => {
      const { container, cleanup } = renderComponent(
        <TechnicianLogin onLoginSuccess={vi.fn()} onSwitchToAdmin={vi.fn()} />
      );

      const form = container.querySelector('form') as HTMLFormElement;
      await act(async () => {
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      });

      expect(container.textContent).toContain('Please enter your Technician Code');
      cleanup();
    });

    it('submits valid credentials to technicianApi.login and invokes onLoginSuccess', async () => {
      const onLoginSuccess = vi.fn();
      const loginSpy = vi.spyOn(technicianApi, 'login').mockResolvedValue({
        token: 'pys_tech_test_token',
        technician: mockTechUser,
      });

      const { container, cleanup } = renderComponent(
        <TechnicianLogin onLoginSuccess={onLoginSuccess} onSwitchToAdmin={vi.fn()} />
      );

      const idInput = container.querySelector('input[type="text"]') as HTMLInputElement;
      const pinInput = container.querySelector('input[type="password"]') as HTMLInputElement;
      const form = container.querySelector('form') as HTMLFormElement;

      act(() => {
        setInputValue(idInput, 'TECH-0001');
        setInputValue(pinInput, '1234');
      });

      await act(async () => {
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      });

      expect(loginSpy).toHaveBeenCalledWith('TECH-0001', '1234');
      expect(onLoginSuccess).toHaveBeenCalledTimes(1);

      cleanup();
    });

    it('switches to office staff / admin login when switch button is clicked', () => {
      const onSwitchToAdmin = vi.fn();
      const { container, cleanup } = renderComponent(
        <TechnicianLogin onLoginSuccess={vi.fn()} onSwitchToAdmin={onSwitchToAdmin} />
      );

      const switchBtn = Array.from(container.querySelectorAll('button')).find((btn) =>
        btn.textContent?.includes('Switch to Admin & Back-Office Portal')
      );
      expect(switchBtn).toBeDefined();

      act(() => {
        switchBtn?.click();
      });

      expect(onSwitchToAdmin).toHaveBeenCalledTimes(1);
      cleanup();
    });
  });

  describe('2. Technician Layout & Duty Status', () => {
    it('renders technician header with name, code badge, and duty status pill', () => {
      const { container, cleanup } = renderComponent(
        <TechnicianLayout
          activeTab="jobs"
          onTabChange={vi.fn()}
          onLogout={vi.fn()}
          tech={mockTechUser}
        >
          <div>Workspace Content</div>
        </TechnicianLayout>
      );

      expect(container.textContent).toContain('Rajesh Sharma');
      expect(container.textContent).toContain('TECH-0001');
      expect(container.textContent).toContain('Extreme Sales & Services · Field Desk');
      expect(container.textContent).toContain('On Duty · Available');
      expect(container.textContent).toContain('Workspace Content');

      cleanup();
    });

    it('updates live duty status when clicking dropdown options', async () => {
      const onTechChange = vi.fn();
      const updateStatusSpy = vi.spyOn(technicianApi, 'updateStatus').mockResolvedValue({
        status: 'BUSY',
      });

      const { container, cleanup } = renderComponent(
        <TechnicianLayout
          activeTab="jobs"
          onTabChange={vi.fn()}
          onLogout={vi.fn()}
          tech={mockTechUser}
          onTechChange={onTechChange}
        >
          <div>Content</div>
        </TechnicianLayout>
      );

      // Open status menu
      const statusPill = Array.from(container.querySelectorAll('button')).find((btn) =>
        btn.textContent?.includes('On Duty') || btn.textContent?.includes('Available')
      );
      expect(statusPill).toBeDefined();

      act(() => {
        statusPill?.click();
      });

      // Find "On Site (Busy)" option
      const busyOption = Array.from(container.querySelectorAll('button')).find((btn) =>
        btn.textContent?.includes('On Site (Busy)')
      );
      expect(busyOption).toBeDefined();

      await act(async () => {
        busyOption?.click();
      });

      expect(updateStatusSpy).toHaveBeenCalledWith('BUSY');
      expect(onTechChange).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'BUSY' })
      );

      cleanup();
    });
  });

  describe('3. Technician Dispatch Dashboard', () => {
    it('renders assigned appointments with customer name, phone, maps link, and AC specs', async () => {
      vi.spyOn(technicianApi, 'getJobs').mockResolvedValue(mockJobs);
      const onStartReport = vi.fn();

      const { container, cleanup } = renderComponent(
        <TechnicianDashboard onStartReport={onStartReport} />
      );

      // Wait for jobs to load
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      });

      expect(container.textContent).toContain("Today's Field Dispatch");
      expect(container.textContent).toContain('SCH-2026-0001');
      expect(container.textContent).toContain('Apex Towers Corp');
      expect(container.textContent).toContain('Tower A, Sector 15, Vashi, Navi Mumbai');
      expect(container.textContent).toContain('Daikin FTKF50 (Server Room)');

      // Phone Call shortcut
      const phoneLink = container.querySelector('a[href="tel:9820011223"]') as HTMLAnchorElement;
      expect(phoneLink).not.toBeNull();

      // Maps shortcut
      const mapsLink = container.querySelector('a[href*="google.com/maps"]') as HTMLAnchorElement;
      expect(mapsLink).not.toBeNull();

      // Start Report Button
      const startBtn = Array.from(container.querySelectorAll('button')).find((btn) =>
        btn.textContent?.includes('Start & Fill Report')
      );
      expect(startBtn).toBeDefined();

      act(() => {
        startBtn?.click();
      });

      expect(onStartReport).toHaveBeenCalledWith('sched-101');

      cleanup();
    });

    it('filters completed jobs when filterTab is completed', async () => {
      vi.spyOn(technicianApi, 'getJobs').mockResolvedValue(mockJobs);

      const { container, cleanup } = renderComponent(
        <TechnicianDashboard onStartReport={vi.fn()} filterTab="completed" />
      );

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      });

      // Should only show completed job
      expect(container.textContent).toContain('SCH-2026-0002');
      expect(container.textContent).toContain('Sharma Residence');
      expect(container.textContent).toContain('Service Completed');
      expect(container.textContent).not.toContain('Apex Towers Corp');

      cleanup();
    });
  });

  describe('4. Technician Service Report Form', () => {
    it('loads appointment details and allows progressing through wizard steps', async () => {
      vi.spyOn(technicianApi, 'getJobDetail').mockResolvedValue({
        schedule: mockJobs[0],
        existingReport: null,
      });

      const onBack = vi.fn();
      const onSuccess = vi.fn();

      const { container, cleanup } = renderComponent(
        <TechnicianServiceReportForm
          scheduleId="sched-101"
          onBack={onBack}
          onSuccess={onSuccess}
        />
      );

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      });

      expect(container.textContent).toContain('SCH-2026-0001');
      expect(container.textContent).toContain('Apex Towers Corp');
      expect(container.textContent).toContain('Carbon Booklet Report Number *');

      // Fill Booklet Serial
      const reportNumInput = container.querySelector('input[placeholder*="REP-"]') as HTMLInputElement;
      expect(reportNumInput).not.toBeNull();

      act(() => {
        setInputValue(reportNumInput, 'REP-2026-0099');
      });

      // Click "Continue to Inspection"
      const continueBtn = Array.from(container.querySelectorAll('button')).find((btn) =>
        btn.textContent?.includes('Continue to Inspection')
      );
      expect(continueBtn).toBeDefined();

      act(() => {
        continueBtn?.click();
      });

      // Step 2 should now be visible
      expect(container.textContent).toContain('Operating Readings');
      expect(container.textContent).toContain('Service Checklist');
      expect(container.textContent).toContain('Filter Cleaned');

      cleanup();
    });
  });

  describe('5. Technician Profile', () => {
    it('renders profile details and triggers onLogout', async () => {
      vi.spyOn(technicianApi, 'getProfile').mockResolvedValue({
        ...mockTechUser,
        specializations: ['Split AC', 'VRV / VRF'],
        metrics: { assignedToday: 2, completedToday: 1, pendingToday: 1 },
      });

      const onLogout = vi.fn();
      const { container, cleanup } = renderComponent(
        <TechnicianProfile onLogout={onLogout} onBackToJobs={vi.fn()} />
      );

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      });

      expect(container.textContent).toContain('Rajesh Sharma');
      expect(container.textContent).toContain('TECH-0001');
      expect(container.textContent).toContain('9876543210');
      expect(container.textContent).toContain('Split AC');

      const logoutBtn = Array.from(container.querySelectorAll('button')).find((btn) =>
        btn.textContent?.includes('Sign Out of Field Portal')
      );
      expect(logoutBtn).toBeDefined();

      act(() => {
        logoutBtn?.click();
      });

      expect(onLogout).toHaveBeenCalledTimes(1);
      cleanup();
    });
  });

  describe('6. Technician Portal Orchestrator', () => {
    it('renders login when not authenticated', () => {
      vi.spyOn(technicianApi, 'getToken').mockReturnValue(null);
      vi.spyOn(technicianApi, 'getStoredTech').mockReturnValue(null);

      const { container, cleanup } = renderComponent(
        <TechnicianPortal onSwitchToAdmin={vi.fn()} />
      );

      expect(container.textContent).toContain('Technician Field Portal');
      expect(container.textContent).toContain('Sign In to Field Desk');

      cleanup();
    });

    it('renders dashboard when authenticated', async () => {
      vi.spyOn(technicianApi, 'getToken').mockReturnValue('valid_token');
      vi.spyOn(technicianApi, 'getStoredTech').mockReturnValue(mockTechUser);
      vi.spyOn(technicianApi, 'getProfile').mockResolvedValue({
        ...mockTechUser,
        metrics: { assignedToday: 1, completedToday: 0, pendingToday: 1 },
      });
      vi.spyOn(technicianApi, 'getJobs').mockResolvedValue(mockJobs);

      const { container, cleanup } = renderComponent(
        <TechnicianPortal onSwitchToAdmin={vi.fn()} />
      );

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      });

      expect(container.textContent).toContain('Rajesh Sharma');
      expect(container.textContent).toContain("Today's Field Dispatch");

      cleanup();
    });
  });
});
