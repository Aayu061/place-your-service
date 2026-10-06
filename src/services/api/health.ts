/**
 * Place Your Service — Health API Service
 * Queries the Render backend health and readiness endpoints.
 */

import { apiClient } from './client';
import { HealthResponse } from './types';

export const healthApi = {
  /**
   * Fetches the backend liveness health status.
   */
  async getHealth(): Promise<HealthResponse> {
    return apiClient.get<HealthResponse>('/api/v1/health');
  },

  /**
   * Fetches the backend readiness status (verifies database connectivity).
   */
  async getReadiness(): Promise<HealthResponse> {
    return apiClient.get<HealthResponse>('/api/v1/health/ready');
  },
};
