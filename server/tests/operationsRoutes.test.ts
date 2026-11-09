import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import * as supabaseLib from '../src/lib/supabase.js';
import { reportEmailService } from '../src/services/reportEmail.service.js';

const PROFILE_ID = '11111111-1111-4111-8111-111111111111';
const PAYMENT_ID = '22222222-2222-4222-8222-222222222222';
const PART_ID = '33333333-3333-4333-8333-333333333333';

function createSupabase(role = 'STAFF') {
  const tables: Record<string, any[]> = {
    profiles: [{ id: PROFILE_ID, full_name: 'Test Staff', email: 'staff@test.local' }],
    staff: [{ id: 'staff-record', profile_id: PROFILE_ID, role, is_active: true }],
    parts: [{ id: PART_ID, part_code: 'FLT-01', name: 'Filter', current_stock: 12, low_stock_threshold: 5 }],
    payments: [{ id: PAYMENT_ID, payment_number: 'PAY-01', total_amount_due: 1200, total_amount_paid: 0, status: 'PENDING' }],
    inventory_transactions: [],
    notifications: [],
    activity_logs: [],
  };
  const rpc = vi.fn(async (functionName: string) => ({ data: `${functionName}-id`, error: null }));
  const from = vi.fn((table: string) => {
    let mutationData: any = tables[table] || [];
    const builder: any = {
      select: vi.fn(() => builder),
      insert: vi.fn((value: any) => { mutationData = value; return builder; }),
      upsert: vi.fn((value: any) => { mutationData = value; return builder; }),
      update: vi.fn((value: any) => { mutationData = value; return builder; }),
      eq: vi.fn(() => builder),
      neq: vi.fn(() => builder),
      in: vi.fn(() => builder),
      ilike: vi.fn(() => builder),
      gte: vi.fn(() => builder),
      lte: vi.fn(() => builder),
      lt: vi.fn(() => builder),
      order: vi.fn(() => builder),
      range: vi.fn(async () => ({ data: tables[table] || [], count: (tables[table] || []).length, error: null })),
      single: vi.fn(async () => ({ data: Array.isArray(mutationData) ? mutationData[0] : mutationData, error: null })),
      maybeSingle: vi.fn(async () => ({ data: Array.isArray(mutationData) ? mutationData[0] : mutationData, error: null })),
      then: (resolve: (value: any) => unknown) => Promise.resolve({ data: Array.isArray(mutationData) ? mutationData : [], error: null }).then(resolve),
    };
    return builder;
  });
  return {
    tables,
    rpc,
    from,
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: PROFILE_ID } }, error: null })) },
  };
}

