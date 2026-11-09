import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act } from 'react';

// Tell React 19 that act is supported in jsdom
// @ts-expect-error global React flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
import { createRoot } from 'react-dom/client';
import { LegalTermsModal } from '@/components/legal/LegalTermsModal';
import { LEGAL_ENTITIES, GRIEVANCE_OFFICER, LEGAL_DISCLAIMERS } from '@/config/legalTerms';

describe('Legal Terms & DPDP Privacy Framework Suite', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const renderComponent = async (ui: React.ReactNode) => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(ui);
    });

    return {
      container,
      unmount: () => {
        act(() => {
          root.unmount();
        });
        container.remove();
      },
    };
  };

  it('renders LegalTermsModal with Data Fiduciary and Data Processor badges', async () => {
    const handleClose = vi.fn();
    const { container, unmount } = await renderComponent(
      <LegalTermsModal isOpen={true} onClose={handleClose} initialTab="privacy" />
    );

    expect(container.textContent).toContain('Legal, Privacy & Security Framework');
    expect(container.textContent).toContain('Data Fiduciary & Commercial Entity');
    expect(container.textContent).toContain(LEGAL_ENTITIES.commercial.name);
    expect(container.textContent).toContain('Data Processor & Platform');
    expect(container.textContent).toContain(LEGAL_ENTITIES.platform.name);

    unmount();
  });

  it('navigates across all tabs cleanly', async () => {
    const handleClose = vi.fn();
    const { container, unmount } = await renderComponent(
      <LegalTermsModal isOpen={true} onClose={handleClose} initialTab="privacy" />
    );

    // Privacy tab initially visible
    expect(container.textContent).toContain('Compliance Notice under Digital Personal Data Protection Act');

    // Switch to Terms of Service
    const buttons = Array.from(container.querySelectorAll('button'));
    const termsBtn = buttons.find((b) => b.textContent?.includes('Terms of Service'));
    expect(termsBtn).toBeDefined();

    await act(async () => {
      termsBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(container.textContent).toContain('Commercial Terms & Electronic Agreement');

    // Switch to Security Architecture
    const securityBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Security Architecture')
    );
    expect(securityBtn).toBeDefined();

    await act(async () => {
      securityBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(container.textContent).toContain('Defense-in-Depth Information Security Standards');

    // Switch to Storage & Cookies
    const storageBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Storage & Cookies')
    );
    expect(storageBtn).toBeDefined();

    await act(async () => {
      storageBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(container.textContent).toContain('Local Storage Usage Disclosure');

    // Switch to Grievance Redressal
    const grievanceBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Grievance Redressal')
    );
    expect(grievanceBtn).toBeDefined();

    await act(async () => {
      grievanceBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(container.textContent).toContain('Designated Grievance Redressal Officer');
    expect(container.textContent).toContain(GRIEVANCE_OFFICER.email);
    expect(container.textContent).toContain(GRIEVANCE_OFFICER.phone);

    unmount();
  });

  it('contains statutory compliance notices in disclaimers', () => {
    expect(LEGAL_DISCLAIMERS.invoiceFooter).toContain('Section 65B of the IT Act, 2000');
    expect(LEGAL_DISCLAIMERS.invoiceFooter).toContain('Digital Personal Data Protection Act, 2023');
    expect(LEGAL_DISCLAIMERS.quotationFooter).toContain('Extreme Sales & Services');
    expect(LEGAL_DISCLAIMERS.serviceReportFooter).toContain('Place Your Service');
  });

  it('triggers onClose when Close button is clicked', async () => {
    const handleClose = vi.fn();
    const { container, unmount } = await renderComponent(
      <LegalTermsModal isOpen={true} onClose={handleClose} />
    );

    const closeBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Close'
    );
    expect(closeBtn).toBeDefined();

    await act(async () => {
      closeBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(handleClose).toHaveBeenCalledTimes(1);

    unmount();
  });
});
