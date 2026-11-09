import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as supabaseLib from '../src/lib/supabase.js';
import { ReportEmailService, type EmailTransport } from '../src/services/reportEmail.service.js';

vi.mock('../src/services/audit.service.js', () => ({
  logActivity: vi.fn().mockResolvedValue(undefined),
}));

const REPORT_ID = '11111111-1111-4111-8111-111111111111';
const PROFILE_ID = '22222222-2222-4222-8222-222222222222';
const DELIVERY_ID = '33333333-3333-4333-8333-333333333333';

function createSupabaseClient(finalStatus: 'SENT' | 'FAILED') {
  const reportMutations: string[] = [];
  const report = {
    id: REPORT_ID,
    report_number: 'REP-001',
    service_date: '2026-11-05',
    status: 'SUBMITTED',
    primary_outcome: 'COMPLETED',
    work_description: 'Cleaned & inspected <unit>',
    technician_remarks: null,
    customer_id: 'customer-1',
  };
  const claimedDelivery = {
    id: DELIVERY_ID,
    service_report_id: REPORT_ID,
    recipient_email: 'customer@example.test',
    subject: 'Service report REP-001',
    html_body: '<p>Report</p>',
    text_body: 'Report',
    attempt_count: 1,
  };
  const finalDelivery = {
    id: DELIVERY_ID,
    recipient_email: 'customer@example.test',
    status: finalStatus,
    attempt_count: 1,
    max_attempts: 5,
    next_attempt_at: '2026-11-05T12:01:00.000Z',
    last_error: finalStatus === 'FAILED' ? 'Temporary provider failure' : null,
    transport: 'test-transport',
    sent_at: finalStatus === 'SENT' ? '2026-11-05T12:00:00.000Z' : null,
    created_at: '2026-11-05T12:00:00.000Z',
  };

  const rpc = vi.fn(async (name: string) => {
    if (name === 'claim_service_report_email_deliveries') return { data: [claimedDelivery], error: null };
    if (name === 'complete_service_report_email_delivery') return { data: finalDelivery, error: null };
    return { data: null, error: { code: '42883', message: `Unexpected RPC ${name}` } };
  });

  const from = vi.fn((table: string) => {
    let inserted = false;
    const builder: any = {
      select: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      order: vi.fn(() => builder),
      insert: vi.fn(() => {
        inserted = true;
        if (table === 'service_reports') reportMutations.push('insert');
        return builder;
      }),
      update: vi.fn(() => {
        if (table === 'service_reports') reportMutations.push('update');
        return builder;
      }),
      delete: vi.fn(() => {
        if (table === 'service_reports') reportMutations.push('delete');
        return builder;
      }),
      maybeSingle: vi.fn(async () => ({
        data: table === 'service_reports' ? report : table === 'customers' ? { name: 'Example Customer', email: 'customer@example.test' } : null,
        error: null,
      })),
      single: vi.fn(async () => ({
        data: inserted ? { id: DELIVERY_ID, status: 'PENDING' } : finalDelivery,
        error: null,
      })),
      then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => {
        const data = table === 'service_report_assets'
          ? [{ asset_id: 'asset-1', asset_tag: 'AC-001', brand: 'Brand', model_number: 'Model', asset_outcome: 'COMPLETED' }]
          : table === 'service_report_items'
            ? [{ item_type: 'REPAIR', item_name: 'Inspection', reason: 'Routine check', is_resolved: false }]
            : [];
        return Promise.resolve({ data, error: null }).then(resolve, reject);
      },
    };
    return builder;
  });

  return { from, rpc, reportMutations };
}

describe('ReportEmailService', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('stores a retryable failed delivery without mutating the issued report', async () => {
    const db = createSupabaseClient('FAILED');
    vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue(db as any);
    const transport: EmailTransport = {
      send: vi.fn().mockResolvedValue({
        success: false,
        transport: 'test-transport',
        error: 'Temporary provider failure',
        retryable: true,
      }),
    };
    const service = new ReportEmailService(() => transport);

    const result = await service.queueAndSend(REPORT_ID, PROFILE_ID);

    expect(result.delivery.status).toBe('FAILED');
    expect(transport.send).toHaveBeenCalledOnce();
    expect(db.rpc).toHaveBeenCalledWith('complete_service_report_email_delivery', expect.objectContaining({
      p_delivery_id: DELIVERY_ID,
      p_succeeded: false,
      p_retryable: true,
      p_error: 'Temporary provider failure',
    }));
    expect(db.reportMutations).toEqual([]);
  });

  it('sends the issued snapshot through the configured transport and preserves report data', async () => {
    const db = createSupabaseClient('SENT');
    vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue(db as any);
    const transport: EmailTransport = {
      send: vi.fn().mockResolvedValue({
        success: true,
        transport: 'test-transport',
        providerMessageId: 'provider-message-1',
        retryable: false,
      }),
    };
    const service = new ReportEmailService(() => transport);

    const result = await service.queueAndSend(REPORT_ID, PROFILE_ID);

    expect(result.delivery.status).toBe('SENT');
    expect(transport.send).toHaveBeenCalledOnce();
    expect(db.from).toHaveBeenCalledWith('service_report_assets');
    expect(db.from).toHaveBeenCalledWith('service_report_items');
    expect(db.reportMutations).toEqual([]);
  });
});
