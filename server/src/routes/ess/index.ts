import { Router, Request, Response, NextFunction } from 'express';
import { requireIntegrationClient } from '../../middleware/integrationAuth.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { catalogService } from '../../services/catalog.service.js';

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
