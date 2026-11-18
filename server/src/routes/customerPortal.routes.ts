// server/src/routes/customerPortal.routes.ts
// ═══════════════════════════════════════════════════════════════════════════
// CUSTOMER PORTAL API ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════

import { Router, Request, Response, NextFunction } from 'express';
import { customerPortalService } from '../services/customerPortal.service.js';
import { requireCustomerAuth } from '../middleware/customerAuth.js';
import { authLimiter } from '../middleware/rateLimiters.js';
import { logger } from '../utils/logger.js';

export const customerPortalRouter = Router();

/**
 * The customer portal is paused until verified (email OTP) login ships.
 * Phone-number-only login let anyone open another customer's data, so login,
 * overview, booking and asset registration return 503 until then.
 * Public ticket tracking (/track) stays available.
 */
export const CUSTOMER_PORTAL_PAUSED = true;

function portalPaused(_req: Request, res: Response, next: NextFunction) {
  if (!CUSTOMER_PORTAL_PAUSED) return next();
  return res.status(503).json({
    success: false,
    message: 'The customer portal is being upgraded with secure login. Please call +91 7977805245 or use Track Request in the meantime.',
  });
}

/**
 * POST /api/v1/portal/auth/login
 * Customer login / verification via registered mobile number
 */
customerPortalRouter.post('/auth/login', portalPaused, authLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { phone, name } = req.body;
    if (!phone) {
      return res.status(400).json({ success: false, message: 'Phone number is required.' });
    }

    const result = await customerPortalService.loginByPhone(phone, name);
    return res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    logger.warn('Customer portal login failed', { error });
    return next(error);
  }
});

/**
 * GET /api/v1/portal/overview
 * Fetches the complete portal overview for the authenticated customer
 */
customerPortalRouter.get('/overview', portalPaused, requireCustomerAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const customerId = req.customer!.id;
    const overview = await customerPortalService.getCustomerOverview(customerId);
    return res.json({
      success: true,
      data: overview,
    });
  } catch (error) {
    logger.error('Failed to get customer portal overview', { error });
    return next(error);
  }
});

/**
 * POST /api/v1/portal/book-service
 * Customer books a service request from the portal
 */
customerPortalRouter.post('/book-service', portalPaused, requireCustomerAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const customerId = req.customer!.id;
    const { assetId, siteId, requestType, description, preferredDate } = req.body;

    if (!description || description.trim().length === 0) {
      return res.status(400).json({ success: false, message: 'Please describe the issue or service needed.' });
    }

    const ticket = await customerPortalService.bookCustomerService({
      customerId,
      assetId,
      siteId,
      requestType,
      description,
      preferredDate,
    });

    return res.status(201).json({
      success: true,
      message: 'Service request created successfully',
      data: ticket,
    });
  } catch (error) {
    logger.error('Failed to book customer service', { error });
    return next(error);
  }
});

/**
 * POST /api/v1/portal/register-asset
 * Customer registers a new AC unit in their asset register
 */
customerPortalRouter.post('/register-asset', portalPaused, requireCustomerAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const customerId = req.customer!.id;
    const { siteId, brand, modelNumber, acType, capacityTons, starRating, roomLocation, serialNumber } = req.body;

    if (!brand || !modelNumber) {
      return res.status(400).json({ success: false, message: 'Brand and Model Number are required.' });
    }

    const asset = await customerPortalService.registerAsset({
      customerId,
      siteId,
      brand,
      modelNumber,
      acType,
      capacityTons,
      starRating,
      roomLocation,
      serialNumber,
    });

    return res.status(201).json({
      success: true,
      message: 'AC equipment registered successfully',
      data: asset,
    });
  } catch (error) {
    logger.error('Failed to register customer asset', { error });
    return next(error);
  }
});

/**
 * GET /api/v1/portal/track
 * Public live service tracking endpoint for status.html & quick ticket lookups
 */
customerPortalRouter.get('/track', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ticketId = (req.query.ticket as string) || (req.query.id as string) || '';
    const phone = (req.query.phone as string) || '';

    if (!ticketId || !phone) {
      return res.status(400).json({
        success: false,
        message: 'Please provide both your Request ID and the mobile number used for the booking.',
      });
    }

    const trackingData = await customerPortalService.trackServiceTicket(ticketId, phone);
    return res.json({
      success: true,
      data: trackingData,
    });
  } catch (error) {
    logger.warn('Service tracking lookup error', { error });
    return next(error);
  }
});

