import { getSupabaseClient } from '../lib/supabase.js';
import {
  CustomerResponse,
  CustomerType,
  CreateCustomerPayload,
  UpdateCustomerPayload,
  CustomerListQuery,
  CustomerSiteSummary,
} from '../types/index.js';
import { ConflictError, NotFoundError, BadRequestError } from '../utils/errors.js';
import { logActivity } from './audit.service.js';
import { logger } from '../utils/logger.js';

interface RawSiteRecord {
  id: string;
  customer_id: string;
  site_name: string;
  address: string;
  contact_person: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  is_primary: boolean;
  is_active: boolean;
}

interface RawCustomerRecord {
  id: string;
  customer_code: string;
  name: string;
  company_name: string | null;
  email: string | null;
  phone: string;
  alternate_phone: string | null;
  address: string;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  customer_type: CustomerType;
  notes: string | null;
  is_active: boolean;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  customer_sites?: RawSiteRecord[] | null;
}

function mapCustomerRecord(record: RawCustomerRecord): CustomerResponse {
  const sites = record.customer_sites || [];
  const primarySite = sites.find((s) => s.is_primary) || sites[0] || null;

  const primarySiteSummary: CustomerSiteSummary | null = primarySite
    ? {
        id: primarySite.id,
        siteName: primarySite.site_name,
        address: primarySite.address,
        contactPerson: primarySite.contact_person,
        contactPhone: primarySite.contact_phone,
        contactEmail: primarySite.contact_email,
        isPrimary: primarySite.is_primary,
        isActive: primarySite.is_active,
      }
    : null;

  return {
    id: record.id,
    customerCode: record.customer_code,
    name: record.name,
    companyName: record.company_name,
    email: record.email,
    phone: record.phone,
    alternatePhone: record.alternate_phone,
    address: record.address,
    city: record.city,
    state: record.state,
    postalCode: record.postal_code,
    customerType: record.customer_type,
    notes: record.notes,
    isActive: record.is_active,
    createdBy: record.created_by,
    updatedBy: record.updated_by,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
    siteName: primarySite ? primarySite.site_name : null,
    siteContactPerson: primarySite ? primarySite.contact_person : null,
    siteContactPhone: primarySite ? primarySite.contact_phone : null,
    sitesCount: sites.length,
    primarySite: primarySiteSummary,
  };
}

export class CustomerService {
  /**
   * Generates a unique, collision-resistant customer business code (e.g., CUST-849201).
   */
  private async generateCustomerCode(): Promise<string> {
    const supabase = getSupabaseClient();
    for (let attempt = 0; attempt < 5; attempt++) {
      const randomNum = Math.floor(100000 + Math.random() * 900000);
      const code = `CUST-${randomNum}`;
      const { data } = await supabase
        .from('customers')
        .select('id')
        .eq('customer_code', code)
        .maybeSingle();

      if (!data) {
        return code;
      }
    }
    // High-entropy fallback
    const timestampSuffix = Date.now().toString(36).toUpperCase();
    return `CUST-${timestampSuffix}`;
  }

  /**
   * Server-side duplicate detection.
   * Checks whether a customer with the same phone and name/email already exists.
   */
  public async checkPotentialDuplicate(
    phone: string,
    name: string,
    email?: string,
    excludeCustomerId?: string
  ): Promise<void> {
    const supabase = getSupabaseClient();
    const cleanPhone = phone.trim();
    const cleanName = name.trim().toLowerCase();
    const cleanEmail = email?.trim().toLowerCase();

    // Query active customers with the same phone number
    let query = supabase
      .from('customers')
      .select('id, customer_code, name, email, phone, is_active')
      .eq('phone', cleanPhone)
      .eq('is_active', true);

    if (excludeCustomerId) {
      query = query.neq('id', excludeCustomerId);
    }

    const { data: phoneMatches, error: phoneErr } = await query;
    if (phoneErr) {
      logger.error('Failed to query phone duplicates', { error: phoneErr.message });
      throw new BadRequestError('Failed to verify customer duplicate status');
    }

    if (phoneMatches && phoneMatches.length > 0) {
      const exactMatch = phoneMatches.find(
        (c) =>
          c.name.trim().toLowerCase() === cleanName ||
          (cleanEmail && c.email && c.email.trim().toLowerCase() === cleanEmail)
      );

      if (exactMatch) {
        throw new ConflictError(
          `A customer with this name ("${exactMatch.name}") and phone number ("${exactMatch.phone}") already exists (${exactMatch.customer_code}).`,
          {
            duplicateField: 'phone_and_name',
            existingCustomerId: exactMatch.id,
            existingCustomerCode: exactMatch.customer_code,
            existingCustomerName: exactMatch.name,
          }
        );
      }
    }

    // Secondary check: email and exact name match (when email is supplied)
    if (cleanEmail) {
      let emailQuery = supabase
        .from('customers')
        .select('id, customer_code, name, email, is_active')
        .eq('email', cleanEmail)
        .eq('is_active', true);

      if (excludeCustomerId) {
        emailQuery = emailQuery.neq('id', excludeCustomerId);
      }

      const { data: emailMatches } = await emailQuery;
      if (emailMatches && emailMatches.length > 0) {
        const exactNameEmailMatch = emailMatches.find(
          (c) => c.name.trim().toLowerCase() === cleanName
        );

        if (exactNameEmailMatch) {
          throw new ConflictError(
            `A customer with this email ("${exactNameEmailMatch.email}") and name ("${exactNameEmailMatch.name}") already exists (${exactNameEmailMatch.customer_code}).`,
            {
              duplicateField: 'email_and_name',
              existingCustomerId: exactNameEmailMatch.id,
              existingCustomerCode: exactNameEmailMatch.customer_code,
              existingCustomerName: exactNameEmailMatch.name,
            }
          );
        }
      }
    }
  }

