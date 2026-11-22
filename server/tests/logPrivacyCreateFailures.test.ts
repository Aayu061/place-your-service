import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// A database stand-in where every lookup succeeds (customer, site, no duplicates) but the
// insert itself fails, so the code reaches its failure log line.
function makeChain(table: string) {
  let inserting = false;
  const chain: any = new Proxy(
    {},
    {
      get: (_t, prop) => {
        if (prop === 'then') {
          return (res: any) => {
            if (inserting) return res({ data: null, error: { message: 'insert failed' }, count: null });
            if (table === 'customers') {
              return res({ data: { id: 'cust-1', name: 'Asha', is_active: true }, error: null });
            }
            if (table === 'customer_sites') {
              return res({
                data: { id: 'site-1', site_name: 'Main', customer_id: 'cust-1', is_active: true },
                error: null,
              });
            }
            return res({ data: null, error: null, count: 0 });
          };
        }
        if (prop === 'insert') {
          return () => {
            inserting = true;
            return chain;
          };
        }
        return () => chain;
      },
    }
  );
  return chain;
}

vi.mock('../src/lib/supabase.js', () => ({
  getSupabaseClient: () => ({
    from: (table: string) => makeChain(table),
    rpc: () => makeChain('rpc'),
  }),
}));

import { technicianService } from '../src/services/technician.service.js';
import { ServiceRequestService } from '../src/services/serviceRequest.service.js';

const PHONE = '9876543210';
const EMAIL = 'ravi.kumar@example.com';

describe('create failure logs hide personal details', () => {
  let out: string;
  beforeEach(() => {
    out = '';
    for (const m of ['log', 'warn', 'error'] as const) {
      vi.spyOn(console, m).mockImplementation((...a: unknown[]) => {
        out += a.join(' ') + '\n';
      });
    }
  });
  afterEach(() => vi.restoreAllMocks());

  it('technician create failure does not log phone or email', async () => {
    await expect(
      technicianService.createTechnician({ name: 'Ravi Kumar', phone: PHONE, email: EMAIL } as any)
    ).rejects.toThrow();
    expect(out).toContain('Failed to create technician in DB');
    expect(out).toContain('TECH-0001');
    expect(out).not.toContain(PHONE);
    expect(out).not.toContain(EMAIL);
    expect(out).not.toContain('Ravi Kumar');
  });

  it('service request create failure does not log description or notes', async () => {
    const payload = {
      customerId: 'cust-1',
      siteId: 'site-1',
      requestType: 'REPAIR',
      description: `AC not cooling, call me on ${PHONE}`,
      notes: `Alternate number 9123456780`,
      sourceChannel: 'PYS_DIRECT',
    };
    await expect(new ServiceRequestService().createServiceRequest(payload as any)).rejects.toThrow();
    expect(out).toContain('Failed to create service request');
    expect(out).toContain('cust-1');
    expect(out).toContain('site-1');
    expect(out).not.toContain(PHONE);
    expect(out).not.toContain('9123456780');
    expect(out).not.toContain('AC not cooling');
  });
});
