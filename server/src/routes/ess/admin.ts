import { Router, Request, Response, NextFunction } from 'express';
import { requireIntegrationClient } from '../../middleware/integrationAuth.js';
import { requireEssRole } from '../../middleware/essActor.js';
import { validate } from '../../middleware/validate.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { essAdminService } from '../../services/essAdmin.service.js';
import { intakeService } from '../../services/intake.service.js';
import { productPhotoStorage } from '../../services/mediaStorage.service.js';
import {
  catalogDisplayPatchSchema,
  contentDraftSchema,
  contentKeyParamSchema,
  enquiryCloseSchema,
  enquiryLineParamSchema,
  enquiryQuoteSchema,
  grantIdParamSchema,
  leadsQuerySchema,
  prefixParamSchema,
  productIdParamSchema,
  productPhotoUploadSchema,
  productInputSchema,
  productPatchSchema,
  roleGrantSchema,
  serviceAreaSchema,
} from '../../validators/ess.validator.js';

/**
 * ESS admin area (/api/v1/ess/admin). Every route needs BOTH a signed request from the ESS
 * server (scope admin:access) AND the signed-in person's session (X-PYS-Actor-Token) with an
 * ESS role. ESS Staff: overview, leads, products, content drafts. ESS Admin: also publishing,
 * business/legal content, what the website shows, service areas and users.
 */
export const essAdminRouter = Router();

const wrap =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

const staff = [requireIntegrationClient('admin:access'), requireEssRole('ESS_STAFF')];
const admin = [requireIntegrationClient('admin:access'), requireEssRole('ESS_ADMIN')];

essAdminRouter.use((_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

essAdminRouter.get('/me', ...staff, wrap(async (req, res) => sendSuccess(res, essAdminService.me(req.essActor!))));

essAdminRouter.get('/overview', ...staff, wrap(async (_req, res) => sendSuccess(res, await essAdminService.overview())));

/** Read-only view of website requests; approving happens in the PYS Approval Inbox. */
essAdminRouter.get(
  '/leads',
  ...staff,
  validate({ query: leadsQuerySchema }),
  wrap(async (req, res) => sendSuccess(res, await intakeService.list(req.query as any)))
);

/* products */
essAdminRouter.get('/products', ...staff, wrap(async (_req, res) => sendSuccess(res, { products: await essAdminService.listProducts() })));
essAdminRouter.post(
  '/products',
  ...staff,
  validate({ body: productInputSchema }),
  wrap(async (req, res) => sendSuccess(res, await essAdminService.createProduct(req.body, req.essActor!), 201))
);
/* product photos (S10): list uploaded photos; a one-time link the browser uploads one photo to */
essAdminRouter.get('/product-photos', ...staff, wrap(async (_req, res) => sendSuccess(res, { photos: await productPhotoStorage.list() })));
essAdminRouter.post(
  '/product-photos/upload-link',
  ...staff,
  validate({ body: productPhotoUploadSchema }),
  wrap(async (req, res) => sendSuccess(res, await productPhotoStorage.createUploadLink(req.body), 201))
);
essAdminRouter.patch(
  '/products/:id',
  ...staff,
  validate({ params: productIdParamSchema, body: productPatchSchema }),
  wrap(async (req, res) => sendSuccess(res, await essAdminService.updateProduct(String(req.params.id), req.body, req.essActor!)))
);

/* content */
essAdminRouter.get('/content', ...staff, wrap(async (_req, res) => sendSuccess(res, { blocks: await essAdminService.listContent() })));
essAdminRouter.get(
  '/content/:key',
  ...staff,
  validate({ params: contentKeyParamSchema }),
  wrap(async (req, res) => sendSuccess(res, await essAdminService.getContent(String(req.params.key))))
);
essAdminRouter.put(
  '/content/:key',
  ...staff,
  validate({ params: contentKeyParamSchema, body: contentDraftSchema }),
  wrap(async (req, res) => sendSuccess(res, await essAdminService.saveDraft(String(req.params.key), req.body.body, req.essActor!)))
);
essAdminRouter.post(
  '/content/:key/publish',
  ...admin,
  validate({ params: contentKeyParamSchema }),
  wrap(async (req, res) => sendSuccess(res, await essAdminService.publish(String(req.params.key), req.essActor!)))
);

/* what the website shows (prices stay with PYS Admin) */
essAdminRouter.get('/catalog-display', ...staff, wrap(async (_req, res) => sendSuccess(res, await essAdminService.getCatalogDisplay())));
essAdminRouter.patch(
  '/catalog-display',
  ...admin,
  validate({ body: catalogDisplayPatchSchema }),
  wrap(async (req, res) => sendSuccess(res, await essAdminService.updateCatalogDisplay(req.body.items, req.essActor!)))
);

/* service areas */
essAdminRouter.get('/service-areas', ...staff, wrap(async (_req, res) => sendSuccess(res, { areas: await essAdminService.listAreas() })));
essAdminRouter.put(
  '/service-areas',
  ...admin,
  validate({ body: serviceAreaSchema }),
  wrap(async (req, res) => sendSuccess(res, { areas: await essAdminService.upsertArea(req.body, req.essActor!) }))
);
essAdminRouter.delete(
  '/service-areas/:prefix',
  ...admin,
  validate({ params: prefixParamSchema }),
  wrap(async (req, res) => sendSuccess(res, { areas: await essAdminService.deleteArea(String(req.params.prefix), req.essActor!) }))
);

/* users & roles */
/* AC enquiries: the seller's view (ESS Staff and ESS Admin act for ESS, the first-party seller). */
essAdminRouter.get('/enquiries', ...staff, wrap(async (req, res) => sendSuccess(res, { enquiries: await essAdminService.listEnquiries(req.essActor!) })));
essAdminRouter.post(
  '/enquiries/:lineId/quote',
  ...staff,
  validate({ params: enquiryLineParamSchema, body: enquiryQuoteSchema }),
  wrap(async (req, res) => sendSuccess(res, await essAdminService.quoteEnquiry(req.essActor!, String(req.params.lineId), req.body))),
);
essAdminRouter.post(
  '/enquiries/:lineId/close',
  ...staff,
  validate({ params: enquiryLineParamSchema, body: enquiryCloseSchema }),
  wrap(async (req, res) => sendSuccess(res, await essAdminService.closeEnquiry(req.essActor!, String(req.params.lineId), req.body.result))),
);

essAdminRouter.get('/users', ...admin, wrap(async (_req, res) => sendSuccess(res, { users: await essAdminService.listUsers() })));
essAdminRouter.post(
  '/users',
  ...admin,
  validate({ body: roleGrantSchema }),
  wrap(async (req, res) => sendSuccess(res, await essAdminService.grantRole(req.body, req.essActor!), 201))
);
essAdminRouter.delete(
  '/users/:id',
  ...admin,
  validate({ params: grantIdParamSchema }),
  wrap(async (req, res) => sendSuccess(res, { users: await essAdminService.revokeRole(String(req.params.id), req.essActor!) }))
);
