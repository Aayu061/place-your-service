// server/src/routes/essStorefront.routes.ts
// ═══════════════════════════════════════════════════════════════════════════
// EXTREME SALES & SERVICES (ESS) STOREFRONT API (SUPABASE BACKED)
// Direct access to ess_products and contact_enquiries
// ═══════════════════════════════════════════════════════════════════════════

import { Router, Request, Response, NextFunction } from 'express';
import { getSupabaseClient } from '../lib/supabase.js';
import { nextBusinessNumber } from '../utils/businessNumber.js';
import { logger } from '../utils/logger.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { normalizePhone } from '../utils/customerAuth.js';

export const essStorefrontRouter = Router();

/**
 * The storefront sells new air conditioners only (residential, commercial,
 * industrial). Refurbished/used units and spare parts are no longer sold.
 */
export const NEW_AC_CATEGORY = 'new_ac';
export const BLOCKED_PRODUCT_CATEGORIES = ['refurbished', 'used_ac', 'used', 'spare_parts', 'spare_part'] as const;

export function isBlockedProductCategory(category: unknown): boolean {
  return typeof category === 'string' && (BLOCKED_PRODUCT_CATEGORIES as readonly string[]).includes(category.trim().toLowerCase());
}

/**
 * GET /api/v1/ess-products
 * Public / Admin: Retrieves all storefront products
 */
essStorefrontRouter.get('/ess-products', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('ess_products')
      .select('*')
      .not('category', 'in', `(${BLOCKED_PRODUCT_CATEGORIES.join(',')})`)
      .order('created_at', { ascending: false });

    if (error) {
      logger.error('Failed to query ess_products', { error: error.message });
      return res.status(500).json({ success: false, message: 'Unable to load products right now.' });
    }

    return res.json({
      success: true,
      products: data || [],
    });
  } catch (error) {
    return next(error);
  }
});

/**
 * POST /api/v1/ess-products
 * Admin/Staff: Upserts a storefront product into Supabase (new ACs only)
 */
essStorefrontRouter.post('/ess-products', requireAuth, requireRole('ADMIN', 'STAFF'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const supabase = getSupabaseClient();
    const {
      id,
      name,
      category,
      price,
      price_display,
      stock,
      in_stock,
      brand,
      model_number,
      tonnage,
      star_rating,
      condition,
      description,
      image_url,
    } = req.body;

    if (isBlockedProductCategory(category)) {
      return res.status(400).json({ success: false, message: 'Only new air conditioners can be listed on the storefront.' });
    }
    if (!name || typeof name !== 'string' || name.trim().length < 2) {
      return res.status(400).json({ success: false, message: 'Product name is required.' });
    }

    const prodId = id || `prod-${Date.now()}`;
    const productPayload = {
      id: prodId,
      name,
      category: typeof category === 'string' && category.trim() ? category.trim().toLowerCase() : NEW_AC_CATEGORY,
      price: Number(price) || 0,
      price_display: price_display || `₹${(Number(price) || 0).toLocaleString('en-IN')}`,
      stock: Number(stock) || 0,
      in_stock: in_stock !== undefined ? in_stock : (Number(stock) || 0) > 0,
      brand: brand || null,
      model_number: model_number || null,
      tonnage: tonnage || null,
      star_rating: star_rating || null,
      condition: condition || 'Brand New',
      description: description || null,
      image_url: image_url || null,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('ess_products')
      .upsert(productPayload, { onConflict: 'id' })
      .select('*')
      .single();

    if (error) {
      logger.error('Failed to upsert ess_product', { error: error.message });
      return res.status(500).json({ success: false, message: 'Unable to save the product right now.' });
    }

    return res.status(201).json({
      success: true,
      product: data,
    });
  } catch (error) {
    return next(error);
  }
});

/**
 * GET /api/v1/contact-enquiries
 * Admin/Staff: Lists web enquiries from contact forms (contains personal data — never public)
 */
essStorefrontRouter.get('/contact-enquiries', requireAuth, requireRole('ADMIN', 'STAFF'), async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('contact_enquiries')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      logger.error('Failed to query contact_enquiries', { error: error.message });
      return res.status(500).json({ success: false, message: 'Unable to load enquiries right now.' });
    }

    return res.json({
      success: true,
      enquiries: data || [],
    });
  } catch (error) {
    return next(error);
  }
});

/**
 * POST /api/v1/contact-enquiries
 * Public: Submits contact form enquiry from ESS storefront
 */
