/**
 * Place Your Service — Health API Service
 * Queries the Render backend health and readiness endpoints.
 */

import { apiClient } from './client';
import { HealthResponse, RequestOptions } from './types';

export const healthApi = {
  /**
   * Fetches the backend liveness health status.
   */
  async getHealth(options?: RequestOptions): Promise<HealthResponse> {
    return apiClient.get<HealthResponse>('/health', options);
  },

  /**
   * Fetches the backend readiness status (verifies database connectivity).
   */
  async getReadiness(options?: RequestOptions): Promise<HealthResponse> {
    return apiClient.get<HealthResponse>('/health/ready', options);
  },
};
