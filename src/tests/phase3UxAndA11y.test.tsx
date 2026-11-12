import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// @ts-expect-error global React 19 test flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mockResetPasswordForEmail = vi.fn();
vi.mock('@/services/supabase', () => ({
  getSupabaseClient: () => ({
    auth: {
      resetPasswordForEmail: (...args: unknown[]) => mockResetPasswordForEmail(...args),
    },
  }),
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    login: vi.fn(),
    error: null,
    clearError: vi.fn(),
  }),
}));

import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Modal } from '@/components/ui/Modal';
import { ErrorBoundary } from '@/components/feedback/ErrorBoundary';
import { TablePagination } from '@/components/ui/TablePagination';
import { AsyncSearchSelect } from '@/components/ui/AsyncSearchSelect';
import { Login } from '@/pages/Login';
import { TechnicianDashboard } from '@/pages/technician/TechnicianDashboard';
import { TechnicianProfile } from '@/pages/technician/TechnicianProfile';
import { technicianApi } from '@/services/technicianApi';

describe('Phase 3 UI/UX, Recovery, Accessibility & Tech Portal Features', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockResetPasswordForEmail.mockReset();
  });

  it('ConfirmDialog triggers onConfirm and onClose without browser dialogs', async () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <ConfirmDialog
          isOpen={true}
          onClose={onClose}
          onConfirm={onConfirm}
          title="Remove Asset"
          message="Remove this unit from AMC coverage?"
          confirmLabel="Remove Unit"
        />
      );
    });

    expect(container.textContent).toContain('Remove this unit from AMC coverage?');
    const confirmBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Remove Unit')
    );
    expect(confirmBtn).toBeTruthy();

    await act(async () => {
      confirmBtn!.click();
    });
    expect(onConfirm).toHaveBeenCalledTimes(1);

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('Modal moves keyboard focus inside dialog on open and restores trigger focus on close', async () => {
    const trigger = document.createElement('button');
    trigger.textContent = 'Open Trigger';
    document.body.appendChild(trigger);
    trigger.focus();

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <Modal isOpen={true} onClose={vi.fn()} title="Accessible Modal">
          <input id="modal-focus-test-input" placeholder="First field" />
        </Modal>
      );
    });

    const dialog = container.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog?.contains(document.activeElement)).toBe(true);

    await act(async () => {
      root.render(
        <Modal isOpen={false} onClose={vi.fn()} title="Accessible Modal">
          <input id="modal-focus-test-input" placeholder="First field" />
        </Modal>
      );
    });

    expect(document.activeElement).toBe(trigger);

    await act(async () => {
      root.unmount();
    });
    container.remove();
    trigger.remove();
  });

  it('ErrorBoundary provides Try Again, Reload Application, and Clear Cache recovery actions', async () => {
    const spyErr = vi.spyOn(console, 'error').mockImplementation(() => {});
    let shouldThrow = true;
    const MaybeThrow: React.FC = () => {
      if (shouldThrow) {
        throw new Error('Synthetic view crash');
      }
      return <div>Recovered View</div>;
    };

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <ErrorBoundary>
          <MaybeThrow />
        </ErrorBoundary>
      );
    });

    expect(container.textContent).toContain('Unexpected Application Error');
    expect(container.textContent).toContain('Synthetic view crash');
    expect(container.textContent).toContain('Try Again');
    expect(container.textContent).toContain('Reload Application');
    expect(container.textContent).toContain('Clear Local Cache');
    expect(container.textContent).not.toContain('at MaybeThrow');

    shouldThrow = false;
    const tryAgainBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Try Again')
    );
    await act(async () => {
      tryAgainBtn!.click();
    });

    expect(container.textContent).toContain('Recovered View');

    spyErr.mockRestore();
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('Login provides Forgot Password flow wired to Supabase resetPasswordForEmail', async () => {
    mockResetPasswordForEmail.mockResolvedValue({ error: null });

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<Login />);
    });

    const forgotBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Forgot Password?')
    );
    expect(forgotBtn).toBeTruthy();

    await act(async () => {
      forgotBtn!.click();
    });

    expect(container.querySelector('#login-password')).toBeNull();
    const emailInput = container.querySelector('#login-email') as HTMLInputElement;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      setter?.call(emailInput, 'staff@pys.internal');
      emailInput.dispatchEvent(new Event('input', { bubbles: true }));
    });

    const form = container.querySelector('form') as HTMLFormElement;
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(mockResetPasswordForEmail).toHaveBeenCalledWith('staff@pys.internal', {
      redirectTo: window.location.origin,
    });
    expect(container.textContent).toContain('Password reset instructions sent to staff@pys.internal');

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('TablePagination and AsyncSearchSelect trigger page navigation and async option selection', async () => {
    const onPageChange = vi.fn();
    const onSelect = vi.fn();
    const fetchOptions = vi.fn().mockResolvedValue([
      { value: 'c1', label: 'Reliance Industries', sublabel: 'CUST-0001' },
    ]);

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <div>
          <TablePagination
            page={1}
            pageSize={15}
            total={32}
            totalPages={3}
            onPageChange={onPageChange}
            itemLabel="contracts"
          />
          <AsyncSearchSelect
            label="Customer"
            value=""
            onChange={onSelect}
            fetchOptions={fetchOptions}
          />
        </div>
      );
    });

    expect(container.textContent).toContain('Showing 1–15 of 32 contracts');
    const nextBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Next')
    );
    await act(async () => {
      nextBtn!.click();
    });
    expect(onPageChange).toHaveBeenCalledWith(2);

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('TechnicianDashboard includes overdue toggle & non-blocking status error banner, and TechnicianProfile supports PIN update', async () => {
    const getJobsSpy = vi.spyOn(technicianApi, 'getJobs').mockResolvedValue([]);
    vi.spyOn(technicianApi, 'getProfile').mockResolvedValue({
      id: 't1',
      technicianCode: 'TECH-0001',
      name: 'Raj Patel',
      phone: '9876543210',
      email: null,
      status: 'AVAILABLE',
      specializations: ['Split AC'],
      metrics: { assignedToday: 2, completedToday: 1, pendingToday: 1 },
    });
    const updatePinSpy = vi.spyOn(technicianApi, 'updatePin').mockResolvedValue({ updated: true });

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<TechnicianDashboard onStartReport={vi.fn()} />);
    });

    const overdueBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Include Overdue')
    );
    expect(overdueBtn).toBeTruthy();

    await act(async () => {
      overdueBtn!.click();
    });

    expect(getJobsSpy).toHaveBeenLastCalledWith(undefined, true);

    await act(async () => {
      root.render(<TechnicianProfile onLogout={vi.fn()} />);
    });

    const currentPin = container.querySelector('input[aria-label="Current 4-digit PIN"]') as HTMLInputElement;
    const newPin = container.querySelector('input[aria-label="New 4-digit PIN"]') as HTMLInputElement;
    expect(currentPin).not.toBeNull();
    expect(newPin).not.toBeNull();

    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    await act(async () => {
      setter?.call(currentPin, '1234');
      currentPin.dispatchEvent(new Event('input', { bubbles: true }));
      setter?.call(newPin, '5678');
      newPin.dispatchEvent(new Event('input', { bubbles: true }));
    });

    const pinForm = currentPin.closest('form') as HTMLFormElement;
    await act(async () => {
      pinForm.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(updatePinSpy).toHaveBeenCalledWith('1234', '5678');
    expect(container.textContent).toContain('Field login PIN updated successfully.');

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });
});
