import { Router, Request, Response, NextFunction } from 'express';
import { requireIntegrationClient } from '../../middleware/integrationAuth.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { catalogService } from '../../services/catalog.service.js';
import { requireIdempotencyKey } from '../../middleware/idempotency.js';
import { validate } from '../../middleware/validate.js';
import { createIntakeSchema } from '../../validators/intake.validator.js';
import { intakeService } from '../../services/intake.service.js';
import { essSiteService } from '../../services/essSite.service.js';
import {
  contentQuerySchema,
  pincodeParamSchema,
  productIdParamSchema,
  trackSchema,
} from '../../validators/ess.validator.js';
import { essAdminRouter } from './admin.js';
import { essPortalRouter } from './portal.js';

/**
 * Signed server-to-server API for the ESS website (/api/v1/ess).
 * Every route requires a valid HMAC signature (middleware/integrationAuth.ts).
 * Website data (catalog, products, content, areas), requests (intakes), tracking and the ESS
 * admin area (/admin, which also needs a signed-in ESS Admin/Staff session).
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

/** ESS's own new ACs (sellers in Phase 4), each with the seller disclosure the law requires. */
essApiRouter.get(
  '/products',
  requireIntegrationClient('products:read'),
  wrap(async (_req, res) => {
    res.set('Cache-Control', 'no-store');
    return sendSuccess(res, { products: await essSiteService.listProducts() });
  })
);

essApiRouter.get(
  '/products/:id',
  requireIntegrationClient('products:read'),
  validate({ params: productIdParamSchema }),
  wrap(async (req, res) => {
    res.set('Cache-Control', 'no-store');
    return sendSuccess(res, await essSiteService.getProduct(String(req.params.id)));
  })
);

/** Published website content, e.g. ?keys=business.identity,home.hero */
essApiRouter.get(
  '/content',
  requireIntegrationClient('content:read'),
  validate({ query: contentQuerySchema }),
  wrap(async (req, res) => {
    res.set('Cache-Control', 'no-store');
    return sendSuccess(res, { blocks: await essSiteService.getContent(req.query.keys as unknown as string[]) });
  })
);

essApiRouter.get(
  '/areas',
  requireIntegrationClient('areas:read'),
  wrap(async (_req, res) => {
    res.set('Cache-Control', 'no-store');
    return sendSuccess(res, { areas: await essSiteService.listServiceAreas() });
  })
);

essApiRouter.get(
  '/serviceability/:pincode',
  requireIntegrationClient('areas:read'),
  validate({ params: pincodeParamSchema }),
  wrap(async (req, res) => {
    res.set('Cache-Control', 'no-store');
    return sendSuccess(res, await essSiteService.checkServiceability(String(req.params.pincode)));
  })
);

/** Track a request: exact tracking code + the mobile number used. Locks after repeated misses. */
essApiRouter.post(
  '/track',
  requireIntegrationClient('track:read'),
  validate({ body: trackSchema }),
  wrap(async (req, res) => {
    res.set('Cache-Control', 'no-store');
    return sendSuccess(res, await essSiteService.track(req.body));
  })
);

essApiRouter.use('/admin', essAdminRouter);
essApiRouter.use('/portal', essPortalRouter);