essStorefrontRouter.post('/contact-enquiries', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const supabase = getSupabaseClient();
    const {
      name,
      phone,
      email,
      service_type,
      serviceType,
      subject,
      message,
      source_channel,
      sourceChannel,
      productOfInterest,
    } = req.body;

    if (!name || (!phone && !email)) {
      return res.status(400).json({ success: false, message: 'Name and either a phone number or email are required.' });
    }

    const enqNumber = await nextBusinessNumber('ENQUIRY', () => `ENQ-${Math.floor(100000 + Math.random() * 900000)}`);
    const effectiveServiceType = serviceType || service_type || null;
    const effectiveSource = sourceChannel || source_channel || 'EXTREME_SALES_SERVICES';
    const effectiveSubject = subject || (productOfInterest ? `Inquiry for ${productOfInterest}` : (effectiveServiceType || 'Customer Service Request'));
    const resolvedPhone = phone ? phone.trim() : 'N/A';

    const { data, error } = await supabase
      .from('contact_enquiries')
      .insert({
        enquiry_number: enqNumber,
        name: name.trim(),
        phone: resolvedPhone,
        email: email?.trim() || null,
        service_type: effectiveServiceType,
        subject: effectiveSubject,
        message: message || null,
        source_channel: effectiveSource,
        status: 'NEW',
      })
      .select('*')
      .single();

    if (error) {
      logger.error('Failed to insert contact_enquiry', { error: error.message });
      return res.status(500).json({ success: false, message: 'Unable to submit your enquiry right now. Please call us instead.' });
    }

    return res.status(201).json({
      success: true,
      message: 'Enquiry submitted successfully',
      enquiry: data,
      data,
      enquiryNumber: enqNumber,
    });
  } catch (error) {
    return next(error);
  }
});

/**
 * POST /api/v1/contact-enquiries/:id/convert
 * 1-Click Conversion: Converts an inquiry into a Customer account and Service Ticket
 */
essStorefrontRouter.post(
  '/contact-enquiries/:id/convert',
  requireAuth,
  requireRole('ADMIN', 'STAFF'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const enquiryId = String(id);
      const supabase = getSupabaseClient();

      // 1. Fetch enquiry
      const { data: enq, error: fetchErr } = await supabase
        .from('contact_enquiries')
        .select('*')
        .eq('id', enquiryId)
        .single();

      if (fetchErr || !enq) {
        return res.status(404).json({ success: false, message: 'Enquiry not found.' });
      }

      const cleanPhone = normalizePhone(enq.phone);

      // 2. Find or create customer
      let customerId: string;
      let customerCode: string;

      const { data: existingCust } = await supabase
        .from('customers')
        .select('id, customer_code')
        .or(`phone.eq.${cleanPhone},phone.eq.+91${cleanPhone}`)
        .limit(1)
        .maybeSingle();

      if (existingCust) {
        customerId = existingCust.id;
        customerCode = existingCust.customer_code;
      } else {
        customerCode = await nextBusinessNumber('CUSTOMER', () => `CUST-${Math.floor(100000 + Math.random() * 900000)}`);
        const { data: newCust, error: custErr } = await supabase
          .from('customers')
          .insert({
            customer_code: customerCode,
            name: enq.name,
            phone: cleanPhone,
            email: enq.email || null,
            address: 'Customer Address (Converted from ESS Inquiry)',
            city: 'Mumbai',
            customer_type: 'TEMPORARY',
            is_active: true,
          })
          .select('id, customer_code')
          .single();

        if (custErr || !newCust) {
          throw new Error(`Failed to create customer: ${custErr?.message}`);
        }
        customerId = newCust.id;

        // Create default site
        await supabase.from('customer_sites').insert({
          customer_id: customerId,
          site_name: 'Primary Location',
          address: 'Customer Address (Converted from ESS Inquiry)',
          city: 'Mumbai',
          state: 'Maharashtra',
          is_primary: true,
          is_active: true,
        });
      }

      // 3. Resolve primary site
      const { data: site } = await supabase
        .from('customer_sites')
        .select('id')
        .eq('customer_id', customerId)
        .order('is_primary', { ascending: false })
        .limit(1)
        .maybeSingle();

      // 4. Create Service Request ticket
      const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const reqNumber = await nextBusinessNumber('SERVICE_REQUEST', () => `SR-${todayStr}-${Math.floor(1000 + Math.random() * 9000)}`);

      const { data: newTicket, error: ticketErr } = await supabase
        .from('service_requests')
        .insert({
          request_number: reqNumber,
          customer_id: customerId,
          site_id: site?.id || null,
          request_type: 'BREAKDOWN',
          priority: 'HIGH',
          status: 'PENDING',
          source_channel: 'EXTREME_SALES_SERVICES',
          description: `Converted from ${enq.enquiry_number}: ${enq.subject || ''} - ${enq.message || ''}`,
          preferred_date: new Date().toISOString().split('T')[0],
        })
        .select('*')
        .single();

      if (ticketErr || !newTicket) {
        throw new Error(`Failed to create service ticket: ${ticketErr?.message}`);
      }

      // 5. Mark enquiry as converted
      await supabase
        .from('contact_enquiries')
        .update({
          status: 'CONVERTED',
          notes: `Converted to Customer ${customerCode} & Ticket ${reqNumber}`,
        })
        .eq('id', enquiryId);

      return res.json({
        success: true,
        message: `Successfully converted inquiry to Customer ${customerCode} and Service Ticket ${reqNumber}.`,
        data: {
          customerCode,
          requestNumber: reqNumber,
          ticket: newTicket,
        },
      });
    } catch (error: any) {
      logger.error('Failed to convert inquiry', { error: error.message });
      return next(error);
    }
  }
);

