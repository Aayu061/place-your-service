// server/src/middleware/customerAuth.ts
// ═══════════════════════════════════════════════════════════════════════════
// CUSTOMER PORTAL AUTHENTICATION MIDDLEWARE
// ═══════════════════════════════════════════════════════════════════════════

import { Request, Response, NextFunction } from 'express';
import { UnauthorizedError, ForbiddenError } from '../utils/errors.js';
import { getSupabaseClient } from '../lib/supabase.js';
import { verifyCustomerToken, normalizePhone } from '../utils/customerAuth.js';
import { logger } from '../utils/logger.js';

export async function requireCustomerAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    let customerId: string | undefined;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7).trim();
      const payload = verifyCustomerToken(token);

      if (!payload) {
        logger.warn('Customer token verification failed');
        throw new UnauthorizedError('Invalid or expired customer session token.');
      }
      customerId = payload.customerId;
    } else if (req.query.phone || req.body.phone) {
      // Fallback: direct phone query for trusted portal requests
      const rawPhone = String(req.query.phone || req.body.phone);
      const cleanPhone = normalizePhone(rawPhone);

      const supabase = getSupabaseClient();
      const { data: cust, error: custErr } = await supabase
        .from('customers')
        .select('id, customer_code, name, phone, email, is_active')
        .or(`phone.eq.${cleanPhone},phone.eq.+91${cleanPhone},phone.eq.91${cleanPhone}`)
        .limit(1)
        .maybeSingle();

      if (custErr || !cust) {
        throw new UnauthorizedError('No registered customer profile found for this phone number.');
      }

      req.customer = {
        id: cust.id,
        customerCode: cust.customer_code,
        name: cust.name,
        phone: cust.phone,
        email: cust.email || undefined,
        isActive: cust.is_active,
      };

      return next();
    } else {
      throw new UnauthorizedError('Authorization header with Bearer token is required.');
    }

    const supabase = getSupabaseClient();
    const { data: customer, error } = await supabase
      .from('customers')
      .select('id, customer_code, name, phone, email, is_active')
      .eq('id', customerId)
      .maybeSingle();

    if (error || !customer) {
      logger.warn('Customer not found for token payload', { customerId });
      throw new UnauthorizedError('Customer profile not found.');
    }

    if (!customer.is_active) {
      logger.warn('Inactive customer attempted portal access', { customerId });
      throw new ForbiddenError('Customer account is deactivated. Please contact support.');
    }

    req.customer = {
      id: customer.id,
      customerCode: customer.customer_code,
      name: customer.name,
      phone: customer.phone,
      email: customer.email || undefined,
      isActive: customer.is_active,
    };

    next();
  } catch (err) {
    next(err);
  }
}
