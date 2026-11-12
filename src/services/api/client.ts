/**
 * Place Your Service — Centralized API HTTP Client
 * Manages communication between Vercel frontend and Render backend API
 * with timeout guards, idempotent GET retries, cold-start warming notifications,
 * and single-flight 401 session token refresh.
 */

import { config } from '@/config/env';
import { ApiSuccessResponse, ApiErrorResponse, RequestOptions } from './types';

export class ApiError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details?: unknown;

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export function getApiErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError && err.message) {
    return err.message;
  }
  if (typeof err === 'object' && err !== null) {
    const anyErr = err as { response?: { data?: { error?: { message?: string } } }; message?: string };
    if (anyErr.response?.data?.error?.message) {
      return anyErr.response.data.error.message;
    }
    if (typeof anyErr.message === 'string' && anyErr.message.trim()) {
      return anyErr.message;
    }
  }
  return fallback;
}

const DEFAULT_TIMEOUT_MS = 30000;

function isTestRuntime(): boolean {
  try {
    return (
      (typeof import.meta !== 'undefined' &&
        (import.meta as { env?: { MODE?: string } }).env?.MODE === 'test') ||
      (typeof process !== 'undefined' && process.env?.NODE_ENV === 'test')
    );
  } catch {
    return false;
  }
}

export class ApiClient {
  private baseUrl: string;
  private authToken: string | null = null;
  private tokenRefresher: (() => Promise<string | null>) | null = null;
  private refreshPromise: Promise<string | null> | null = null;
  private warmingListeners = new Set<(isWarming: boolean) => void>();

  constructor(baseUrl?: string) {
    this.baseUrl = (baseUrl || config.api.baseUrl || '').replace(/\/+$/, '');
  }

  public onWarmingChange(listener: (isWarming: boolean) => void): () => void {
    this.warmingListeners.add(listener);
    return () => {
      this.warmingListeners.delete(listener);
    };
  }

  private notifyWarming(isWarming: boolean): void {
    this.warmingListeners.forEach((listener) => {
      try {
        listener(isWarming);
      } catch {
        // Ignore listener exceptions
      }
    });
  }

  public setAuthToken(token: string | null): void {
    this.authToken = token;
  }

  public getAuthToken(): string | null {
    return this.authToken;
  }

  public setTokenRefresher(refresher: (() => Promise<string | null>) | null): void {
    this.tokenRefresher = refresher;
  }

  private async refreshAccessTokenSingleFlight(): Promise<string | null> {
    if (!this.tokenRefresher) return null;
    if (!this.refreshPromise) {
      this.refreshPromise = this.tokenRefresher()
        .then((freshToken) => {
          if (freshToken) {
            this.setAuthToken(freshToken);
          }
          return freshToken;
        })
        .catch(() => null)
        .finally(() => {
          this.refreshPromise = null;
        });
    }
    return this.refreshPromise;
  }

  public setBaseUrl(url: string): void {
    this.baseUrl = url.replace(/\/+$/, '');
  }

  public getBaseUrl(): string {
    return this.baseUrl;
  }

  private buildUrl(path: string, params?: Record<string, string | number | boolean | undefined>): string {
    let cleanPath = path.startsWith('/') ? path : `/${path}`;

    // Normalize path to prevent duplicate /api/v1 segments when baseUrl includes /api/v1
    if (this.baseUrl.endsWith('/api/v1') && cleanPath.startsWith('/api/v1/')) {
      cleanPath = cleanPath.slice(7);
    } else if (!this.baseUrl.endsWith('/api/v1') && !cleanPath.startsWith('/api/v1/') && cleanPath !== '/api/v1') {
      cleanPath = `/api/v1${cleanPath}`;
    }

    const url = new URL(`${this.baseUrl}${cleanPath}`);

    if (params) {
      Object.entries(params).forEach(([key, val]) => {
        if (val !== undefined && val !== null) {
          url.searchParams.append(key, String(val));
        }
      });
    }

    return url.toString();
  }

  private buildHeaders(customHeaders?: HeadersInit): Headers {
    const headers = new Headers(customHeaders);

    if (!headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
    if (!headers.has('Accept')) {
      headers.set('Accept', 'application/json');
    }

    if (this.authToken && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${this.authToken}`);
    }

    return headers;
  }

  private computeRetryDelay(retryIndex: number, explicitDelayMs?: number): number {
    if (explicitDelayMs !== undefined) return explicitDelayMs;
    if (isTestRuntime()) return 1;
    return Math.min(1000 * 2 ** retryIndex, 4000);
  }

  private async fetchWithTimeout(
    url: string,
    init: RequestInit,
    timeoutMs: number
  ): Promise<Response> {
    if (timeoutMs <= 0 || typeof AbortController === 'undefined') {
      return fetch(url, init);
    }

    const controller = new AbortController();
    let timedOut = false;
    const externalSignal = init.signal;

    const onExternalAbort = () => {
      controller.abort();
    };
    if (externalSignal) {
      if (externalSignal.aborted) {
        controller.abort();
      } else {
        externalSignal.addEventListener('abort', onExternalAbort, { once: true });
      }
    }

    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);

    try {
      return await fetch(url, {
        ...init,
        signal: controller.signal,
      });
    } catch (error) {
      if (timedOut) {
        throw new Error(`Request timed out after ${timeoutMs}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timer);
      externalSignal?.removeEventListener('abort', onExternalAbort);
    }
  }

