import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getSupabaseClient } from '../src/lib/supabase.js';
import { nextBusinessNumber, nextBusinessNumbers } from '../src/utils/businessNumber.js';

vi.mock('../src/lib/supabase.js', () => ({
  getSupabaseClient: vi.fn(),
}));

const rpc = vi.fn();

describe('business number helper', () => {
  beforeEach(() => {
    rpc.mockReset();
    vi.mocked(getSupabaseClient).mockReturnValue({ rpc } as any);
  });

  it('uses the database counter when it is available', async () => {
    rpc.mockResolvedValue({ data: ['SR-2026-958878'], error: null });
    const fallback = vi.fn(() => 'SR-2026-123456');

    await expect(nextBusinessNumber('SERVICE_REQUEST', fallback)).resolves.toBe('SR-2026-958878');
    expect(rpc).toHaveBeenCalledWith('generate_business_numbers', { p_kind: 'SERVICE_REQUEST', p_count: 1 });
    expect(fallback).not.toHaveBeenCalled();
  });

  it('reserves several numbers in one call', async () => {
    rpc.mockResolvedValue({ data: ['PM-2026-000025', 'PM-2026-000026'], error: null });
    await expect(nextBusinessNumbers('PM_SCHEDULE', 2, () => [])).resolves.toEqual([
      'PM-2026-000025',
      'PM-2026-000026',
    ]);
  });

  it('falls back to the legacy generator when the function is missing', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'Could not find the function' } });
    await expect(nextBusinessNumber('CUSTOMER', () => 'CUST-111111')).resolves.toBe('CUST-111111');
  });

  it('falls back when the call throws or returns the wrong count', async () => {
    rpc.mockRejectedValueOnce(new Error('network down'));
    await expect(nextBusinessNumber('ENQUIRY', () => 'ENQ-222222')).resolves.toBe('ENQ-222222');

    rpc.mockResolvedValueOnce({ data: ['SCH-2026-000001'], error: null });
    await expect(nextBusinessNumbers('SCHEDULE', 2, (n) => Array(n).fill('X'))).resolves.toEqual(['X', 'X']);
  });

  it('returns nothing for a zero count without calling the database', async () => {
    await expect(nextBusinessNumbers('PAYMENT', 0, () => ['never'])).resolves.toEqual([]);
    expect(rpc).not.toHaveBeenCalled();
  });
});
