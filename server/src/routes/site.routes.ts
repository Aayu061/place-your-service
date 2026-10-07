import { Router } from 'express';
import { siteController } from '../controllers/site.controller.js';
import { assetController } from '../controllers/asset.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { validate } from '../middleware/validate.js';
import {
  siteIdParamSchema,
  updateSiteSchema,
  updateSiteStatusSchema,
} from '../validators/site.validator.js';
import {
  listSiteAssetsSchema,
  createAcAssetSchema,
} from '../validators/asset.validator.js';

const siteRouter = Router();

// All Site endpoints require active authentication and either ADMIN or STAFF role
siteRouter.use(requireAuth, requireRole('ADMIN', 'STAFF'));

// 1. Get site by ID
siteRouter.get(
  '/:id',
  validate(siteIdParamSchema),
  siteController.getSiteById.bind(siteController)
);

// 2. Update site
siteRouter.patch(
  '/:id',
  validate(updateSiteSchema),
  siteController.updateSite.bind(siteController)
);

// 3. Set site as primary
siteRouter.post(
  '/:id/set-primary',
  validate(siteIdParamSchema),
  siteController.setPrimarySite.bind(siteController)
);

// 4. Update site active status
siteRouter.patch(
  '/:id/status',
  validate(updateSiteStatusSchema),
  siteController.updateSiteStatus.bind(siteController)
);

// 5. List AC assets under site
siteRouter.get(
  '/:siteId/assets',
  validate(listSiteAssetsSchema),
  assetController.listSiteAssets.bind(assetController)
);

// 6. Create AC asset under site
siteRouter.post(
  '/:siteId/assets',
  validate(createAcAssetSchema),
  assetController.createAcAsset.bind(assetController)
);

export default siteRouter;
