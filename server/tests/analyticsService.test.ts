import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as supabaseLib from '../src/lib/supabase.js';
import { AnalyticsService } from '../src/services/analytics.service.js';

function createAnalyticsClient() {
  const from = vi.fn((table: string) => {
    const state: { options?: { count?: string; head?: boolean }; filters: Record<string, unknown> } = { filters: {} };
    const builder: any = {
      select: vi.fn((_columns?: string, options?: typeof state.options) => { state.options = options; return builder; }),
      eq: vi.fn((column: string, value: unknown) => { state.filters[column] = value; return builder; }),
      in: vi.fn((column: string, value: unknown) => { state.filters[column] = value; return builder; }),
      gte: vi.fn((column: string, value: unknown) => { state.filters[`${column}:gte`] = value; return builder; }),
      lt: vi.fn((column: string, value: unknown) => { state.filters[`${column}:lt`] = value; return builder; }),
      not: vi.fn((column: string, operator: string, value: unknown) => { state.filters[`${column}:not:${operator}`] = value; return builder; }),
      order: vi.fn(() => builder),
      limit: vi.fn(() => builder),
      then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => {
        let data: unknown[] = [];
        let count = 0;
        if (table === 'amc_contracts') data = [{ id: 'amc-1', status: 'ACTIVE', end_date: '2099-12-31', total_amount: 5000 }, { id: 'amc-2', status: 'DRAFT', total_amount: 3000 }];
        if (table === 'amc_assets') data = [{ asset_id: 'asset-1' }];
        if (table === 'technicians') count = state.filters.is_active === true && state.filters.status === undefined ? 2 : 0;
        if (table === 'payments') data = [{ id: 'p-1', total_amount_due: 10000, total_amount_paid: 6000, status: 'PARTIALLY_PAID' }, { id: 'p-2', total_amount_due: 4000, total_amount_paid: 4000, status: 'PAID' }];
        if (table === 'payment_transactions') data = [{ amount: 4000, payment_method: 'CASH', entry_type: 'PAYMENT', payment_status: 'SUCCESS' }, { amount: 6000, payment_method: 'ONLINE', entry_type: 'PAYMENT', payment_status: 'SUCCESS' }];
        if (table === 'service_schedules' && state.options?.head) {
          const statuses = state.filters.status as string[] | undefined;
          if (statuses?.includes('COMPLETED')) count = 1;
          else if (state.filters['scheduled_date:lt']) count = 1;
          else if (state.filters.technician_id === 'not') count = 1;
          else count = 3;
        }
        return Promise.resolve({ data, count, error: null }).then(resolve, reject);
      },
    };
    return builder;
  });
  return { from };
}

describe('AnalyticsService', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('counts active technicians without relying on a non-existent ACTIVE status', async () => {
    vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue(createAnalyticsClient() as any);

    const summary = await new AnalyticsService().getDashboardSummary();

    expect(summary.kpi.activeTechniciansCount).toBe(2);
  });

  it('calculates financial KPIs and AMC draft quotation pipeline correctly', async () => {
    vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue(createAnalyticsClient() as any);

    const summary = await new AnalyticsService().getDashboardSummary();

    expect(summary.financials.totalInvoiced).toBe(14000);
    expect(summary.financials.totalCollected).toBe(10000);
    expect(summary.financials.totalOutstanding).toBe(4000);
    expect(summary.financials.collectionRatePercent).toBe(71);
    expect(summary.financials.cashCollected).toBe(4000);
    expect(summary.financials.onlineCollected).toBe(6000);
    expect(summary.financials.pendingPaymentsCount).toBe(1);
    expect(summary.financials.paidPaymentsCount).toBe(1);

    expect(summary.amcPipeline.draftCount).toBe(1);
    expect(summary.amcPipeline.draftValue).toBe(3000);
    expect(summary.kpi.totalRevenueCollected).toBe(10000);
    expect(summary.kpi.draftQuotationsCount).toBe(1);

    expect(Array.isArray(summary.workDistribution)).toBe(true);
    expect(summary.workDistribution.length).toBeGreaterThan(0);
    expect(Array.isArray(summary.recentServiceReports)).toBe(true);
  });
});