describe('operational V1 APIs', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('validates inventory transaction requirements before reaching the database', async () => {
    const db = createSupabase();
    vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue(db as any);
    const response = await request(app).post('/api/v1/inventory/transactions')
      .set('Authorization', 'Bearer valid-staff-token')
      .send({ partId: PART_ID, transactionType: 'SERVICE_USAGE', quantity: 2, reason: 'Used for service' });
    expect(response.status).toBe(422);
    expect(db.rpc).not.toHaveBeenCalled();
  });

  it('records inventory movements through the atomic ledger function with the verified staff actor', async () => {
    const db = createSupabase();
    vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue(db as any);
    const response = await request(app).post('/api/v1/inventory/transactions')
      .set('Authorization', 'Bearer valid-staff-token')
      .send({ partId: PART_ID, transactionType: 'SERVICE_USAGE', quantity: 2, reason: 'Replaced filter', serviceReportId: PAYMENT_ID });
    expect(response.status).toBe(201);
    expect(db.rpc).toHaveBeenCalledWith('record_inventory_transaction', expect.objectContaining({
      p_part_id: PART_ID, p_quantity: 2, p_actor_profile_id: PROFILE_ID, p_service_report_id: PAYMENT_ID,
    }));
  });

  it('requires an external reference for online payment records', async () => {
    const db = createSupabase();
    vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue(db as any);
    const response = await request(app).post(`/api/v1/payments/${PAYMENT_ID}/transactions`)
      .set('Authorization', 'Bearer valid-staff-token')
      .send({ paymentMethod: 'ONLINE', amount: 400 });
    expect(response.status).toBe(422);
    expect(db.rpc).not.toHaveBeenCalled();
  });

  it('creates payment ledger entries with the authenticated recorder identity', async () => {
    const db = createSupabase();
    vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue(db as any);
    const response = await request(app).post(`/api/v1/payments/${PAYMENT_ID}/transactions`)
      .set('Authorization', 'Bearer valid-staff-token')
      .send({ paymentMethod: 'CASH', amount: 400, notes: 'Cash received at service desk' });
    expect(response.status).toBe(201);
    expect(db.rpc).toHaveBeenCalledWith('record_payment_transaction', expect.objectContaining({
      p_payment_id: PAYMENT_ID, p_payment_method: 'CASH', p_actor_profile_id: PROFILE_ID,
    }));
  });

  it('allows Staff to use operations but restricts the activity log to Admin', async () => {
    const staffDb = createSupabase('STAFF');
    vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue(staffDb as any);
    const denied = await request(app).get('/api/v1/activity-logs').set('Authorization', 'Bearer staff-token');
    expect(denied.status).toBe(403);

    const adminDb = createSupabase('ADMIN');
    vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue(adminDb as any);
    const allowed = await request(app).get('/api/v1/activity-logs?page=1&pageSize=10').set('Authorization', 'Bearer admin-token');
    expect(allowed.status).toBe(200);
    expect(allowed.body.data.pageSize).toBe(10);
  });

  it('returns an authenticated XLSX workbook with the correct media type', async () => {
    const db = createSupabase();
    db.tables.customers = [{ customer_code: 'CUS-1', name: '=1+1', phone: '0000000000', is_active: true }];
    vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue(db as any);
    const response = await request(app).get('/api/v1/exports/customers?status=ACTIVE')
      .set('Authorization', 'Bearer staff-token')
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => callback(null, Buffer.concat(chunks)));
      });
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(response.headers['content-disposition']).toContain('pys-customers-');
    expect((response.body as Buffer).byteLength).toBeGreaterThan(100);
  });

  it('allows Staff to queue a report email and attributes the request to the authenticated profile', async () => {
    const db = createSupabase('STAFF');
    vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue(db as any);
    const queue = vi.spyOn(reportEmailService, 'queueAndSend').mockResolvedValue({
      delivery: { id: 'delivery-id', status: 'SENT' }, processed: 1,
    } as any);

    const response = await request(app).post(`/api/v1/service-reports/${PAYMENT_ID}/email`)
      .set('Authorization', 'Bearer staff-token');

    expect(response.status).toBe(202);
    expect(queue).toHaveBeenCalledWith(PAYMENT_ID, PROFILE_ID);
  });

  it('restricts delivery retries to Admin and allows Admin to retry a failed delivery', async () => {
    const staffDb = createSupabase('STAFF');
    vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue(staffDb as any);
    const processPending = vi.spyOn(reportEmailService, 'processPending').mockResolvedValue({ processed: 1, sent: 1, failed: 0 });

    const denied = await request(app).post('/api/v1/service-reports/email-deliveries/retry')
      .set('Authorization', 'Bearer staff-token');
    expect(denied.status).toBe(403);
    expect(processPending).not.toHaveBeenCalled();

    const adminDb = createSupabase('ADMIN');
    vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue(adminDb as any);
    const allowed = await request(app).post('/api/v1/service-reports/email-deliveries/retry')
      .set('Authorization', 'Bearer admin-token');
    expect(allowed.status).toBe(200);
    expect(processPending).toHaveBeenCalledWith(50, PROFILE_ID);
  });
});
