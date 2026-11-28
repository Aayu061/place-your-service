import { Router, Request, Response, NextFunction } from 'express';
import { requireIntegrationClient } from '../../middleware/integrationAuth.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { CodeRejectedError, RateLimitedError, customerAccountService } from '../../services/customerAccount.service.js';
import {
  NotRenewableError,
  PortalInputError,
  PortalRateLimitedError,
  customerPortalDataService,
} from '../../services/customerPortalData.service.js';

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
  next();
});

// Every route, including /status, needs the ESS server's signed request. It runs before the kill switch so an
// unsigned caller cannot even learn whether customer accounts are on (it gets the same refusal either way).
essPortalRouter.use(signed);

essPortalRouter.use((_req, res, next) => {
  if (!isPortalEnabled()) {
    return res
      .status(503)
      .json({ success: false, error: { code: 'PORTAL_OFF', message: 'Customer accounts are not available right now.' } });
  }
  next();
});

/** Lets ESS decide between the sign-in form and its "coming soon" page (the switch above answers 503 when off). */
essPortalRouter.get('/status', (_req, res) => sendSuccess(res, { enabled: true }));

/** F3: per visitor, so it says nothing about any account. */
const rateLimited = (res: Response, err: RateLimitedError) =>
  res.status(429).json({ success: false, error: { code: 'RATE_LIMITED', message: err.message } });

/**
 * Always 202, in the same time, whether or not the email can sign in: the account lookup and the email happen after
 * the answer. `clientIpHash` (64 lowercase hex, as for /track) is the per-visitor limit key; requests without a valid
 * one share a single strict bucket. 429 RATE_LIMITED over the limit.
 */
essPortalRouter.post(
  '/code',
  wrap(async (req, res) => {
    try {
      await customerAccountService.startCodeRequest(req.body?.email, req.body?.clientIpHash);
    } catch (err) {
      if (err instanceof RateLimitedError) return rateLimited(res, err);
      throw err;
    }
    return res.status(202).json({ success: true, data: { sent: true } });
  })
);

essPortalRouter.post(
  '/sign-in',
  wrap(async (req, res) => {
    try {
      return sendSuccess(res, await customerAccountService.verifyCode(req.body?.email, req.body?.code, req.body?.clientIpHash));
    } catch (err) {
      if (err instanceof CodeRejectedError) return res.status(401).json({ success: false, error: { code: 'CODE_REJECTED', message: err.message } });
      if (err instanceof RateLimitedError) return rateLimited(res, err);
      throw err;
    }
  })
);

essPortalRouter.post(
  '/sign-out',
  wrap(async (req, res) => {
    await customerAccountService.signOut(req.get('X-PYS-Customer-Session'));
    return sendSuccess(res, { signedOut: true });
  })
);

essPortalRouter.get(
  '/me',
  wrap(async (req, res) => {
    const customerId = await customerAccountService.resolveSession(req.get('X-PYS-Customer-Session'));
    if (!customerId) return res.status(401).json({ success: false, error: { code: 'SESSION_ENDED', message: 'Please sign in again.' } });
    return sendSuccess(res, await customerAccountService.overview(customerId));
  })
);

/* ------------------------------------------------------------------------------------------------------------------
 * S11b customer portal v2 (contract: DOCS/architecture/S11b-PORTAL-API-CONTRACT.md). Every route: signed ESS call + a live
 * customer session; the customer id comes only from the session. Anything that is not the customer's own (or does
 * not exist, or has a malformed id / number) gets the same 404 answer.
 * ---------------------------------------------------------------------------------------------------------------- */

const SESSION_ENDED = { success: false, error: { code: 'SESSION_ENDED', message: 'Please sign in again.' } };
// details.portal tells ESS this 404 came from a portal route (the id is not this customer's, or their account data
// is missing), unlike the 404 of a PYS that does not have the route at all (ESS shows "coming soon" for that one).
const NOT_FOUND = { success: false, error: { code: 'NOT_FOUND', message: 'We could not find that.', details: { portal: true } } };

