import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act } from 'react';

// @ts-expect-error global React flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
import { createRoot } from 'react-dom/client';
import { ServerManagementWorkspace } from '@/pages/serverManagement/ServerManagementWorkspace';
import { ToastProvider } from '@/components/ui/Toast';
import { apiClient, ApiError } from '@/services/api/client';

function render(ui: React.ReactNode) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(<ToastProvider>{ui}</ToastProvider>));
  return {
    container,
    cleanup: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

const flush = async () => {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
};

describe('Server & Database page', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('shows real counts from the (already unwrapped) API response, including missing tables', async () => {
    vi.spyOn(apiClient, 'get').mockImplementation(async (path: string) => {
      if (path.startsWith('/admin/telemetry/health')) {
        return {
          timestamp: new Date().toISOString(),
          status: 'HEALTHY',
          uptimeSeconds: 3700,
          startedAt: '2026-11-18T10:00:00.000Z',
          environment: 'production',
          cpu: { cores: 2, model: 'x', loadAvg1m: 0.1, processCpuPercent: 3 },
          memory: { heapUsedMb: 40, heapTotalMb: 60, rssMb: 90, totalSystemMb: 512, freeSystemMb: 100, heapUsagePercent: 66 },
          database: { status: 'ONLINE', latencyMs: 21, checkedAt: new Date().toISOString(), details: 'ok' },
        } as never;
      }
      if (path.startsWith('/admin/telemetry/logs')) {
        return { totalReturned: 0, bufferStartedAt: '2026-11-18T10:00:00.000Z', logs: [] } as never;
      }
      if (path.startsWith('/admin/telemetry/crashes')) return [] as never;
      if (path.startsWith('/admin/database/backup/metadata')) {
        return {
          countedAt: new Date().toISOString(),
          tables: [
            { tableName: 'customers', count: 41, status: 'ok', exported: true },
            { tableName: 'service_catalog_items', count: 12, status: 'ok', exported: true },
            { tableName: 'web_intakes', count: null, status: 'missing', exported: true },
          ],
          tableCounts: { customers: 41, service_catalog_items: 12 },
          totalRecords: 53,
          recentBackups: [],
        } as never;
      }
      throw new Error(`unexpected ${path}`);
    });

    const { container, cleanup } = render(<ServerManagementWorkspace />);
    await flush();

    const text = container.textContent || '';
    expect(text).not.toContain('337');
    expect(text).not.toContain('22 tables');
    expect(text).not.toContain('5002');
    expect(container.querySelector('[data-testid="records-summary"]')?.textContent).toContain('53');
    const manifest = container.querySelector('[data-testid="table-manifest"]')?.textContent || '';
    expect(manifest).toContain('customers');
    expect(manifest).toContain('41');
    expect(manifest).toContain('service_catalog_items');
    expect(manifest).toContain('not created');
    expect(container.querySelector('[data-testid="log-buffer-started"]')?.textContent).toMatch(/Since server start at/);
    expect(text).toContain('/api/v1/ess');
    cleanup();
  });

  it('shows an unavailable state instead of made-up numbers when the API fails', async () => {
    vi.spyOn(apiClient, 'get').mockRejectedValue(new ApiError(403, 'FORBIDDEN', 'Access denied'));

    const { container, cleanup } = render(<ServerManagementWorkspace />);
    await flush();

    const text = container.textContent || '';
    expect(text).not.toContain('337');
    expect(text).not.toContain('48.5');
    expect(text).toContain('Admins only');
    expect(container.querySelector('[data-testid="manifest-empty"]')?.textContent).toContain('Unavailable');
    cleanup();
  });
});