  private async executeResilientFetch(
    url: string,
    headers: Headers,
    fetchOptions: RequestInit,
    options: {
      retries: number;
      retryDelayMs?: number;
      timeoutMs: number;
      skipAuthRefresh: boolean;
    }
  ): Promise<Response> {
    let attemptsRemaining = options.retries;
    let retryIndex = 0;
    let notifiedWarming = false;
    let authRetried = false;

    while (true) {
      try {
        const response = await this.fetchWithTimeout(
          url,
          { ...fetchOptions, headers },
          options.timeoutMs
        );

        if (
          response.status === 401 &&
          !options.skipAuthRefresh &&
          !authRetried &&
          this.tokenRefresher
        ) {
          authRetried = true;
          const freshToken = await this.refreshAccessTokenSingleFlight();
          if (freshToken) {
            headers.set('Authorization', `Bearer ${freshToken}`);
            continue;
          }
        }

        const isColdStartGatewayStatus =
          response.status === 502 || response.status === 503 || response.status === 504;
        if (isColdStartGatewayStatus && attemptsRemaining > 0) {
          attemptsRemaining--;
          if (!notifiedWarming) {
            notifiedWarming = true;
            this.notifyWarming(true);
          }
          const delay = this.computeRetryDelay(retryIndex++, options.retryDelayMs);
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }

        if (notifiedWarming) {
          this.notifyWarming(false);
        }

        return response;
      } catch (error) {
        const externalAborted = Boolean(fetchOptions.signal?.aborted);
        if (!externalAborted && attemptsRemaining > 0) {
          attemptsRemaining--;
          if (!notifiedWarming) {
            notifiedWarming = true;
            this.notifyWarming(true);
          }
          const delay = this.computeRetryDelay(retryIndex++, options.retryDelayMs);
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }

        if (notifiedWarming) {
          this.notifyWarming(false);
        }

        const message = error instanceof Error ? error.message : 'Network request failed';
        throw new ApiError(0, 'NETWORK_ERROR', message);
      }
    }
  }

  private async throwNormalizedHttpError(response: Response, fallbackMessage?: string): Promise<never> {
    const contentType = response.headers.get('content-type') || '';
    const isJson = contentType.includes('application/json');
    const rawData = isJson ? await response.json() : await response.text();

    if (isJson && typeof rawData === 'object' && rawData !== null && 'error' in rawData) {
      const errRes = rawData as ApiErrorResponse;
      throw new ApiError(
        response.status,
        errRes.error.code || 'API_ERROR',
        errRes.error.message || fallbackMessage || `Request failed with status ${response.status}`,
        errRes.error.details
      );
    }

    throw new ApiError(
      response.status,
      `HTTP_${response.status}`,
      typeof rawData === 'string' && rawData.length > 0
        ? rawData
        : fallbackMessage || `HTTP error ${response.status}: ${response.statusText}`
    );
  }

  public async request<T = unknown>(path: string, options: RequestOptions = {}): Promise<T> {
    const {
      params,
      headers: customHeaders,
      retries,
      retryDelayMs,
      timeoutMs = DEFAULT_TIMEOUT_MS,
      skipAuthRefresh = false,
      ...fetchOptions
    } = options;
    const method = (fetchOptions.method || 'GET').toUpperCase();
    const resolvedRetries = retries ?? (method === 'GET' ? 2 : 0);

    const url = this.buildUrl(path, params);
    const headers = this.buildHeaders(customHeaders);

    const response = await this.executeResilientFetch(url, headers, fetchOptions, {
      retries: resolvedRetries,
      retryDelayMs,
      timeoutMs,
      skipAuthRefresh,
    });

    if (!response.ok) {
      await this.throwNormalizedHttpError(response);
    }

    const contentType = response.headers.get('content-type');
    const isJson = contentType && contentType.includes('application/json');
    const rawData = isJson ? await response.json() : await response.text();

    if (isJson && typeof rawData === 'object' && rawData !== null && 'data' in rawData && 'success' in rawData) {
      return (rawData as ApiSuccessResponse<T>).data;
    }

    return rawData as T;
  }

  public async get<T = unknown>(path: string, options?: RequestOptions): Promise<T> {
    return this.request<T>(path, { ...options, method: 'GET' });
  }

  public async post<T = unknown>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>(path, {
      ...options,
      method: 'POST',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  }

  public async put<T = unknown>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>(path, {
      ...options,
      method: 'PUT',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  }

  public async patch<T = unknown>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>(path, {
      ...options,
      method: 'PATCH',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  }

  public async delete<T = unknown>(path: string, options?: RequestOptions): Promise<T> {
    return this.request<T>(path, { ...options, method: 'DELETE' });
  }

  public async download(path: string, params?: Record<string, string | number | boolean | undefined>): Promise<Blob> {
    const url = this.buildUrl(path, params);
    const headers = this.buildHeaders({
      Accept: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/json',
    });

    const response = await this.executeResilientFetch(url, headers, { method: 'GET' }, {
      retries: 2,
      timeoutMs: DEFAULT_TIMEOUT_MS,
      skipAuthRefresh: false,
    });

    if (!response.ok) {
      await this.throwNormalizedHttpError(response, 'Download failed');
    }

    return await response.blob();
  }
}

export const apiClient = new ApiClient();
