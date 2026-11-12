import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, it, expect, vi } from 'vitest';
import { ApiError, getApiErrorMessage } from '@/services/api/client';
import { addDaysIstIso, getIstTodayIso } from '@/utils/date';
import { LegalTermsModal } from '@/components/legal/LegalTermsModal';

// @ts-expect-error global React 19 test flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('Phase 1 Frontend Fixes (IST Dates, ApiError Extraction, Legal Print Sheet)', () => {
  it('computes Asia/Kolkata IST dates accurately past midnight UTC', () => {
    // 2026-11-12T18:45:00Z === 2026-11-13 00:15 IST
    const instant = new Date('2026-11-12T18:45:00.000Z');
    expect(getIstTodayIso(instant)).toBe('2026-11-13');
    expect(addDaysIstIso('2026-11-13', 2)).toBe('2026-11-15');
  });

  it('extracts message cleanly from ApiError, Axios-like objects, or fallback', () => {
    expect(getApiErrorMessage(new ApiError(400, 'BAD', 'PIN expired'), 'Fallback')).toBe('PIN expired');
    expect(getApiErrorMessage({ response: { data: { error: { message: 'Remote error' } } } }, 'Fallback')).toBe('Remote error');
    expect(getApiErrorMessage({}, 'Fallback')).toBe('Fallback');
  });

  it('marks LegalTermsModal content with legal-printable-sheet and no-print tab controls', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<LegalTermsModal isOpen={true} onClose={vi.fn()} initialTab="privacy" />);
    });

    const sheet = document.querySelector('.legal-printable-sheet');
    expect(sheet).not.toBeNull();
    expect(sheet?.querySelector('.legal-print-body')).not.toBeNull();
    expect(sheet?.querySelector('.no-print')).not.toBeNull();
    expect(document.body.textContent).toContain('Print Terms');

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });
});