/** Resolves the session or answers 401; then runs the handler with the session's customer id. */
const withCustomer = (fn: (customerId: string, req: Request, res: Response) => Promise<unknown>) =>
  wrap(async (req, res) => {
    const customerId = await customerAccountService.resolveSession(req.get('X-PYS-Customer-Session'));
    if (!customerId) return res.status(401).json(SESSION_ENDED);
    try {
      return await fn(customerId, req, res);
    } catch (err) {
      if (err instanceof PortalInputError) return res.status(400).json({ success: false, error: { code: 'INVALID_INPUT', message: err.message } });
      if (err instanceof PortalRateLimitedError) return res.status(429).json({ success: false, error: { code: 'RATE_LIMITED', message: err.message } });
      if (err instanceof NotRenewableError) return res.status(409).json({ success: false, error: { code: 'NOT_RENEWABLE', message: err.message } });
      throw err;
    }
  });

const answer = (res: Response, data: unknown) => (data === null ? res.status(404).json(NOT_FOUND) : sendSuccess(res, data));
const param = (req: Request, name: string): string => String(req.params[name] ?? '');

essPortalRouter.get('/overview', withCustomer(async (id, _req, res) => answer(res, await customerPortalDataService.overview(id))));
essPortalRouter.get('/acs', withCustomer(async (id, _req, res) => answer(res, await customerPortalDataService.listAcs(id))));
essPortalRouter.get('/acs/:id', withCustomer(async (id, req, res) => answer(res, await customerPortalDataService.getAc(id, param(req, 'id')))));
essPortalRouter.get('/amc', withCustomer(async (id, _req, res) => answer(res, await customerPortalDataService.listContracts(id))));
essPortalRouter.get('/amc/:id', withCustomer(async (id, req, res) => answer(res, await customerPortalDataService.getContract(id, param(req, 'id')))));
essPortalRouter.post(
  '/amc/:id/renew',
  withCustomer(async (id, req, res) => {
    const out = await customerPortalDataService.requestRenewal(id, param(req, 'id'), req.body?.note);
    if (!out) return res.status(404).json(NOT_FOUND);
    // alreadyRequested: an open request for this contract existed; its reference is returned (nothing new stored).
    return sendSuccess(res, { requested: true, reference: out.reference, alreadyRequested: !out.created }, out.created ? 201 : 200);
  })
);
essPortalRouter.get(
  '/requests',
  withCustomer(async (id, req, res) => answer(res, await customerPortalDataService.listRequests(id, req.query.filter)))
);
essPortalRouter.get(
  '/requests/:number',
  withCustomer(async (id, req, res) => answer(res, await customerPortalDataService.getRequest(id, param(req, 'number'))))
);
essPortalRouter.get(
  '/reports/:number',
  withCustomer(async (id, req, res) => answer(res, await customerPortalDataService.getReport(id, param(req, 'number'))))
);
essPortalRouter.get('/billing', withCustomer(async (id, _req, res) => answer(res, await customerPortalDataService.listBills(id))));
essPortalRouter.get(
  '/billing/:number',
  withCustomer(async (id, req, res) => answer(res, await customerPortalDataService.getBill(id, param(req, 'number'))))
);
essPortalRouter.post(
  '/profile/change-request',
  withCustomer(async (id, req, res) => {
    const out = await customerPortalDataService.requestProfileChange(id, req.body?.message);
    if (!out) return res.status(404).json(NOT_FOUND);
    return sendSuccess(res, { requested: true, reference: out.reference }, 201);
  })
);
essPortalRouter.post(
  '/sign-out-all',
  withCustomer(async (id, _req, res) => {
    await customerAccountService.signOutAll(id);
    return sendSuccess(res, { signedOut: true });
  })
);
