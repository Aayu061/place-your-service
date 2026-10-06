import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act } from 'react';

// Tell React 19 that act is supported in jsdom
// @ts-expect-error global React flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
import { createRoot } from 'react-dom/client';
import { Login } from '@/pages/Login';
import { StaffManagement } from '@/pages/StaffManagement';
import { AuthContext, AuthContextType } from '@/context/authContextDef';
import { ToastProvider } from '@/components/ui/Toast';
import { apiClient } from '@/services/api/client';
import { UserProfile } from '@/domain/types';

describe('Phase 3 Frontend Authentication & Authorization Suite', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const renderWithAuth = (
    ui: React.ReactNode,
    authOverrides: Partial<AuthContextType> = {}
  ) => {
    const defaultAuth: AuthContextType = {
      user: null,
      session: null,
      isLoading: false,
      error: null,
      login: vi.fn().mockResolvedValue({ success: true }),
      logout: vi.fn().mockResolvedValue(undefined),
      clearError: vi.fn(),
      refreshUser: vi.fn().mockResolvedValue(undefined),
      ...authOverrides,
    };

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <ToastProvider>
          <AuthContext.Provider value={defaultAuth}>
            {ui}
          </AuthContext.Provider>
        </ToastProvider>
      );
    });

    return {
      container,
      auth: defaultAuth,
      cleanup: () => {
        act(() => {
          root.unmount();
        });
        container.remove();
      },
    };
  };

  describe('Login Component', () => {
    it('renders login form, fields, labels, and accessible submit button', () => {
      const { container, cleanup } = renderWithAuth(<Login />);

      expect(container.textContent).toContain('Place Your Service');
      expect(container.textContent).toContain('Internal Operations & Service Management Portal');
      expect(container.textContent).toContain('Authorized Admin & Staff Access Only');

      const emailInput = container.querySelector('#login-email') as HTMLInputElement;
      const passwordInput = container.querySelector('#login-password') as HTMLInputElement;
      const submitBtn = container.querySelector('button[type="submit"]') as HTMLButtonElement;

      expect(emailInput).not.toBeNull();
      expect(emailInput.type).toBe('email');
      expect(passwordInput).not.toBeNull();
      expect(passwordInput.type).toBe('password');
      expect(submitBtn).not.toBeNull();
      expect(submitBtn.textContent).toContain('Sign In to Dashboard');

      cleanup();
    });

    it('displays error banner when authentication error is present', () => {
      const { container, cleanup } = renderWithAuth(<Login />, {
        error: 'Invalid email or password. Please check your credentials.',
      });

      const alert = container.querySelector('[role="alert"]');
      expect(alert).not.toBeNull();
      expect(alert?.textContent).toContain('Invalid email or password');

      cleanup();
    });

    it('submits credentials and calls login with trimmed email', async () => {
      const loginMock = vi.fn().mockResolvedValue({ success: true });
      const { container, cleanup } = renderWithAuth(<Login />, { login: loginMock });

      const emailInput = container.querySelector('#login-email') as HTMLInputElement;
      const passwordInput = container.querySelector('#login-password') as HTMLInputElement;
      const form = container.querySelector('form') as HTMLFormElement;

      act(() => {
        // Trigger React onChange
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          'value'
        )?.set;
        nativeInputValueSetter?.call(emailInput, 'admin@pys.internal ');
        emailInput.dispatchEvent(new Event('input', { bubbles: true }));

        nativeInputValueSetter?.call(passwordInput, 'SecretPassword123');
        passwordInput.dispatchEvent(new Event('input', { bubbles: true }));
      });

      await act(async () => {
        form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
      });

      expect(loginMock).toHaveBeenCalledWith('admin@pys.internal', 'SecretPassword123');

      cleanup();
    });

    it('shows validation warning when submitting empty fields', async () => {
      const loginMock = vi.fn();
      const { container, cleanup } = renderWithAuth(<Login />, { login: loginMock });

      const form = container.querySelector('form') as HTMLFormElement;

      await act(async () => {
        form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
      });

      expect(loginMock).not.toHaveBeenCalled();
      expect(container.textContent).toContain('Please enter your work email address');

      cleanup();
    });
  });

  describe('Staff Management Component (Role Authorization)', () => {
    it('restricts access with 403 Forbidden banner when user has role STAFF', () => {
      const staffUser: UserProfile = {
        id: 'staff-1',
        email: 'staff@pys.internal',
        fullName: 'Field Staff',
        role: 'STAFF',
        isActive: true,
      };

      const { container, cleanup } = renderWithAuth(<StaffManagement />, {
        user: staffUser,
      });

      expect(container.textContent).toContain('Access Restricted');
      expect(container.textContent).toContain(
        'Staff Management and credential provisioning is strictly reserved for the Administrator.'
      );
      expect(container.querySelector('table')).toBeNull();

      cleanup();
    });

    it('renders staff directory and controls when user has role ADMIN', async () => {
      const adminUser: UserProfile = {
        id: 'admin-1',
        email: 'admin@pys.internal',
        fullName: 'Platform Admin',
        role: 'ADMIN',
        isActive: true,
      };

      const mockStaffList = [
        {
          id: 's-admin',
          profileId: 'p-admin',
          fullName: 'Platform Admin',
          email: 'admin@pys.internal',
          role: 'ADMIN' as const,
          isActive: true,
          phone: null,
          createdAt: '2026-10-01T00:00:00Z',
        },
        {
          id: 's-staff',
          profileId: 'p-staff',
          fullName: 'Technician Staff',
          email: 'staff@pys.internal',
          role: 'STAFF' as const,
          isActive: true,
          phone: '+91 9999988888',
          createdAt: '2026-10-02T00:00:00Z',
        },
      ];

      vi.spyOn(apiClient, 'get').mockResolvedValueOnce({
        staff: mockStaffList,
      });

      const { container, cleanup } = renderWithAuth(<StaffManagement />, {
        user: adminUser,
      });

      expect(container.textContent).toContain('Staff Management');
      expect(container.textContent).toContain('Admin Singleton Enforced');

      // Wait for table to render
      await act(async () => {
        await Promise.resolve();
      });

      expect(container.textContent).toContain('Platform Admin');
      expect(container.textContent).toContain('Technician Staff');
      expect(container.textContent).toContain('Singleton Admin');
      expect(container.textContent).toContain('Deactivate');

      cleanup();
    });

    it('prevents deactivating singleton admin account', async () => {
      const adminUser: UserProfile = {
        id: 'admin-1',
        email: 'admin@pys.internal',
        fullName: 'Platform Admin',
        role: 'ADMIN',
        isActive: true,
      };

      const mockStaffList = [
        {
          id: 's-admin',
          profileId: 'p-admin',
          fullName: 'Platform Admin',
          email: 'admin@pys.internal',
          role: 'ADMIN' as const,
          isActive: true,
          phone: null,
          createdAt: '2026-10-01T00:00:00Z',
        },
      ];

      vi.spyOn(apiClient, 'get').mockResolvedValueOnce({
        staff: mockStaffList,
      });

      const { container, cleanup } = renderWithAuth(<StaffManagement />, {
        user: adminUser,
      });

      await act(async () => {
        await Promise.resolve();
      });

      // Singleton Admin row displays "Singleton Admin" text rather than an active Deactivate button
      const adminRow = container.querySelector('tbody tr');
      expect(adminRow?.textContent).toContain('Singleton Admin');
      expect(adminRow?.querySelector('button.btn-outline')).toBeNull();

      cleanup();
    });
  });
});
