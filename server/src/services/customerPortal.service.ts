// server/src/services/customerPortal.service.ts
// ═══════════════════════════════════════════════════════════════════════════
// CUSTOMER PORTAL SERVICE
// Aggregates equipment, service tickets, digital job cards, and AMC contracts
// Aligned strictly with live Supabase PostgreSQL schema & PYS Canonical Standards
// ═══════════════════════════════════════════════════════════════════════════

import { getSupabaseClient } from '../lib/supabase.js';
import { logger } from '../utils/logger.js';
import { NotFoundError, BadRequestError } from '../utils/errors.js';
import { generateCustomerToken, normalizePhone } from '../utils/customerAuth.js';

export interface BookServiceInput {
  customerId: string;
  siteId?: string;
  assetId?: string;
  requestType?: 'BREAKDOWN' | 'PREVENTIVE' | 'INSTALLATION' | 'UNINSTALLATION' | 'GAS_REFILL' | 'OTHER';
  description: string;
  preferredDate?: string;
}

export interface RegisterAssetInput {
  customerId: string;
  siteId?: string;
  brand: string;
  modelNumber: string;
  acType?: string;
  capacityTons?: number;
  starRating?: string;
  roomLocation?: string;
  serialNumber?: string;
}

export class CustomerPortalService {
  /**
   * Look up or auto-register a customer by phone number and return signed session token
   */
  async loginByPhone(rawPhone: string, customerName?: string) {
    const supabase = getSupabaseClient();
    const cleanPhone = normalizePhone(rawPhone);

    if (!cleanPhone || cleanPhone.length < 10) {
      throw new BadRequestError('Please provide a valid 10-digit mobile number.');
    }

    // Lookup existing customer
    const { data: existing, error: searchErr } = await supabase
      .from('customers')
      .select('id, customer_code, name, email, phone, address, city, is_active')
      .or(`phone.eq.${cleanPhone},phone.eq.+91${cleanPhone},phone.eq.91${cleanPhone},alternate_phone.eq.${cleanPhone}`)
      .order('created_at', { ascending: false })
      .limit(1);

    if (searchErr) {
      logger.error('Failed to query customer by phone', { error: searchErr.message, phone: cleanPhone });
      throw new Error('Database lookup failed');
    }

    let customer = existing?.[0];

    // If customer doesn't exist yet, auto-register if name was provided
    if (!customer) {
      if (!customerName || customerName.trim().length === 0) {
        return {
          authenticated: false,
          registered: false,
          message: 'No registered customer account found for this mobile number. Please enter your name to register.',
          phone: cleanPhone,
        };
      }

      const custCode = `CUST-${Math.floor(100000 + Math.random() * 900000)}`;
      const { data: newCust, error: createErr } = await supabase
        .from('customers')
        .insert({
          customer_code: custCode,
          name: customerName.trim(),
          phone: cleanPhone,
          address: 'Self-Registered Portal Customer',
          city: 'Mumbai',
          customer_type: 'TEMPORARY',
          is_active: true,
        })
        .select('*')
        .single();

      if (createErr || !newCust) {
        logger.error('Failed to auto-register portal customer', { error: createErr?.message });
        throw new Error('Unable to register customer account');
      }

      customer = newCust;

      // Create default primary site for this customer
      await supabase.from('customer_sites').insert({
        customer_id: customer.id,
        site_name: 'Primary Residence / Site',
        address: 'Self-Registered Portal Customer',
        is_primary: true,
        is_active: true,
      });
    }

    if (!customer.is_active) {
      throw new BadRequestError('This customer account has been deactivated. Please contact support.');
    }

    const token = generateCustomerToken({
      id: customer.id,
      customerCode: customer.customer_code,
      phone: customer.phone,
      name: customer.name,
    });

    return {
      authenticated: true,
      registered: true,
      token,
      customer: {
        id: customer.id,
        customerCode: customer.customer_code,
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
        address: customer.address,
        city: customer.city,
      },
    };
  }

