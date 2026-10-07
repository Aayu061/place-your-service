import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CustomerService } from '../src/services/customer.service.js';
import * as supabaseLib from '../src/lib/supabase.js';
import { ConflictError, NotFoundError } from '../src/utils/errors.js';

describe('CustomerService Unit Tests', () => {
  let customerService: CustomerService;

  beforeEach(() => {
    vi.restoreAllMocks();
    customerService = new CustomerService();
  });

  const sampleCustId = '33333333-3333-3333-3333-333333333333';
  const sampleCustomerData = {
    id: sampleCustId,
    customer_code: 'CUST-999888',
    name: 'Apex Refrigeration',
    company_name: 'Apex Industries',
    email: 'contact@apex.example',
    phone: '9123456780',
    alternate_phone: null,
    address: '404 Industrial Corridor',
    city: 'Pune',
    state: 'Maharashtra',
    postal_code: '411001',
    customer_type: 'TEMPORARY',
    notes: 'Urgent cooling repair needed',
    is_active: true,
    created_by: 'actor-id',
    updated_by: 'actor-id',
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
    customer_sites: [],
  };

  describe('Duplicate Detection', () => {
    it('throws ConflictError when phone and name match existing active customer', async () => {
      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({
                data: [
                  {
                    id: 'other-cust',
                    customer_code: 'CUST-001',
                    name: 'Apex Refrigeration',
                    email: 'other@apex.example',
                    phone: '9123456780',
                    is_active: true,
                  },
                ],
                error: null,
              }),
            }),
          }),
        }),
      } as unknown as ReturnType<typeof supabaseLib.getSupabaseClient>;

      vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue(mockSupabase);

      await expect(
        customerService.checkPotentialDuplicate('9123456780', 'Apex Refrigeration')
      ).rejects.toThrow(ConflictError);
    });

    it('allows same phone for different customer name / different contact person', async () => {
      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({
                data: [
                  {
                    id: 'other-cust',
                    customer_code: 'CUST-001',
                    name: 'Different Person',
                    email: 'diff@example.com',
                    phone: '9123456780',
                    is_active: true,
                  },
                ],
                error: null,
              }),
            }),
          }),
        }),
      } as unknown as ReturnType<typeof supabaseLib.getSupabaseClient>;

      vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue(mockSupabase);

      await expect(
        customerService.checkPotentialDuplicate('9123456780', 'Apex Refrigeration')
      ).resolves.toBeUndefined();
    });

    it('ignores self-record during update check when excludeCustomerId is provided', async () => {
      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                neq: vi.fn().mockResolvedValue({
                  data: [],
                  error: null,
                }),
              }),
            }),
          }),
        }),
      } as unknown as ReturnType<typeof supabaseLib.getSupabaseClient>;

      vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue(mockSupabase);

      await expect(
        customerService.checkPotentialDuplicate('9123456780', 'Apex Refrigeration', undefined, sampleCustId)
      ).resolves.toBeUndefined();
    });
  });

  describe('Single Customer Retrieval', () => {
    it('throws NotFoundError when customer UUID does not exist', async () => {
      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: null,
                error: null,
              }),
            }),
          }),
        }),
      } as unknown as ReturnType<typeof supabaseLib.getSupabaseClient>;

      vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue(mockSupabase);

      await expect(
        customerService.getCustomerById('non-existent-id')
      ).rejects.toThrow(NotFoundError);
    });

    it('returns formatted CustomerResponse when customer is found', async () => {
      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: sampleCustomerData,
                error: null,
              }),
            }),
          }),
        }),
      } as unknown as ReturnType<typeof supabaseLib.getSupabaseClient>;

      vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue(mockSupabase);

      const customer = await customerService.getCustomerById(sampleCustId);
      expect(customer.id).toBe(sampleCustId);
      expect(customer.name).toBe('Apex Refrigeration');
      expect(customer.customerCode).toBe('CUST-999888');
      expect(customer.customerType).toBe('TEMPORARY');
    });
  });

  describe('Temporary -> Permanent Conversion Business Invariants', () => {
    it('updates customer_type to PERMANENT while strictly preserving ID and customer_code', async () => {
      let fetchCount = 0;
      const mockSupabase = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'customers') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockImplementation(() => {
                    fetchCount++;
                    return Promise.resolve({
                      data: {
                        ...sampleCustomerData,
                        customer_type: fetchCount === 1 ? 'TEMPORARY' : 'PERMANENT',
                      },
                      error: null,
                    });
                  }),
                }),
              }),
              update: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ error: null }),
              }),
            };
          }
          if (table === 'activity_logs') {
            return { insert: vi.fn().mockResolvedValue({ error: null }) };
          }
          return {};
        }),
      } as unknown as ReturnType<typeof supabaseLib.getSupabaseClient>;

      vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue(mockSupabase);

      const result = await customerService.convertToPermanent(sampleCustId, 'actor-profile-id');

      expect(result.customer.customerType).toBe('PERMANENT');
      expect(result.customer.id).toBe(sampleCustId);
      expect(result.customer.customerCode).toBe('CUST-999888');
      expect(result.alreadyPermanent).toBe(false);
      expect(result.message).toContain('successfully converted to PERMANENT');
    });

    it('is idempotent and returns no-op when customer is already PERMANENT', async () => {
      const permanentData = {
        ...sampleCustomerData,
        customer_type: 'PERMANENT',
      };

      const mockSupabase = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'customers') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: permanentData,
                    error: null,
                  }),
                }),
              }),
            };
          }
          return {};
        }),
      } as unknown as ReturnType<typeof supabaseLib.getSupabaseClient>;

      vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue(mockSupabase);

      const result = await customerService.convertToPermanent(sampleCustId, 'actor-profile-id');

      expect(result.customer.customerType).toBe('PERMANENT');
      expect(result.alreadyPermanent).toBe(true);
      expect(result.message).toContain('already classified as PERMANENT');
    });
  });
});
