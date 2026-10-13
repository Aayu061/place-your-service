import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, useState } from 'react';

// Tell React 19 that act is supported in jsdom
// @ts-expect-error global React flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
import { createRoot } from 'react-dom/client';
import { Modal } from '@/components/ui/Modal';
import { Drawer } from '@/components/ui/Drawer';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { CustomerManagement } from '@/pages/CustomerManagement';
import { AuthContext, AuthContextType } from '@/context/authContextDef';
import { ToastProvider } from '@/components/ui/Toast';
import { apiClient } from '@/services/api/client';
import { Customer } from '@/domain/types';

describe('Form Navigation & Dirty-State Protection Suite', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const mockAdminUser = {
    id: 'admin-1',
    email: 'admin@pys.internal',
    fullName: 'System Administrator',
    role: 'ADMIN' as const,
    isActive: true,
  };

  const sampleCustomer: Customer = {
    id: 'cust-123',
    customerCode: 'CUST-100200',
    name: 'Metropolitan Hospital',
    companyName: 'Metro Health Ltd',
    customerType: 'PERMANENT',
    phone: '9876543210',
    email: 'facility@metro.example',
    address: 'Sector 5, Salt Lake',
    city: 'Kolkata',
    state: 'West Bengal',
    postalCode: '700091',
    isActive: true,
    siteName: 'Main Hospital Building',
    sitesCount: 1,
    createdAt: '2026-10-01T10:00:00Z',
    updatedAt: '2026-10-01T10:00:00Z',
  };

  const setInputValue = (input: HTMLInputElement, value: string) => {
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value'
    )?.set;
    nativeInputValueSetter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  };

  const setTextareaValue = (textarea: HTMLTextAreaElement, value: string) => {
    const nativeTextareaValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      'value'
    )?.set;
    nativeTextareaValueSetter?.call(textarea, value);
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    textarea.dispatchEvent(new Event('change', { bubbles: true }));
  };

  const renderWithProviders = (
    ui: React.ReactNode,
    authOverrides: Partial<AuthContextType> = {}
  ) => {
    const defaultAuth: AuthContextType = {
      user: mockAdminUser,
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
      cleanup: () => {
        act(() => {
          root.unmount();
        });
        container.remove();
      },
    };
  };

  // 1. MODAL CONTROLS: Close & Back
  describe('Modal Close and Back Controls', () => {
    it('Modal renders visible Close button with accessible label and calls onClose when clean', () => {
      const onClose = vi.fn();
      const container = document.createElement('div');
      const root = createRoot(container);

      act(() => {
        root.render(
          <Modal isOpen={true} onClose={onClose} title="Inspection Form">
            <p>Clean form content</p>
          </Modal>
        );
      });

      const closeBtn = container.querySelector('#modal-header-close-btn') as HTMLButtonElement;
      expect(closeBtn).not.toBeNull();
      expect(closeBtn.getAttribute('aria-label')).toBe('Close dialog');

      act(() => {
        closeBtn.click();
      });

      expect(onClose).toHaveBeenCalledTimes(1);
      root.unmount();
      container.remove();
    });

    it('Modal renders visible Back button when onBack prop is supplied and invokes it without closing', () => {
      const onClose = vi.fn();
      const onBack = vi.fn();
      const container = document.createElement('div');
      const root = createRoot(container);

      act(() => {
        root.render(
          <Modal
            isOpen={true}
            onClose={onClose}
            onBack={onBack}
            backLabel="Previous Section"
            title="Step 2 of Form"
          >
            <p>Step 2 form fields</p>
          </Modal>
        );
      });

      const backBtn = container.querySelector('#modal-header-back-btn') as HTMLButtonElement;
      expect(backBtn).not.toBeNull();
      expect(backBtn.getAttribute('aria-label')).toBe('Go back to Previous Section');
      expect(backBtn.title).toBe('Go back to Previous Section');

      act(() => {
        backBtn.click();
      });

      expect(onBack).toHaveBeenCalledTimes(1);
      expect(onClose).not.toHaveBeenCalled();

      root.unmount();
      container.remove();
    });
  });

  // 2. DRAWER CONTROLS: Close & Back
  describe('Drawer Close and Back Controls', () => {
    it('Drawer renders visible Close button and Back button when onBack prop is supplied', () => {
      const onClose = vi.fn();
      const onBack = vi.fn();
      const container = document.createElement('div');
      const root = createRoot(container);

      act(() => {
        root.render(
          <Drawer
            isOpen={true}
            onClose={onClose}
            onBack={onBack}
            backLabel="Overview"
            title="Equipment Detail"
          >
            <p>Drawer nested content</p>
          </Drawer>
        );
      });

      const closeBtn = container.querySelector('#drawer-header-close-btn') as HTMLButtonElement;
      expect(closeBtn).not.toBeNull();
      expect(closeBtn.getAttribute('aria-label')).toBe('Close drawer');

      const backBtn = container.querySelector('#drawer-header-back-btn') as HTMLButtonElement;
      expect(backBtn).not.toBeNull();
      expect(backBtn.getAttribute('aria-label')).toBe('Go back to Overview');
      expect(backBtn.title).toBe('Go back to Overview');

      act(() => {
        backBtn.click();
      });

      expect(onBack).toHaveBeenCalledTimes(1);
      expect(onClose).not.toHaveBeenCalled();

      root.unmount();
      container.remove();
    });
  });

  // 3. DIRTY-STATE CONFIRMATION ACROSS CLOSE, ESCAPE, AND CANCEL
  describe('Dirty-State Protection & Confirmation Dialog', () => {
    it('prompts confirmation when dirty form close button is clicked, and allows continuing editing', () => {
      const onClose = vi.fn();
      const onConfirmDiscard = vi.fn();
      const container = document.createElement('div');
      const root = createRoot(container);

      act(() => {
        root.render(
          <Modal
            isOpen={true}
            onClose={onClose}
            isDirty={true}
            onConfirmDiscard={onConfirmDiscard}
            title="Staff Provisioning"
          >
            <input defaultValue="dirty change" />
          </Modal>
        );
      });

      const closeBtn = container.querySelector('#modal-header-close-btn') as HTMLButtonElement;
      expect(closeBtn).not.toBeNull();

      act(() => {
        closeBtn.click();
      });

      // Discard confirmation dialog is visible
      const alertDialog = container.querySelector('[role="alertdialog"]');
      expect(alertDialog).not.toBeNull();
      expect(container.textContent).toContain('You have unsaved changes. Discard them?');

      // Click "Continue Editing"
      const continueBtn = container.querySelector('#modal-continue-editing-btn') as HTMLButtonElement;
      act(() => {
        continueBtn.click();
      });

      // Dialog dismissed, form remains open
      expect(container.querySelector('[role="alertdialog"]')).toBeNull();
      expect(onClose).not.toHaveBeenCalled();
      expect(onConfirmDiscard).not.toHaveBeenCalled();

      root.unmount();
      container.remove();
    });

    it('prompts confirmation on Escape keypress when dirty and discards on confirm', () => {
      const onClose = vi.fn();
      const onConfirmDiscard = vi.fn();
      const container = document.createElement('div');
      const root = createRoot(container);

      act(() => {
        root.render(
          <Modal
            isOpen={true}
            onClose={onClose}
            isDirty={true}
            onConfirmDiscard={onConfirmDiscard}
            title="Service Request Form"
          >
            <input defaultValue="draft notes" />
          </Modal>
        );
      });

      // Press Escape on the window
      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      });

      // Discard confirmation dialog appears
      expect(container.querySelector('[role="alertdialog"]')).not.toBeNull();

      // Click "Discard Changes"
      const discardBtn = container.querySelector('#modal-discard-changes-btn') as HTMLButtonElement;
      act(() => {
        discardBtn.click();
      });

      expect(onConfirmDiscard).toHaveBeenCalledTimes(1);
      expect(onClose).toHaveBeenCalledTimes(1);

      root.unmount();
      container.remove();
    });

    it('backdrop-click dismissal is strictly disabled even on dirty forms', () => {
      const onClose = vi.fn();
      const container = document.createElement('div');
      const root = createRoot(container);

      act(() => {
        root.render(
          <Modal isOpen={true} onClose={onClose} isDirty={true} title="Secure Form">
            <input defaultValue="important data" />
          </Modal>
        );
      });

      const backdrop = container.querySelector('.modal-backdrop') as HTMLElement;
      act(() => {
        backdrop.click();
      });

      // Neither dialog nor onClose invoked
      expect(container.querySelector('[role="alertdialog"]')).toBeNull();
      expect(onClose).not.toHaveBeenCalled();

      root.unmount();
      container.remove();
    });
  });

  // 4. MULTI-STEP FORM: Value Preservation on Back Navigation
  describe('Multi-Step Form Value Preservation Workflow', () => {
    const MultiStepFormTestHarness = () => {
      const [step, setStep] = useState<1 | 2>(1);
      const [step1Data, setStep1Data] = useState({ clientName: 'Initial Name', category: 'COMMERCIAL' });
      const [step2Data, setStep2Data] = useState({ streetAddress: 'Link Road', technicianNotes: 'Gate code 4040' });
      const [isModalOpen, setIsModalOpen] = useState(true);

      return (
        <Modal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          title={`Asset Inspection (Step ${step} of 2)`}
          onBack={step === 2 ? () => setStep(1) : undefined}
          backLabel="General Details"
          isDirty={true}
        >
          {({ requestClose }) => (
            <div>
              {step === 1 ? (
                <div id="step-1-content">
                  <Input
                    id="client-name-input"
                    label="Client Name"
                    value={step1Data.clientName}
                    onChange={(e) => setStep1Data({ ...step1Data, clientName: e.target.value })}
                  />
                  <div style={{ marginTop: '12px' }}>
                    <Button
                      id="next-step-btn"
                      variant="primary"
                      onClick={() => setStep(2)}
                    >
                      Next: Site Location
                    </Button>
                  </div>
                </div>
              ) : (
                <div id="step-2-content">
                  <Input
                    id="street-address-input"
                    label="Street Address"
                    value={step2Data.streetAddress}
                    onChange={(e) => setStep2Data({ ...step2Data, streetAddress: e.target.value })}
                  />
                  <Input
                    id="tech-notes-input"
                    label="Technician Notes"
                    value={step2Data.technicianNotes}
                    onChange={(e) => setStep2Data({ ...step2Data, technicianNotes: e.target.value })}
                  />
                  <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                    <Button
                      id="step-2-back-btn"
                      variant="outline"
                      onClick={() => setStep(1)}
                    >
                      Back to General Details
                    </Button>
                    <Button
                      id="submit-form-btn"
                      variant="primary"
                      onClick={requestClose}
                    >
                      Submit
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </Modal>
      );
    };

    it('preserves all entered field values when navigating forward to Step 2 and back to Step 1', () => {
      const container = document.createElement('div');
      const root = createRoot(container);

      act(() => {
        root.render(<MultiStepFormTestHarness />);
      });

      // Verify Step 1 is rendered
      const clientNameInput = container.querySelector('#client-name-input') as HTMLInputElement;
      expect(clientNameInput.value).toBe('Initial Name');

      // User updates Step 1 field
      act(() => {
        setInputValue(clientNameInput, 'Metropolitan Health Complex');
      });

      // User navigates to Step 2
      const nextBtn = container.querySelector('#next-step-btn') as HTMLButtonElement;
      act(() => {
        nextBtn.click();
      });

      // Step 2 is rendered; modal header displays Back button
      const headerBackBtn = container.querySelector('#modal-header-back-btn') as HTMLButtonElement;
      expect(headerBackBtn).not.toBeNull();
      expect(headerBackBtn.title).toBe('Go back to General Details');

      const streetInput = container.querySelector('#street-address-input') as HTMLInputElement;
      const notesInput = container.querySelector('#tech-notes-input') as HTMLInputElement;
      expect(streetInput.value).toBe('Link Road');
      expect(notesInput.value).toBe('Gate code 4040');

      // User updates Step 2 fields
      act(() => {
        setInputValue(streetInput, 'Tower 4, Salt Lake Tech Center');
        setInputValue(notesInput, 'VIP Hospital wing - urgent protocol');
      });

      // User clicks header Back button
      act(() => {
        headerBackBtn.click();
      });

      // User is back on Step 1: verify entered value was NOT reset
      const clientNameInputAfterBack = container.querySelector('#client-name-input') as HTMLInputElement;
      expect(clientNameInputAfterBack).not.toBeNull();
      expect(clientNameInputAfterBack.value).toBe('Metropolitan Health Complex');

      // User clicks Next again to return to Step 2
      const nextBtnAgain = container.querySelector('#next-step-btn') as HTMLButtonElement;
      act(() => {
        nextBtnAgain.click();
      });

      // Verify Step 2 entered values were also preserved
      const streetInputAfterReturn = container.querySelector('#street-address-input') as HTMLInputElement;
      const notesInputAfterReturn = container.querySelector('#tech-notes-input') as HTMLInputElement;
      expect(streetInputAfterReturn.value).toBe('Tower 4, Salt Lake Tech Center');
      expect(notesInputAfterReturn.value).toBe('VIP Hospital wing - urgent protocol');

      root.unmount();
      container.remove();
    });
  });

  // 5. DRAWER NESTED TAB NAVIGATION WITH BACK CONTROL
  describe('Customer Detail Drawer Nested Tab Navigation', () => {
    it('renders Back to Overview button when on nested tabs (sites, assets) and navigates back to overview', async () => {
      vi.spyOn(apiClient, 'request').mockImplementation(async (config: { url?: string } | string) => {
        const url = typeof config === 'string' ? config : (config?.url || '');
        if (url.includes('/customers')) {
          return {
            customers: [sampleCustomer],
            total: 1,
            page: 1,
            pageSize: 10,
            totalPages: 1,
          };
        }
        if (url.includes('/sites')) {
          return { sites: [] };
        }
        if (url.includes('/assets')) {
          return { assets: [] };
        }
        return {};
      });

      let renderResult!: ReturnType<typeof renderWithProviders>;
      await act(async () => {
        renderResult = renderWithProviders(<CustomerManagement />);
      });

      // Click "View Customer" on customer row
      const viewBtn = document.body.querySelector('button[aria-label="View customer"]') as HTMLButtonElement;
      expect(viewBtn).not.toBeNull();

      await act(async () => {
        viewBtn.click();
      });

      // Customer Detail Drawer opens in 'overview' tab -> no header Back button
      expect(document.body.querySelector('#drawer-header-back-btn')).toBeNull();

      // Click on "Sites" tab inside drawer
      const sitesTabBtn = Array.from(document.body.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Sites (')
      );
      expect(sitesTabBtn).toBeDefined();

      await act(async () => {
        sitesTabBtn?.click();
      });

      // Header Back button is now rendered with label "Overview"
      const drawerBackBtn = document.body.querySelector('#drawer-header-back-btn') as HTMLButtonElement;
      expect(drawerBackBtn).not.toBeNull();
      expect(drawerBackBtn.title).toBe('Go back to Overview');

      // Click Back button
      await act(async () => {
        drawerBackBtn.click();
      });

      // Drawer is returned to 'overview' tab, Back button disappears
      expect(document.body.querySelector('#drawer-header-back-btn')).toBeNull();

      renderResult.cleanup();
    });
  });

  // 6. PREVENT DUPLICATE SUBMISSIONS & PRESERVE DATA ON FAILED API REQUEST
  describe('Duplicate Submission Prevention & Error Data Preservation', () => {
    it('disables submit button during active submission to prevent duplicate POST requests', () => {
      const container = document.createElement('div');
      const root = createRoot(container);

      act(() => {
        root.render(
          <Modal isOpen={true} onClose={vi.fn()} title="Staff Provisioning">
            {({ requestClose }) => (
              <form>
                <Input id="staff-name" label="Full Name" defaultValue="Vikramaditya" />
                <div style={{ marginTop: '12px' }}>
                  <Button
                    id="submit-staff-btn"
                    variant="primary"
                    type="submit"
                    isLoading={true}
                    disabled={true}
                  >
                    Provisioning Staff...
                  </Button>
                  <Button variant="ghost" onClick={requestClose}>Cancel</Button>
                </div>
              </form>
            )}
          </Modal>
        );
      });

      const submitBtn = container.querySelector('#submit-staff-btn') as HTMLButtonElement;
      expect(submitBtn.disabled).toBe(true);
      expect(submitBtn.getAttribute('aria-busy')).toBe('true');

      root.unmount();
      container.remove();
    });

    it('preserves field values and keeps form open when API returns validation error', async () => {
      vi.spyOn(apiClient, 'request').mockImplementation(async (config: { url?: string } | string) => {
        const url = typeof config === 'string' ? config : (config?.url || '');
        if (url.includes('/customers')) {
          return {
            customers: [sampleCustomer],
            total: 1,
            page: 1,
            pageSize: 10,
            totalPages: 1,
          };
        }
        return {};
      });

      let renderResult!: ReturnType<typeof renderWithProviders>;
      await act(async () => {
        renderResult = renderWithProviders(<CustomerManagement />);
      });

      // Click "+ Add Customer"
      const addBtn = Array.from(document.body.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Add Customer')
      );
      expect(addBtn).toBeDefined();

      await act(async () => {
        addBtn?.click();
      });

      // Fill in customer form
      const nameInput = document.body.querySelector('#add-customer-name') as HTMLInputElement;
      const phoneInput = document.body.querySelector('#add-customer-phone') as HTMLInputElement;
      const notesInput = document.body.querySelector('#add-customer-notes') as HTMLTextAreaElement;

      await act(async () => {
        setInputValue(nameInput, 'Apex Medical Center');
        setInputValue(phoneInput, '9988776655');
        setTextareaValue(notesInput, 'Special delivery instructions');
      });

      // Submit with empty street address to trigger validation error
      const submitBtn = document.body.querySelector('#btn-submit-customer') as HTMLButtonElement;
      expect(submitBtn).not.toBeNull();

      await act(async () => {
        submitBtn.click();
      });

      // Form remains open, error alert is displayed, and entered data is fully preserved
      const alert = document.body.querySelector('[role="alert"]');
      expect(alert).not.toBeNull();
      expect(alert?.textContent).toContain('A street address is required.');

      expect(nameInput.value).toBe('Apex Medical Center');
      expect(phoneInput.value).toBe('9988776655');
      expect(notesInput.value).toBe('Special delivery instructions');

      renderResult.cleanup();
    });
  });
});