  /**
   * Retrieves paginated list of customers with search and filters.
   */
  public async listCustomers(query: CustomerListQuery): Promise<{
    customers: CustomerResponse[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  }> {
    const supabase = getSupabaseClient();
    const page = query.page && query.page > 0 ? query.page : 1;
    const pageSize = query.pageSize && query.pageSize > 0 && query.pageSize <= 100 ? query.pageSize : 20;
    const offset = (page - 1) * pageSize;
    const sortBy = query.sortBy || 'created_at';
    const sortOrder = query.sortOrder || 'desc';

    let dbQuery = supabase
      .from('customers')
      .select('*, customer_sites(*)', { count: 'exact' });

    // Filter: Customer Type
    if (query.type && query.type !== 'ALL') {
      dbQuery = dbQuery.eq('customer_type', query.type);
    }

    // Filter: Customer Status
    if (query.status === 'ACTIVE') {
      dbQuery = dbQuery.eq('is_active', true);
    } else if (query.status === 'INACTIVE') {
      dbQuery = dbQuery.eq('is_active', false);
    }

    // Search: Name, Company, Phone, Email, Customer Code
    if (query.search && query.search.trim().length > 0) {
      const term = query.search.trim().replace(/[%_]/g, '');
      dbQuery = dbQuery.or(
        `name.ilike.%${term}%,company_name.ilike.%${term}%,phone.ilike.%${term}%,email.ilike.%${term}%,customer_code.ilike.%${term}%`
      );
    }

    // Sorting and Pagination
    dbQuery = dbQuery
      .order(sortBy, { ascending: sortOrder === 'asc' })
      .range(offset, offset + pageSize - 1);

    const { data, error, count } = await dbQuery;

    if (error) {
      logger.error('Failed to query customers', { error: error.message });
      throw new BadRequestError('Failed to retrieve customer records');
    }

    const total = count || 0;
    const customers = ((data as unknown as RawCustomerRecord[]) || []).map(mapCustomerRecord);
    const totalPages = Math.ceil(total / pageSize) || 1;

    return {
      customers,
      total,
      page,
      pageSize,
      totalPages,
    };
  }

  /**
   * Retrieves single customer by UUID with site and relationship metadata.
   */
  public async getCustomerById(customerId: string): Promise<CustomerResponse> {
    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from('customers')
      .select('*, customer_sites(*)')
      .eq('id', customerId)
      .maybeSingle();

    if (error || !data) {
      throw new NotFoundError(`Customer not found with identifier ${customerId}`);
    }

    return mapCustomerRecord(data as unknown as RawCustomerRecord);
  }

  /**
   * Creates a new customer record and automatically provisions their primary site.
   */
  public async createCustomer(
    payload: CreateCustomerPayload,
    actorProfileId: string,
    ipAddress?: string
  ): Promise<CustomerResponse> {
    const supabase = getSupabaseClient();

    // 1. Verify duplicates
    await this.checkPotentialDuplicate(payload.phone, payload.name, payload.email);

    // 2. Generate unique business customer code
    const customerCode = await this.generateCustomerCode();

    // 3. Insert customer record
    const { data: customerData, error: customerErr } = await supabase
      .from('customers')
      .insert({
        customer_code: customerCode,
        name: payload.name.trim(),
        company_name: payload.companyName?.trim() || null,
        email: payload.email?.trim().toLowerCase() || null,
        phone: payload.phone.trim(),
        alternate_phone: payload.alternatePhone?.trim() || null,
        address: payload.address.trim(),
        city: payload.city?.trim() || null,
        state: payload.state?.trim() || null,
        postal_code: payload.postalCode?.trim() || null,
        customer_type: payload.customerType || 'TEMPORARY',
        notes: payload.notes?.trim() || null,
        is_active: true,
        created_by: actorProfileId,
        updated_by: actorProfileId,
      })
      .select()
      .single();

    if (customerErr || !customerData) {
      logger.error('Failed to insert customer record', { error: customerErr?.message });
      throw new BadRequestError(`Failed to create customer: ${customerErr?.message}`);
    }

    // 4. Provision primary site record
    const siteName = payload.siteName?.trim() || `${payload.name.trim()} - Main Site`;
    const contactPerson = payload.siteContactPerson?.trim() || payload.name.trim();
    const contactPhone = payload.siteContactPhone?.trim() || payload.phone.trim();

    const { error: siteErr } = await supabase.from('customer_sites').insert({
      customer_id: customerData.id,
      site_name: siteName,
      address: payload.address.trim(),
      contact_person: contactPerson,
      contact_phone: contactPhone,
      contact_email: payload.email?.trim().toLowerCase() || null,
      is_primary: true,
      is_active: true,
    });

    if (siteErr) {
      logger.warn('Failed to insert primary site record for new customer', {
        customerId: customerData.id,
        error: siteErr.message,
      });
    }

    // 5. Audit log
    await logActivity({
      actorProfileId,
      action: 'CUSTOMER_CREATED',
      entityType: 'customer',
      entityId: customerData.id,
      details: {
        customerCode: customerData.customer_code,
        name: customerData.name,
        customerType: customerData.customer_type,
        phone: customerData.phone,
        companyName: customerData.company_name,
      },
      ipAddress,
    });

    logger.info('Customer created successfully', {
      customerId: customerData.id,
      customerCode: customerData.customer_code,
    });

    return this.getCustomerById(customerData.id);
  }

  /**
   * Updates an existing customer and their primary site contact details.
   */
  public async updateCustomer(
    customerId: string,
    payload: UpdateCustomerPayload,
    actorProfileId: string,
    ipAddress?: string
  ): Promise<CustomerResponse> {
    const supabase = getSupabaseClient();

    // 1. Verify existence
    const existing = await this.getCustomerById(customerId);

    // 2. Check duplicate if phone, name, or email is modified
    const nextPhone = payload.phone !== undefined ? payload.phone : existing.phone;
    const nextName = payload.name !== undefined ? payload.name : existing.name;
    const nextEmail = payload.email !== undefined ? (payload.email || undefined) : (existing.email || undefined);

    if (
      nextPhone !== existing.phone ||
      nextName !== existing.name ||
      nextEmail !== (existing.email || undefined)
    ) {
      await this.checkPotentialDuplicate(nextPhone, nextName, nextEmail, customerId);
    }

    // 3. Prepare customer update fields
    const updateFields: Record<string, unknown> = {
      updated_by: actorProfileId,
    };

    if (payload.name !== undefined) updateFields.name = payload.name.trim();
    if (payload.companyName !== undefined) updateFields.company_name = payload.companyName?.trim() || null;
    if (payload.email !== undefined) updateFields.email = payload.email?.trim().toLowerCase() || null;
    if (payload.phone !== undefined) updateFields.phone = payload.phone.trim();
    if (payload.alternatePhone !== undefined) updateFields.alternate_phone = payload.alternatePhone?.trim() || null;
    if (payload.address !== undefined) updateFields.address = payload.address.trim();
    if (payload.city !== undefined) updateFields.city = payload.city?.trim() || null;
    if (payload.state !== undefined) updateFields.state = payload.state?.trim() || null;
    if (payload.postalCode !== undefined) updateFields.postal_code = payload.postalCode?.trim() || null;
    if (payload.notes !== undefined) updateFields.notes = payload.notes?.trim() || null;

    const { error: customerErr } = await supabase
      .from('customers')
      .update(updateFields)
      .eq('id', customerId);

    if (customerErr) {
      logger.error('Failed to update customer record', { customerId, error: customerErr.message });
      throw new BadRequestError(`Failed to update customer: ${customerErr.message}`);
    }

    // 4. Update primary site if site fields or address were modified
    const hasSiteUpdate =
      payload.siteName !== undefined ||
      payload.siteContactPerson !== undefined ||
      payload.siteContactPhone !== undefined ||
      payload.address !== undefined;

    if (hasSiteUpdate) {
      const siteUpdates: Record<string, unknown> = {};
      if (payload.siteName !== undefined) siteUpdates.site_name = payload.siteName?.trim();
      if (payload.siteContactPerson !== undefined) siteUpdates.contact_person = payload.siteContactPerson?.trim();
      if (payload.siteContactPhone !== undefined) siteUpdates.contact_phone = payload.siteContactPhone?.trim();
      if (payload.address !== undefined) siteUpdates.address = payload.address.trim();

      // Check if primary site exists
      const { data: existingSite } = await supabase
        .from('customer_sites')
        .select('id')
        .eq('customer_id', customerId)
        .eq('is_primary', true)
        .maybeSingle();

      if (existingSite) {
        await supabase
          .from('customer_sites')
          .update(siteUpdates)
          .eq('id', existingSite.id);
      } else if (Object.keys(siteUpdates).length > 0) {
        await supabase.from('customer_sites').insert({
          customer_id: customerId,
          site_name: (siteUpdates.site_name as string) || `${existing.name} - Main Site`,
          address: (siteUpdates.address as string) || existing.address,
          contact_person: (siteUpdates.contact_person as string) || existing.name,
          contact_phone: (siteUpdates.contact_phone as string) || existing.phone,
          is_primary: true,
          is_active: true,
        });
      }
    }

    // 5. Audit log
    await logActivity({
      actorProfileId,
      action: 'CUSTOMER_UPDATED',
      entityType: 'customer',
      entityId: customerId,
      details: {
        changedFields: Object.keys(updateFields).filter((k) => k !== 'updated_by'),
      },
      ipAddress,
    });

    return this.getCustomerById(customerId);
  }

  /**
   * Toggles customer active status (soft lifecycle management).
   */
  public async updateCustomerStatus(
    customerId: string,
    isActive: boolean,
    actorProfileId: string,
    ipAddress?: string
  ): Promise<CustomerResponse> {
    const supabase = getSupabaseClient();
    const existing = await this.getCustomerById(customerId);

    const { error } = await supabase
      .from('customers')
      .update({
        is_active: isActive,
        updated_by: actorProfileId,
      })
      .eq('id', customerId);

    if (error) {
      logger.error('Failed to update customer status', { customerId, error: error.message });
      throw new BadRequestError(`Failed to update customer status: ${error.message}`);
    }

    await logActivity({
      actorProfileId,
      action: 'CUSTOMER_STATUS_CHANGED',
      entityType: 'customer',
      entityId: customerId,
      details: {
        previousStatus: existing.isActive,
        newStatus: isActive,
      },
      ipAddress,
    });

    return this.getCustomerById(customerId);
  }

  /**
   * Idempotent conversion: TEMPORARY -> PERMANENT.
   * Preserves customer ID, notes, sites, history, and timestamps.
   */
  public async convertToPermanent(
    customerId: string,
    actorProfileId: string,
    ipAddress?: string
  ): Promise<{ message: string; customer: CustomerResponse; alreadyPermanent: boolean }> {
    const supabase = getSupabaseClient();
    const existing = await this.getCustomerById(customerId);

    // Idempotent safeguard: if already PERMANENT, return cleanly without duplicating
    if (existing.customerType === 'PERMANENT') {
      return {
        message: 'Customer is already classified as PERMANENT',
        customer: existing,
        alreadyPermanent: true,
      };
    }

    // Convert customer type
    const { error } = await supabase
      .from('customers')
      .update({
        customer_type: 'PERMANENT',
        updated_by: actorProfileId,
      })
      .eq('id', customerId);

    if (error) {
      logger.error('Failed to convert customer to permanent', { customerId, error: error.message });
      throw new BadRequestError(`Failed to convert customer to permanent: ${error.message}`);
    }

    // Audit log
    await logActivity({
      actorProfileId,
      action: 'CUSTOMER_CONVERTED_TO_PERMANENT',
      entityType: 'customer',
      entityId: customerId,
      details: {
        previousType: 'TEMPORARY',
        newType: 'PERMANENT',
        customerCode: existing.customerCode,
        customerName: existing.name,
      },
      ipAddress,
    });

    logger.info('Customer converted to PERMANENT successfully', {
      customerId,
      customerCode: existing.customerCode,
    });

    const updated = await this.getCustomerById(customerId);
    return {
      message: 'Customer successfully converted to PERMANENT',
      customer: updated,
      alreadyPermanent: false,
    };
  }
}

export const customerService = new CustomerService();
