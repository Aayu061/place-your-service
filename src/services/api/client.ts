/**
 * Place Your Service — Centralized API HTTP Client
 * Manages communication between Vercel frontend and Render backend API.
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

export class ApiClient {
  private baseUrl: string;
  private authToken: string | null = null;

  constructor(baseUrl?: string) {
    this.baseUrl = (baseUrl || config.api.baseUrl || '').replace(/\/+$/, '');
  }

  public setAuthToken(token: string | null): void {
    this.authToken = token;
  }

  public getAuthToken(): string | null {
    return this.authToken;
  }

  public setBaseUrl(url: string): void {
    this.baseUrl = url.replace(/\/+$/, '');
  }

  public getBaseUrl(): string {
    return this.baseUrl;
  }

  private buildUrl(path: string, params?: Record<string, string | number | boolean | undefined>): string {
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
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

  public async request<T = unknown>(path: string, options: RequestOptions = {}): Promise<T> {
    const { params, headers: customHeaders, ...fetchOptions } = options;
    const url = this.buildUrl(path, params);
    const headers = this.buildHeaders(customHeaders);

    try {
      const response = await fetch(url, {
        ...fetchOptions,
        headers,
      });

      const contentType = response.headers.get('content-type');
      const isJson = contentType && contentType.includes('application/json');
      const rawData = isJson ? await response.json() : await response.text();

      if (!response.ok) {
        // Structured API error response
        if (isJson && typeof rawData === 'object' && rawData !== null && 'error' in rawData) {
          const errRes = rawData as ApiErrorResponse;
          throw new ApiError(
            response.status,
            errRes.error.code || 'API_ERROR',
            errRes.error.message || `Request failed with status ${response.status}`,
            errRes.error.details
          );
        }

        // Generic HTTP error response
        throw new ApiError(
          response.status,
          `HTTP_${response.status}`,
          typeof rawData === 'string' && rawData.length > 0
            ? rawData
            : `HTTP error ${response.status}: ${response.statusText}`
        );
      }

      // Check if structured payload: { success: true, data: T }
      if (isJson && typeof rawData === 'object' && rawData !== null && 'data' in rawData && 'success' in rawData) {
        return (rawData as ApiSuccessResponse<T>).data;
      }

      return rawData as T;
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }

      // Network / connectivity failure
      const message = error instanceof Error ? error.message : 'Network request failed';
      throw new ApiError(0, 'NETWORK_ERROR', message);
    }
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
}

export const apiClient = new ApiClient();
