import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import * as supabaseLib from '../src/lib/supabase.js';
import { essIntegrationService } from '../src/services/essIntegration.service.js';
import { env } from '../src/config/env.js';

describe('Extreme Sales & Services (ESS) Integration Suite', () => {
  const app = createApp();
  const m2mKey = env.M2M_API_KEY;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. CORS Whitelist Configuration', () => {
    it('allows requests from Extreme Sales & Services storefront origin', async () => {
      const res = await request(app)
        .options('/api/v1/health')
        .set('Origin', 'https://extreme-sales-services.vercel.app')
        .set('Access-Control-Request-Method', 'GET');

      expect(res.headers['access-control-allow-origin']).toBe('https://extreme-sales-services.vercel.app');
    });

    it('blocks unapproved external origins', async () => {
      const res = await request(app)
        .get('/api/v1/health')
        .set('Origin', 'https://malicious-site.example.com');

      expect(res.status).toBe(500); // Express CORS middleware throws error
    });
  });

  describe('2. Machine-to-Machine (M2M) Authentication', () => {
    it('authenticates M2M calls using X-API-Key header without requiring Supabase JWT', async () => {
      const mockSupabase: any = {
        from: vi.fn((table: string) => ({
          select: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          range: vi.fn().mockResolvedValue({ data: [], error: null, count: 0 }),
        })),
      };
      vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue(mockSupabase);

      const res = await request(app)
        .get('/api/v1/service-requests')
        .set('X-API-Key', m2mKey);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(mockSupabase.from).toHaveBeenCalledWith('service_requests');
    });

    it('authenticates M2M calls using Authorization: Bearer <M2M_KEY>', async () => {
      const mockSupabase: any = {
        from: vi.fn((table: string) => ({
          select: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          range: vi.fn().mockResolvedValue({ data: [], error: null, count: 0 }),
        })),
      };
      vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue(mockSupabase);

      const res = await request(app)
        .get('/api/v1/service-requests')
        .set('Authorization', `Bearer ${m2mKey}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('rejects calls with an invalid API key and no JWT', async () => {
      const res = await request(app)
        .get('/api/v1/service-requests')
        .set('X-API-Key', 'invalid-key-999');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });

  describe('3. Source Channel & External Reference Handling', () => {
    it('persists sourceChannel EXTREME_SALES_SERVICES and externalReferenceId on service request creation', async () => {
      const customerId = '11111111-1111-1111-1111-111111111111';
      const siteId = '22222222-2222-2222-2222-222222222222';
      const mockCustomer = { id: customerId, name: 'John Doe', is_active: true };
      const mockSite = { id: siteId, customer_id: customerId, site_name: 'Main Flat', is_active: true };
      const mockInserted = {
        id: 'sr-uuid-1',
        request_number: 'SR-2026-999999',
        customer_id: customerId,
        site_id: siteId,
        asset_id: null,
        request_type: 'BREAKDOWN',
        priority: 'HIGH',
        description: 'AC blowing warm air in living room',
        status: 'REQUESTED',
        source_channel: 'EXTREME_SALES_SERVICES',
        external_reference_id: 'SR-202611-9482',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const mockSupabase: any = {
        from: vi.fn((table: string) => {
          if (table === 'customers') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({ data: mockCustomer, error: null }),
            };
          }
          if (table === 'customer_sites') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({ data: mockSite, error: null }),
            };
          }
          if (table === 'service_requests') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
              insert: vi.fn().mockReturnThis(),
              single: vi.fn().mockResolvedValue({ data: mockInserted, error: null }),
            };
          }
          return {
            select: vi.fn().mockReturnThis(),
            insert: vi.fn().mockResolvedValue({ data: null, error: null }),
          };
        }),
      };
      vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue(mockSupabase);

      const res = await request(app)
        .post('/api/v1/service-requests')
        .set('X-API-Key', m2mKey)
        .send({
          customerId,
          siteId,
          requestType: 'BREAKDOWN',
          priority: 'HIGH',
          description: 'AC blowing warm air in living room',
          sourceChannel: 'EXTREME_SALES_SERVICES',
          externalReferenceId: 'SR-202611-9482',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.request.sourceChannel).toBe('EXTREME_SALES_SERVICES');
      expect(res.body.data.request.externalReferenceId).toBe('SR-202611-9482');
    });
  });

  describe('4. Outbound Webhook Dispatch to ESS', () => {
    let originalFetch: any;

    beforeEach(() => {
      originalFetch = globalThis.fetch;
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    it('dispatches webhook to ESS when ticket originates from EXTREME_SALES_SERVICES', async () => {
      const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200, statusText: 'OK' });
      globalThis.fetch = mockFetch;

      const mockSr = {
        id: 'pys-sr-100',
        request_number: 'REQ-2026-0042',
        status: 'IN_PROGRESS',
        source_channel: 'EXTREME_SALES_SERVICES',
        external_reference_id: 'SR-202611-9482',
      };

      const mockSchedule = {
        id: 'sched-1',
        scheduled_date: '2026-11-12',
        status: 'IN_PROGRESS',
        technician_id: 'tech-uuid-1',
        technicians: {
          id: 'tech-uuid-1',
          name: 'Santosh Bharadwaj',
          phone: '9336225307',
        },
      };

      const mockSupabase: any = {
        from: vi.fn((table: string) => {
          if (table === 'service_requests') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({ data: mockSr, error: null }),
            };
          }
          if (table === 'service_schedules') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              not: vi.fn().mockReturnThis(),
              order: vi.fn().mockReturnThis(),
              limit: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({ data: mockSchedule, error: null }),
            };
          }
          return {};
        }),
      };
      vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue(mockSupabase);

      await essIntegrationService.notifyServiceRequestStatusUpdate('pys-sr-100', 'IN_PROGRESS');

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('https://extreme-sales-services-gh7s.onrender.com/api/webhooks/pys');
      expect(options.method).toBe('POST');
      expect(options.headers['X-Webhook-Secret']).toBe('ess_pys_shared_secret_2026');
      expect(options.headers['Content-Type']).toBe('application/json');

      const body = JSON.parse(options.body);
      expect(body).toMatchObject({
        event: 'service_request.status_updated',
        pysRequestId: 'pys-sr-100',
        pysRequestNumber: 'REQ-2026-0042',
        externalReferenceId: 'SR-202611-9482',
        status: 'IN_PROGRESS',
        scheduledDate: '2026-11-12',
        technician: {
          id: 'tech-uuid-1',
          name: 'Santosh Bharadwaj',
          phone: '9336225307',
        },
      });
    });

    it('does not dispatch webhook when ticket source is PYS_DIRECT', async () => {
      const mockFetch = vi.fn();
      globalThis.fetch = mockFetch;

      const mockSr = {
        id: 'pys-sr-200',
        request_number: 'REQ-2026-0099',
        status: 'ASSIGNED',
        source_channel: 'PYS_DIRECT',
        external_reference_id: null,
      };

      const mockSupabase: any = {
        from: vi.fn(() => ({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: mockSr, error: null }),
        })),
      };
      vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue(mockSupabase);

      await essIntegrationService.notifyServiceRequestStatusUpdate('pys-sr-200', 'ASSIGNED');

      expect(mockFetch).not.toHaveBeenCalled();
    });
  });
});
