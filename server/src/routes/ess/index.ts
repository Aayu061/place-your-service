import { Router, Request, Response, NextFunction } from 'express';
import { requireIntegrationClient } from '../../middleware/integrationAuth.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { catalogService } from '../../services/catalog.service.js';
import { requireIdempotencyKey } from '../../middleware/idempotency.js';
import { validate } from '../../middleware/validate.js';
import { createIntakeSchema } from '../../validators/intake.validator.js';
import { intakeService } from '../../services/intake.service.js';

/**
 * Signed server-to-server API for the ESS website (/api/v1/ess).
 * Every route requires a valid HMAC signature (middleware/integrationAuth.ts).
 * Intake, tracking and portal routes are added in later steps.
 */
export const essApiRouter = Router();

const wrap =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

/** Connection check for the ESS server (confirms the key and clock are right). */
essApiRouter.get(
  '/ping',
  requireIntegrationClient(),
  (req, res) => {
    sendSuccess(res, { ok: true, client: req.integration?.clientCode, serverTime: new Date().toISOString() });
  }
);

essApiRouter.get(
  '/catalog',
  requireIntegrationClient('catalog:read'),
  wrap(async (_req, res) => {
    const catalog = await catalogService.getPublicCatalog();
    res.set('Cache-Control', 'no-store');
    return sendSuccess(res, catalog);
  })
);

/**
 * Website request (booking, AMC request, product enquiry, contact message). Lands in the PYS
 * approval inbox (web_intakes). 201 when stored (also for spam, so bots learn nothing);
 * 200 with the existing numbers when the same externalReferenceId was already received.
 */
essApiRouter.post(
  '/intakes',
  requireIntegrationClient('intake:write'),
  requireIdempotencyKey(),
  validate({ body: createIntakeSchema }),
  wrap(async (req, res) => {
    const { created, ...result } = await intakeService.createFromEss(req.body);
    res.set('Cache-Control', 'no-store');
    return sendSuccess(res, result, created ? 201 : 200);
  })
);
