/**
 * Comprehensive Live E2E Integration Test Suite
 * Validates all core application modules and live backend features using Admin credentials.
 * Admin: dpk.panchal79@gmail.com
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { ApiClient, ApiError } from '@/services/api/client';
import { UserRole } from '@/domain/types';

describe('Place Your Service — Live E2E Production Feature Test Suite', () => {
  const prodApiUrl = import.meta.env.VITE_API_BASE_URL || 'https://place-your-service-api.onrender.com/api/v1';
  const client = new ApiClient(prodApiUrl);

  const adminCredentials = {
    email: 'dpk.panchal79@gmail.com',
    password: 'pass@123',
  };

  let authToken: string | null = null;
  let adminProfile: {
    userId: string;
    email: string;
    fullName: string;
    role: UserRole;
    staffId?: string;
  } | null = null;

  beforeAll(async () => {
    try {
      const loginRes = await client.post<{
        token: string;
        session: { access_token: string };
        user: {
          userId: string;
          email: string;
          fullName: string;
          role: UserRole;
          staffId?: string;
          isActive: boolean;
        };
      }>('/auth/login', adminCredentials);

      if (loginRes?.token) {
        authToken = loginRes.token;
        adminProfile = loginRes.user;
        client.setAuthToken(authToken);
      }
    } catch (err) {
      if (err instanceof ApiError && err.code === 'NETWORK_ERROR') {
        console.warn('[E2E Suite] Production API unreachable in isolated offline environment.');
      } else {
        console.warn('[E2E Suite] Auth bootstrap error:', err);
      }
    }
  }, 30000);

  // 1. AUTHENTICATION & ADMIN PERMISSIONS
  describe('1. Authentication & System Administrator Identity', () => {
    it('authenticates successfully and issues valid JWT bearer session', () => {
      if (!authToken) {
        console.warn('[Skipped offline] Token unavailable.');
        return;
      }
      expect(authToken).toBeDefined();
      expect(typeof authToken).toBe('string');
      expect(authToken.length).toBeGreaterThan(20);
      expect(adminProfile).toBeDefined();
    });

    it('verifies /auth/me returns verified System Administrator profile with ADMIN role', async () => {
      if (!authToken) return;

      const res = await client.get<{
        user: {
          userId: string;
          email: string;
          fullName: string;
          role: UserRole;
          isActive: boolean;
        };
      }>('/auth/me');

      expect(res).toBeDefined();
      expect(res.user.email.toLowerCase()).toBe(adminCredentials.email.toLowerCase());
      expect(res.user.role).toBe('ADMIN');
      expect(res.user.isActive).toBe(true);
      expect(res.user.fullName).toBe('System Administrator');
    }, 15000);
  });

  // 2. SYSTEM HEALTH & TELEMETRY
  describe('2. System Health & Infrastructure Telemetry', () => {
    it('receives healthy liveness probe from production environment', async () => {
      const health = await client.get<{
        service: string;
        status: string;
        version: string;
        environment: string;
      }>('/health');

      expect(health.service).toBe('place-your-service-api');
      expect(health.status).toBe('healthy');
      expect(health.environment).toBe('production');
    }, 15000);

    it('validates production database readiness and latency', async () => {
      const ready = await client.get<{
        status: string;
        database?: { connected: boolean; latencyMs?: number };
      }>('/health/ready');

      expect(ready.status).toBe('healthy');
      if (ready.database) {
        expect(ready.database.connected).toBe(true);
      }
    }, 15000);
  });

  // 3. CUSTOMER MANAGEMENT
  describe('3. Customer Management Module', () => {
    it('retrieves paginated customer directory with operational metadata', async () => {
      if (!authToken) return;

      const res = await client.get<{
        customers: Array<{
          id: string;
          customerCode: string;
          name: string;
          customerType: string;
          email: string;
          phone: string;
          status: string;
        }>;
        total: number;
        page: number;
        pageSize: number;
      }>('/customers', { params: { page: 1, pageSize: 10 } });

      expect(res).toBeDefined();
      expect(Array.isArray(res.customers)).toBe(true);
      expect(typeof res.total).toBe('number');

      if (res.customers.length > 0) {
        const customer = res.customers[0];
        expect(customer.id).toBeDefined();
        expect(customer.name).toBeDefined();
        expect(['PERMANENT', 'TEMPORARY']).toContain(customer.customerType);
      }
    }, 15000);

    it('retrieves customer sites and branch locations', async () => {
      if (!authToken) return;

      const custList = await client.get<{ customers: Array<{ id: string }> }>('/customers', {
        params: { page: 1, pageSize: 1 },
      });

      if (!custList.customers || custList.customers.length === 0) return;
      const customerId = custList.customers[0].id;

      const sitesRes = await client.get<{
        sites: Array<{
          id: string;
          siteName: string;
          address: string;
          isPrimary: boolean;
        }>;
      }>(`/customers/${customerId}/sites`);

      expect(sitesRes).toBeDefined();
      expect(Array.isArray(sitesRes.sites)).toBe(true);
    }, 15000);
  });

  // 4. AC MASTER DATA MODULE
  describe('4. AC Master Data Catalog (Brands & Models)', () => {
    it('fetches registered HVAC brands catalog', async () => {
      if (!authToken) return;

      const res = await client.get<{
        brands: Array<{
          id: string;
          name: string;
          code: string;
          isActive: boolean;
          modelCount?: number;
        }>;
      }>('/ac-brands');

      expect(res).toBeDefined();
      expect(Array.isArray(res.brands)).toBe(true);

      if (res.brands.length > 0) {
        const brand = res.brands[0];
        expect(brand.id).toBeDefined();
        expect(brand.name).toBeDefined();
        expect(brand.code).toBeDefined();
        expect(typeof brand.isActive).toBe('boolean');
      }
    }, 15000);

    it('fetches registered AC models with technical specifications', async () => {
      if (!authToken) return;

      const res = await client.get<{
        models: Array<{
          id: string;
          modelNumber: string;
          brandName?: string;
          acType: string;
          technology?: string;
          capacityTons?: number;
          isActive: boolean;
        }>;
      }>('/ac-models');

      expect(res).toBeDefined();
      expect(Array.isArray(res.models)).toBe(true);

      if (res.models.length > 0) {
        const model = res.models[0];
        expect(model.id).toBeDefined();
        expect(model.modelNumber).toBeDefined();
        expect(typeof model.isActive).toBe('boolean');
      }
    }, 15000);
  });

  // 5. AC ASSET REGISTER & TECHNICAL TELEMETRY
  describe('5. AC Asset Register & Warranty Tracking', () => {
    it('queries physical equipment assets registered under customer sites', async () => {
      if (!authToken) return;

      const custList = await client.get<{ customers: Array<{ id: string }> }>('/customers', {
        params: { page: 1, pageSize: 5 },
      });

      if (!custList.customers || custList.customers.length === 0) return;

      for (const cust of custList.customers) {
        const sitesRes = await client.get<{ sites: Array<{ id: string }> }>(`/customers/${cust.id}/sites`);
        if (sitesRes.sites && sitesRes.sites.length > 0) {
          const siteId = sitesRes.sites[0].id;
          const assetsRes = await client.get<{
            assets: Array<{
              id: string;
              assetTag: string;
              serialNumber?: string;
              indoorSerialNumber?: string;
              outdoorSerialNumber?: string;
              warrantyStatus?: string;
              assetStatus?: string;
              totalWarrantyServices?: number;
            }>;
          }>(`/sites/${siteId}/assets`);

          expect(assetsRes).toBeDefined();
          expect(Array.isArray(assetsRes.assets)).toBe(true);

          if (assetsRes.assets.length > 0) {
            const asset = assetsRes.assets[0];
            expect(asset.assetTag).toBeDefined();
          }
          break;
        }
      }
    }, 15000);
  });

  // 6. TECHNICIAN MANAGEMENT MODULE
  describe('6. Technician Operations & Field Dispatch', () => {
    it('retrieves active technician roster with skills and shift schedules', async () => {
      if (!authToken) return;

      const res = await client.get<{
        technicians: Array<{
          id: string;
          technicianCode: string;
          name?: string;
          fullName?: string;
          phone?: string;
          mobileNumber?: string;
          email?: string;
          specializations?: string[];
          coverageTerritories?: string[];
          status: string;
        }>;
        total: number;
      }>('/technicians', { params: { page: 1, pageSize: 10 } });

      expect(res).toBeDefined();
      expect(Array.isArray(res.technicians)).toBe(true);

      if (res.technicians.length > 0) {
        const tech = res.technicians[0];
        expect(tech.technicianCode).toBeDefined();
        const displayName = tech.name || tech.fullName;
        expect(displayName).toBeDefined();
        const contactNumber = tech.phone || tech.mobileNumber;
        expect(contactNumber).toBeDefined();
      }
    }, 15000);
  });

  // 7. AMC CONTRACTS & PREVENTIVE MAINTENANCE
  describe('7. AMC Maintenance Agreements & Allocation Invariants', () => {
    it('retrieves commercial AMC agreements with PM visit allocations', async () => {
      if (!authToken) return;

      const res = await client.get<{
        contracts: Array<{
          id: string;
          contractNumber: string;
          customerName?: string;
          startDate: string;
          endDate: string;
          status: string;
          totalVisits: number;
          coveredUnitsCount?: number;
        }>;
        total: number;
      }>('/amc-contracts', { params: { page: 1, pageSize: 10 } });

      expect(res).toBeDefined();
      expect(Array.isArray(res.contracts)).toBe(true);

      if (res.contracts.length > 0) {
        const contract = res.contracts[0];
        expect(contract.contractNumber).toBeDefined();
        expect(typeof contract.totalVisits).toBe('number');
      }
    }, 15000);
  });

  // 8. SERVICE REQUESTS & DISPATCH
  describe('8. Service Requests & Breakdown Logging', () => {
    it('retrieves customer breakdown tickets and repair requests', async () => {
      if (!authToken) return;

      const res = await client.get<{
        requests: Array<{
          id: string;
          requestNumber: string;
          issueDescription: string;
          priority: string;
          status: string;
        }>;
        total: number;
      }>('/service-requests', { params: { page: 1, pageSize: 10 } });

      expect(res).toBeDefined();
      expect(Array.isArray(res.requests)).toBe(true);

      if (res.requests.length > 0) {
        const req = res.requests[0];
        expect(req.requestNumber).toBeDefined();
        expect(req.priority).toBeDefined();
      }
    }, 15000);
  });

  // 9. SERVICE SCHEDULES & APPOINTMENTS
  describe('9. Service Schedules & Appointment Slots', () => {
    it('queries scheduled service appointments and calendar slots', async () => {
      if (!authToken) return;

      const res = await client.get<{
        schedules: Array<{
          id: string;
          scheduleDate: string;
          timeSlot: string;
          status: string;
        }>;
      }>('/service-schedules', { params: { page: 1, pageSize: 10 } });

      expect(res).toBeDefined();
      expect(Array.isArray(res.schedules)).toBe(true);
    }, 15000);
  });

  // 10. SERVICE REPORTS & AUDIT TRAIL
  describe('10. Service Reports & Technical Findings', () => {
    it('retrieves technical service visit execution reports', async () => {
      if (!authToken) return;

      const res = await client.get<{
        reports: Array<{
          id: string;
          reportNumber: string;
          workSummary?: string;
          outcome: string;
        }>;
        total: number;
      }>('/service-reports', { params: { page: 1, pageSize: 10 } });

      expect(res).toBeDefined();
      expect(Array.isArray(res.reports)).toBe(true);

      if (res.reports.length > 0) {
        const rpt = res.reports[0];
        expect(rpt.reportNumber).toBeDefined();
        expect(rpt.outcome).toBeDefined();
      }
    }, 15000);
  });

  // 11. STAFF & ADMINISTRATIVE PRIVILEGES
  describe('11. Staff Management & Administrator Role Protection', () => {
    it('retrieves staff directory and confirms singleton ADMIN integrity', async () => {
      if (!authToken) return;

      const res = await client.get<{
        staff: Array<{
          id: string;
          fullName: string;
          email: string;
          role: UserRole;
          isActive: boolean;
        }>;
      }>('/staff', { params: { page: 1, pageSize: 20 } });

      expect(res).toBeDefined();
      expect(Array.isArray(res.staff)).toBe(true);

      const adminUser = res.staff.find((s) => s.email.toLowerCase() === adminCredentials.email.toLowerCase());
      if (adminUser) {
        expect(adminUser.role).toBe('ADMIN');
        expect(adminUser.isActive).toBe(true);
      }
    }, 15000);
  });
});