  /**
   * Retrieves complete customer dashboard overview with schema-aligned queries
   */
  async getCustomerOverview(customerId: string) {
    const supabase = getSupabaseClient();

    // 1. Customer profile
    const { data: customer, error: custErr } = await supabase
      .from('customers')
      .select('*')
      .eq('id', customerId)
      .single();

    if (custErr || !customer) {
      throw new NotFoundError('Customer profile not found');
    }

    // 2. Sites
    const { data: sites } = await supabase
      .from('customer_sites')
      .select('*')
      .eq('customer_id', customerId)
      .eq('is_active', true)
      .order('is_primary', { ascending: false });

    const siteList = sites || [];
    const siteIds = siteList.map((s) => s.id);

    // 3. AC Assets
    let assets: any[] = [];
    if (siteIds.length > 0) {
      const { data: assetData } = await supabase
        .from('ac_assets')
        .select(`
          id,
          site_id,
          asset_tag,
          brand,
          model_number,
          ac_type,
          capacity_tons,
          technology,
          star_rating,
          room_location,
          warranty_status,
          warranty_end_date,
          asset_status,
          asset_condition,
          created_at
        `)
        .in('site_id', siteIds)
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      assets = assetData || [];
    }

    // 4. AMC Contracts (strictly matching live Supabase columns)
    const { data: amcContracts } = await supabase
      .from('amc_contracts')
      .select(`
        id,
        contract_number,
        status,
        start_date,
        end_date,
        frequency,
        total_amount,
        total_visits,
        dry_service_visits,
        jet_service_visits,
        pumpdown_service_visits,
        amc_plans (
          id,
          plan_code,
          name,
          category,
          description,
          coverage_summary,
          has_gas_charging,
          has_spare_parts,
          has_unlimited_complaints
        ),
        amc_assets (
          id,
          asset_id,
          notes
        )
      `)
      .eq('customer_id', customerId)
      .order('end_date', { ascending: false });

    // 5. Service Requests / Tickets
    const { data: serviceRequests } = await supabase
      .from('service_requests')
      .select(`
        id,
        request_number,
        request_type,
        priority,
        status,
        description,
        source_channel,
        preferred_date,
        resolved_at,
        created_at,
        site_id,
        asset_id
      `)
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false });

    // 6. Service Schedules & Field Reports
    const requestIds = (serviceRequests || []).map((r) => r.id);
    let schedules: any[] = [];
    let reports: any[] = [];

    if (requestIds.length > 0) {
      const { data: scheduleData } = await supabase
        .from('service_schedules')
        .select(`
          id,
          schedule_number,
          service_request_id,
          scheduled_date,
          start_time,
          end_time,
          planned_service_type,
          duration_minutes,
          status,
          technician:technicians (
            id,
            name,
            phone
          )
        `)
        .in('service_request_id', requestIds)
        .order('scheduled_date', { ascending: false });

      schedules = scheduleData || [];
      const scheduleIds = schedules.map((s) => s.id);

      if (scheduleIds.length > 0) {
        const { data: reportData } = await supabase
          .from('service_reports')
          .select(`
            id,
            report_number,
            service_schedule_id,
            service_request_id,
            service_date,
            start_time,
            end_time,
            work_description,
            observations,
            action_taken,
            recommendation,
            customer_feedback,
            customer_representative,
            primary_outcome,
            before_photo_url,
            after_photo_url,
            status,
            created_at
          `)
          .in('service_schedule_id', scheduleIds)
          .order('created_at', { ascending: false });

        reports = reportData || [];
      }
    }

    // 7. Invoices & Billing (aligned with live payments table)
    const { data: payments } = await supabase
      .from('payments')
      .select(`
        id,
        payment_number,
        service_request_id,
        amc_id,
        total_amount_due,
        total_amount_paid,
        status,
        created_at,
        updated_at
      `)
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false });

    // Format invoice records for customer UI consumption
    const formattedInvoices = (payments || []).map((p) => {
      const total = Number(p.total_amount_due) || 0;
      const paid = Number(p.total_amount_paid) || 0;
      const subtotal = total > 0 ? Math.round((total / 1.18) * 100) / 100 : 0;
      const gst = Math.round((total - subtotal) * 100) / 100;
      return {
        id: p.id,
        invoiceNumber: p.payment_number || `INV-${p.id.slice(0, 8).toUpperCase()}`,
        totalAmount: total,
        paidAmount: paid,
        subtotalAmount: subtotal,
        cgstAmount: Math.round((gst / 2) * 100) / 100,
        sgstAmount: Math.round((gst / 2) * 100) / 100,
        status: p.status,
        createdAt: p.created_at,
        updatedAt: p.updated_at,
      };
    });

    return {
      customer: {
        id: customer.id,
        customerCode: customer.customer_code,
        name: customer.name,
        companyName: customer.company_name,
        email: customer.email,
        phone: customer.phone,
        address: customer.address,
        city: customer.city,
        state: customer.state,
      },
      sites: siteList,
      assets,
      amcContracts: amcContracts || [],
      serviceRequests: serviceRequests || [],
      serviceSchedules: schedules,
      serviceReports: reports,
      invoices: formattedInvoices,
    };
  }

  /**
   * Public Ticket Tracking for status.html & guest lookups
   * Searches by request_number (e.g. SR-20261115-0001) or phone number
   */
  async trackServiceTicket(identifier: string, rawPhone?: string) {
    const supabase = getSupabaseClient();
    const cleanId = (identifier || '').trim().toUpperCase();
    const cleanPhone = rawPhone ? normalizePhone(rawPhone) : '';

    let query = supabase
      .from('service_requests')
      .select(`
        id,
        request_number,
        request_type,
        priority,
        status,
        description,
        source_channel,
        preferred_date,
        resolved_at,
        created_at,
        customer:customers (
          id,
          customer_code,
          name,
          phone,
          address,
          city
        ),
        asset:ac_assets (
          id,
          asset_tag,
          brand,
          model_number,
          ac_type,
          capacity_tons,
          room_location
        )
      `);

    if (cleanId.startsWith('SR-')) {
      query = query.eq('request_number', cleanId);
    } else if (cleanPhone && cleanPhone.length >= 10) {
      // Find customer by phone first
      const { data: cust } = await supabase
        .from('customers')
        .select('id')
        .or(`phone.eq.${cleanPhone},phone.eq.+91${cleanPhone},phone.eq.91${cleanPhone}`)
        .limit(1);

      if (cust && cust.length > 0) {
        query = query.eq('customer_id', cust[0].id).order('created_at', { ascending: false });
      } else {
        throw new NotFoundError('No service requests found for this mobile number.');
      }
    } else if (cleanId.length > 0) {
      // Try by request number exact or prefix
      query = query.or(`request_number.eq.${cleanId},request_number.ilike.%${cleanId}%`);
    } else {
      throw new BadRequestError('Please provide a valid Service Request Number (e.g. SR-20261115-0001) or Mobile Number.');
    }

    const { data: tickets, error } = await query.limit(5);

    if (error || !tickets || tickets.length === 0) {
      throw new NotFoundError(`No service ticket found matching "${identifier || rawPhone}".`);
    }

    const primaryTicket = tickets[0];

    // Fetch schedule for primary ticket
    const { data: schedule } = await supabase
      .from('service_schedules')
      .select(`
        id,
        schedule_number,
        scheduled_date,
        start_time,
        end_time,
        planned_service_type,
        status,
        technician:technicians (
          id,
          name,
          phone
        )
      `)
      .eq('service_request_id', primaryTicket.id)
      .order('scheduled_date', { ascending: false })
      .limit(1)
      .maybeSingle();

    // Map status progression milestone index (0: Received, 1: Scheduled/Assigned, 2: In Progress, 3: Completed)
    const statusMap: Record<string, number> = {
      PENDING: 0,
      SCHEDULED: 1,
      ASSIGNED: 1,
      IN_PROGRESS: 2,
      RESOLVED: 3,
      COMPLETED: 3,
      CANCELLED: -1,
    };

    const currentStep = statusMap[primaryTicket.status] !== undefined ? statusMap[primaryTicket.status] : 0;

    return {
      ticket: {
        id: primaryTicket.id,
        requestNumber: primaryTicket.request_number,
        requestType: primaryTicket.request_type,
        priority: primaryTicket.priority,
        status: primaryTicket.status,
        currentStep,
        description: primaryTicket.description,
        preferredDate: primaryTicket.preferred_date,
        createdAt: primaryTicket.created_at,
        resolvedAt: primaryTicket.resolved_at,
      },
      customer: primaryTicket.customer,
      asset: primaryTicket.asset,
      schedule: schedule || null,
      allMatchingTickets: tickets.map((t) => ({
        requestNumber: t.request_number,
        requestType: t.request_type,
        status: t.status,
        createdAt: t.created_at,
      })),
    };
  }

  /**
   * Books a service ticket from the customer portal
   */
  async bookCustomerService(input: BookServiceInput) {
    const supabase = getSupabaseClient();
    const reqNumber = `SR-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(1000 + Math.random() * 9000)}`;

    // Resolve site if not specified
    let targetSiteId = input.siteId;
    if (!targetSiteId) {
      const { data: primarySite } = await supabase
        .from('customer_sites')
        .select('id')
        .eq('customer_id', input.customerId)
        .order('is_primary', { ascending: false })
        .limit(1)
        .maybeSingle();

      targetSiteId = primarySite?.id || null;
    }

    const { data: newTicket, error } = await supabase
      .from('service_requests')
      .insert({
        request_number: reqNumber,
        customer_id: input.customerId,
        site_id: targetSiteId,
        asset_id: input.assetId || null,
        request_type: input.requestType || 'BREAKDOWN',
        priority: 'MEDIUM',
        status: 'PENDING',
        source_channel: 'EXTREME_SALES_SERVICES',
        description: input.description,
        preferred_date: input.preferredDate || new Date().toISOString().split('T')[0],
      })
      .select('*')
      .single();

    if (error) {
      logger.error('Failed to create customer portal service request', { error: error.message });
      throw new Error(`Unable to submit service ticket: ${error.message}`);
    }

    return newTicket;
  }

  /**
   * Registers a customer AC unit with canonical asset tag ESSC-XXXX
   */
  async registerAsset(input: RegisterAssetInput) {
    const supabase = getSupabaseClient();

    let targetSiteId = input.siteId;
    if (!targetSiteId) {
      const { data: primarySite } = await supabase
        .from('customer_sites')
        .select('id')
        .eq('customer_id', input.customerId)
        .order('is_primary', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!primarySite) {
        // Create a default site
        const { data: createdSite } = await supabase
          .from('customer_sites')
          .insert({
            customer_id: input.customerId,
            site_name: 'Primary Residence',
            address: 'Customer Address',
            is_primary: true,
          })
          .select('id')
          .single();
        targetSiteId = createdSite?.id;
      } else {
        targetSiteId = primarySite.id;
      }
    }

    // Generate canonical asset tag ESSC-XXXX
    const { count } = await supabase
      .from('ac_assets')
      .select('*', { count: 'exact', head: true });
    const nextSeq = (count || 0) + 1;
    const assetTag = `ESSC-${nextSeq.toString().padStart(4, '0')}`;

    const { data: asset, error } = await supabase
      .from('ac_assets')
      .insert({
        site_id: targetSiteId,
        asset_tag: assetTag,
        brand: input.brand.trim(),
        model_number: input.modelNumber.trim(),
        ac_type: input.acType || 'Split AC',
        capacity_tons: input.capacityTons ? Number(input.capacityTons) : 1.5,
        star_rating: input.starRating || '3 Star',
        room_location: input.roomLocation?.trim() || 'Living Room',
        indoor_serial_number: input.serialNumber?.trim() || null,
        warranty_status: 'OUT_OF_WARRANTY',
        asset_status: 'Active',
        asset_condition: 'Good',
        is_active: true,
      })
      .select('*')
      .single();

    if (error) {
      logger.error('Failed to register customer asset', { error: error.message });
      throw new Error(`Unable to register equipment: ${error.message}`);
    }

    return asset;
  }
}

export const customerPortalService = new CustomerPortalService();
