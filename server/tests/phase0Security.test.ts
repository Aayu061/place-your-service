import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import * as supabaseLib from '../src/lib/supabase.js';
import { isM2mEndpointAllowed } from '../src/middleware/auth.js';
import { isBlockedProductCategory } from '../src/routes/essStorefront.routes.js';

/**
 * Phase 0 security lock-down regression tests:
 * - storefront enquiry list / product writes need staff auth
 * - the ESS integration key only works on its allow-listed endpoints
 * - the phone-only customer portal is paused
 * - public tracking needs the exact Request ID + matching mobile and leaks no contact data
 */
describe('Phase 0 security lock-down', () => {
  const app = createApp();

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('Storefront endpoints', () => {
    it('GET /contact-enquiries without login returns 401 and never queries the database', async () => {
      const from = vi.fn();
      vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue({ from } as any);

      const res = await request(app).get('/api/v1/contact-enquiries');

      expect(res.status).toBe(401);
      expect(from).not.toHaveBeenCalled();
    });

    it('POST /ess-products without login returns 401', async () => {
      const from = vi.fn();
      vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue({ from } as any);

      const res = await request(app)
        .post('/api/v1/ess-products')
        .send({ name: 'Hacked product', price: 1, category: 'new_ac' });

      expect(res.status).toBe(401);
      expect(from).not.toHaveBeenCalled();
    });

    it('GET /ess-products (public) excludes refurbished and spare-part categories', async () => {
      const not = vi.fn().mockReturnThis();
      const chain: any = {
        select: vi.fn().mockReturnThis(),
        not,
        order: vi.fn().mockResolvedValue({ data: [], error: null }),
      };
      vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue({ from: vi.fn(() => chain) } as any);

      const res = await request(app).get('/api/v1/ess-products');

      expect(res.status).toBe(200);
      expect(not).toHaveBeenCalledWith('category', 'in', '(refurbished,used_ac,used,spare_parts,spare_part)');
    });

    it.each([
      ['refurbished', true],
      ['spare_parts', true],
      ['Spare_Part', true],
      ['used_ac', true],
      ['residential', false],
      ['commercial', false],
      ['industrial', false],
      ['new_ac', false],
    ])('category %s blocked=%s', (category, blocked) => {
      expect(isBlockedProductCategory(category)).toBe(blocked);
    });
  });

  describe('ESS integration key allow-list', () => {
    it.each([
      ['GET', '/api/v1/customers?search=9876543210', true],
      ['POST', '/api/v1/customers', true],
      ['GET', '/api/v1/customers/abc/sites', true],
      ['POST', '/api/v1/sites', true],
      ['POST', '/api/v1/service-requests', true],
      ['GET', '/api/v1/amc-contracts/plans?includeInactive=false', true],
      ['POST', '/api/v1/compliance/gstin/lookup', true],
      ['POST', '/api/v1/admin/telemetry/crash-report', true],
      ['GET', '/api/v1/staff', false],
      ['POST', '/api/v1/staff', false],
      ['GET', '/api/v1/admin/database/backup', false],
      ['GET', '/api/v1/service-requests', false],
      ['PATCH', '/api/v1/customers/abc', false],
      ['DELETE', '/api/v1/customers', false],
      ['GET', '/api/v1/customers/abc', false],
      ['POST', '/api/v1/contact-enquiries/abc/convert', false],
    ])('%s %s allowed=%s', (method, url, allowed) => {
      expect(isM2mEndpointAllowed(method as string, url as string)).toBe(allowed);
    });
  });

  describe('Customer portal (paused until verified login)', () => {
    it.each([
      ['post', '/api/v1/portal/auth/login', { phone: '9876543210' }],
      ['get', '/api/v1/portal/overview?phone=9876543210', undefined],
      ['post', '/api/v1/portal/book-service', { phone: '9876543210', description: 'x' }],
      ['post', '/api/v1/portal/register-asset', { phone: '9876543210', brand: 'X', modelNumber: 'Y' }],
    ])('%s %s returns 503 without touching customer data', async (method, url, body) => {
      const from = vi.fn();
      vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue({ from } as any);

      const agent = (request(app) as any)[method](url);
      const res = body ? await agent.send(body) : await agent;

      expect(res.status).toBe(503);
      expect(from).not.toHaveBeenCalled();
    });
  });

  describe('Public tracking', () => {
    function mockTrackingDb(ticket: any) {
      const serviceRequests: any = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: ticket, error: null }),
      };
      const schedules: any = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: { scheduled_date: '2026-11-20', status: 'SCHEDULED', technician: { name: 'Ravi' } },
          error: null,
        }),
      };
      vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue({
        from: vi.fn((table: string) => (table === 'service_requests' ? serviceRequests : schedules)),
      } as any);
      return serviceRequests;
    }

    const ticket = {
      id: 'sr-1',
      request_number: 'SR-20261118-0001',
      request_type: 'BREAKDOWN',
      priority: 'HIGH',
      status: 'SCHEDULED',
      description: 'No cooling',
      preferred_date: '2026-11-20',
      resolved_at: null,
      created_at: '2026-11-18T10:00:00Z',
      customer: { name: 'Rahul Shah', customer_code: 'CUST-000001', phone: '+91 98765 43210', city: 'Mumbai' },
      asset: null,
    };

    it('requires both Request ID and mobile number', async () => {
      const res = await request(app).get('/api/v1/portal/track?phone=9876543210');
      expect(res.status).toBe(400);
      const res2 = await request(app).get('/api/v1/portal/track?ticket=SR-20261118-0001');
      expect(res2.status).toBe(400);
    });

    it('rejects filter-injection style IDs', async () => {
      const db = mockTrackingDb(ticket);
      const res = await request(app).get(
        `/api/v1/portal/track?ticket=${encodeURIComponent('SR-1,request_number.ilike.%')}&phone=9876543210`,
      );
      expect(res.status).toBe(400);
      expect(db.select).not.toHaveBeenCalled();
    });

    it('returns 404 when the mobile number does not match the request', async () => {
      mockTrackingDb(ticket);
      const res = await request(app).get('/api/v1/portal/track?ticket=SR-20261118-0001&phone=9000000000');
      expect(res.status).toBe(404);
    });

    it('returns status for exact ID + matching mobile without phone numbers or street address', async () => {
      mockTrackingDb(ticket);
      const res = await request(app).get('/api/v1/portal/track?ticket=sr-20261118-0001&phone=9876543210');

      expect(res.status).toBe(200);
      expect(res.body.data.ticket.requestNumber).toBe('SR-20261118-0001');
      expect(res.body.data.customer.name).toBe('Rahul Shah');
      expect(res.body.data.schedule.technician.name).toBe('Ravi');
      const body = JSON.stringify(res.body);
      expect(body).not.toContain('98765');
      expect(body).not.toContain('"phone"');
    });
  });
});
