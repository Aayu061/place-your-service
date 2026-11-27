import { Router, Request, Response, NextFunction } from 'express';
import { requireIntegrationClient } from '../../middleware/integrationAuth.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { CodeRejectedError, customerAccountService } from '../../services/customerAccount.service.js';

/**
 * S11 customer accounts (/api/v1/ess/portal). Every route needs the ESS server's signed request (scope portal:access).
 * The customer's session token travels in X-PYS-Customer-Session (the ESS server keeps it in an httpOnly cookie).
 * Answers never reveal whether an email has an account.
 */
export const essPortalRouter = Router();

const wrap =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

const signed = requireIntegrationClient('portal:access');

/**
 * Global kill switch. Customer accounts answer only when PORTAL_ENABLED=true (read per request, so tests and a
 * Render env change take effect without code changes). Default OFF: deploying the code alone exposes nothing.
 */
export function isPortalEnabled(): boolean {
  return process.env.PORTAL_ENABLED?.trim().toLowerCase() === 'true';
}

essPortalRouter.use((_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  if (!isPortalEnabled()) {
    return res
      .status(503)
      .json({ success: false, error: { code: 'PORTAL_OFF', message: 'Customer accounts are not available right now.' } });
  }
  next();
});

/** Always 202: the same answer whether or not the email can sign in (a code is emailed only when it can). */
essPortalRouter.post(
  '/code',
  signed,
  wrap(async (req, res) => {
    await customerAccountService.requestCode(req.body?.email);
    return res.status(202).json({ success: true, data: { sent: true } });
  })
);

essPortalRouter.post(
  '/sign-in',
  signed,
  wrap(async (req, res) => {
    try {
      return sendSuccess(res, await customerAccountService.verifyCode(req.body?.email, req.body?.code));
    } catch (err) {
      if (err instanceof CodeRejectedError) return res.status(401).json({ success: false, error: { code: 'CODE_REJECTED', message: err.message } });
      throw err;
    }
  })
);

essPortalRouter.post(
  '/sign-out',
  signed,
  wrap(async (req, res) => {
    await customerAccountService.signOut(req.get('X-PYS-Customer-Session'));
    return sendSuccess(res, { signedOut: true });
  })
);

essPortalRouter.get(
  '/me',
  signed,
  wrap(async (req, res) => {
    const customerId = await customerAccountService.resolveSession(req.get('X-PYS-Customer-Session'));
    if (!customerId) return res.status(401).json({ success: false, error: { code: 'SESSION_ENDED', message: 'Please sign in again.' } });
    return sendSuccess(res, await customerAccountService.overview(customerId));
  })
);
