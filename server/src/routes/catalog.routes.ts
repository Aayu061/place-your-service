import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { validate } from '../middleware/validate.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { catalogService } from '../services/catalog.service.js';
import {
  catalogCodeParamSchema,
  createCatalogItemSchema,
  replaceCatalogPricesSchema,
  updateCatalogItemSchema,
} from '../validators/catalog.validator.js';

/**
 * Service & AMC catalog (/api/v1/catalog).
 * GET /           public price list (same data ESS shows; no personal data), cached 60 s
 * GET /items      ADMIN/STAFF: every item incl. hidden ones
 * POST /items, PATCH /items/:code, PUT /items/:code/prices   ADMIN only
 */
export const catalogRouter = Router();

const wrap =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

catalogRouter.get(
  '/',
  wrap(async (_req, res) => {
    const catalog = await catalogService.getPublicCatalog();
    res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    res.set('ETag', `W/"catalog-v${catalog.version}"`);
    if (_req.fresh) return res.status(304).end();
    return sendSuccess(res, catalog);
  })
);

catalogRouter.get(
  '/items',
  requireAuth,
  requireRole('ADMIN', 'STAFF'),
  wrap(async (_req, res) => sendSuccess(res, await catalogService.listItems()))
);

catalogRouter.get(
  '/items/:code',
  requireAuth,
  requireRole('ADMIN', 'STAFF'),
  validate({ params: catalogCodeParamSchema }),
  wrap(async (req, res) => sendSuccess(res, await catalogService.getItem(String(req.params.code))))
);

catalogRouter.post(
  '/items',
  requireAuth,
  requireRole('ADMIN'),
  validate({ body: createCatalogItemSchema }),
  wrap(async (req, res) => sendSuccess(res, await catalogService.createItem(req.body, req.user?.profileId), 201))
);

catalogRouter.patch(
  '/items/:code',
  requireAuth,
  requireRole('ADMIN'),
  validate({ params: catalogCodeParamSchema, body: updateCatalogItemSchema }),
  wrap(async (req, res) =>
    sendSuccess(res, await catalogService.updateItem(String(req.params.code), req.body, req.user?.profileId))
  )
);

catalogRouter.put(
  '/items/:code/prices',
  requireAuth,
  requireRole('ADMIN'),
  validate({ params: catalogCodeParamSchema, body: replaceCatalogPricesSchema }),
  wrap(async (req, res) =>
    sendSuccess(res, await catalogService.replacePrices(String(req.params.code), req.body.prices, req.user?.profileId))
  )
);
