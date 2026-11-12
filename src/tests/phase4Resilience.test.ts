import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApiClient, ApiError } from '@/services/api/client';

function createJsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('Phase 4: ApiClient Timeout, Retry & Single-Flight 401 Refresh', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('aborts hung requests cleanly when timeoutMs elapses', async () => {
    const fetchMock = vi.fn((_url: RequestInfo | URL, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('The operation was aborted.', 'AbortError'));
        });
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = new ApiClient('http://localhost:3001/api/v1');
    let caught: unknown;
    try {
      await client.get('/slow', { timeoutMs: 25, retries: 0 });
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(ApiError);
    expect((caught as ApiError).code).toBe('NETWORK_ERROR');
    expect((caught as ApiError).message).toMatch(/timed out after 25ms/i);
  });

  it('retries idempotent GET on transient 503 and notifies warming listeners', async () => {
    let calls = 0;
    const fetchMock = vi.fn().mockImplementation(async () => {
      calls++;
      if (calls < 3) {
        return createJsonResponse({ success: false, error: { code: 'UNAVAILABLE', message: 'Booting' } }, 503);
      }
      return createJsonResponse({ success: true, data: { ready: true } }, 200);
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = new ApiClient('http://localhost:3001/api/v1');
    const warmingEvents: boolean[] = [];
    const unsubscribe = client.onWarmingChange((isWarming) => warmingEvents.push(isWarming));

    const data = await client.get<{ ready: boolean }>('/health');
    unsubscribe();

    expect(data).toEqual({ ready: true });
    expect(calls).toBe(3);
    expect(warmingEvents).toEqual([true, false]);
  });

  it('defaults mutating POST requests to zero retries on 503', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        createJsonResponse({ success: false, error: { code: 'UNAVAILABLE', message: 'Gateway down' } }, 503),
      );
    vi.stubGlobal('fetch', fetchMock);

    const client = new ApiClient('http://localhost:3001/api/v1');
    await expect(client.post('/customers', { name: 'Acme' })).rejects.toThrow('Gateway down');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('deduplicates concurrent 401 refreshes via single-flight setTokenRefresher', async () => {
    const client = new ApiClient('http://localhost:3001/api/v1');
    client.setAuthToken('expired-token');

    const refresher = vi.fn().mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 15));
      return 'fresh-token-123';
    });
    client.setTokenRefresher(refresher);

    const fetchMock = vi.fn().mockImplementation(async (_url: RequestInfo | URL, init?: RequestInit) => {
      const authHeader = (init?.headers as Headers).get('Authorization');
      if (authHeader === 'Bearer fresh-token-123') {
        return createJsonResponse({ success: true, data: { ok: true } }, 200);
      }
      return createJsonResponse({ success: false, error: { code: 'UNAUTHORIZED', message: 'Expired' } }, 401);
    });
    vi.stubGlobal('fetch', fetchMock);

    const [resA, resB] = await Promise.all([
      client.get<{ ok: boolean }>('/a', { retries: 0 }),
      client.get<{ ok: boolean }>('/b', { retries: 0 }),
    ]);

    expect(resA).toEqual({ ok: true });
    expect(resB).toEqual({ ok: true });
    expect(refresher).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('supports binary download() with single 401 refresh recovery', async () => {
    const client = new ApiClient('http://localhost:3001/api/v1');
    client.setAuthToken('old-token');
    client.setTokenRefresher(async () => 'new-token');

    const fetchMock = vi.fn().mockImplementation(async (_url: RequestInfo | URL, init?: RequestInit) => {
      const authHeader = (init?.headers as Headers).get('Authorization');
      if (authHeader !== 'Bearer new-token') {
        return createJsonResponse({ success: false, error: { code: 'UNAUTHORIZED', message: 'Expired' } }, 401);
      }
      return new Response('col1,col2\n1,2\n', {
        status: 200,
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': 'attachment; filename="export-report.csv"',
        },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const blob = await client.download('/exports/reports.csv');
    expect(blob.type).toContain('text/csv');
    expect(blob.size).toBe(14);
    expect(await blob.text()).toBe('col1,col2\n1,2\n');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
