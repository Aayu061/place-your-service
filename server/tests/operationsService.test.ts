import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as supabaseLib from '../src/lib/supabase.js';
import { OperationsService } from '../src/services/operations.service.js';

vi.mock('../src/services/audit.service.js', () => ({
  logActivity: vi.fn().mockResolvedValue(undefined),
}));

const PROFILE_ID = '11111111-1111-4111-8111-111111111111';

function createNotificationClient(partCount: number) {
  const lowStockParts = Array.from({ length: partCount }, (_, index) => ({
    id: `part-${index}`,
    part_code: `P-${index}`,
    name: `Part ${index}`,
    current_stock: 0,
    low_stock_threshold: 5,
  }));
  const tables: Record<string, unknown[]> = {
    staff: [{ profile_id: PROFILE_ID }],
    amc_contracts: [],
    service_schedules: [],
    parts: lowStockParts,
    payments: [],
  };
  const rangeCalls: Array<{ table: string; from: number; to: number }> = [];
  const orderCalls: Array<{ table: string; column: string; ascending: boolean }> = [];
  let insertedNotifications: unknown[] = [];

  const from = vi.fn((table: string) => {
    const builder: any = {
      select: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      in: vi.fn(() => builder),
      gte: vi.fn(() => builder),
      lte: vi.fn(() => builder),
      lt: vi.fn(() => builder),
      order: vi.fn((column: string, options: { ascending: boolean }) => {
        orderCalls.push({ table, column, ascending: options.ascending });
        return builder;
      }),
      range: vi.fn(async (fromIndex: number, toIndex: number) => {
        rangeCalls.push({ table, from: fromIndex, to: toIndex });
        return { data: (tables[table] || []).slice(fromIndex, toIndex + 1), error: null };
      }),
      upsert: vi.fn((rows: unknown[]) => {
        insertedNotifications = rows;
        return builder;
      }),
      then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => {
        const data = table === 'staff' ? tables.staff : insertedNotifications.map((_, index) => ({ id: `notification-${index}` }));
        return Promise.resolve({ data, error: null }).then(resolve, reject);
      },
    };
    return builder;
  });

  return { client: { from } as any, from, rangeCalls, orderCalls, getInsertedNotifications: () => insertedNotifications };
}

describe('OperationsService notification generation', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('uses stable ordered pages and processes every low-stock record across page boundaries', async () => {
    const db = createNotificationClient(501);
    vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue(db.client);

    const result = await new OperationsService().generateNotifications(PROFILE_ID);

    expect(result.created).toBe(501);
    expect(db.rangeCalls.filter((call) => call.table === 'parts')).toEqual([
      { table: 'parts', from: 0, to: 499 },
      { table: 'parts', from: 500, to: 999 },
    ]);
    expect(db.orderCalls).toEqual(expect.arrayContaining([
      { table: 'amc_contracts', column: 'id', ascending: true },
      { table: 'service_schedules', column: 'id', ascending: true },
      { table: 'parts', column: 'id', ascending: true },
      { table: 'payments', column: 'id', ascending: true },
    ]));
    expect(db.getInsertedNotifications()).toHaveLength(501);
  });
});
