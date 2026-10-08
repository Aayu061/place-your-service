import { Router } from 'express';
import { assetController } from '../controllers/asset.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { validate } from '../middleware/validate.js';
import {
  assetIdParamSchema,
  listGlobalAssetsSchema,
  createDirectAcAssetSchema,
  updateAcAssetSchema,
  updateAcAssetStatusSchema,
} from '../validators/asset.validator.js';

const assetRouter = Router();

// All Asset endpoints require active authentication and either ADMIN or STAFF role
assetRouter.use(requireAuth, requireRole('ADMIN', 'STAFF'));

// 1. List assets globally with filters & pagination
assetRouter.get(
  '/',
  validate(listGlobalAssetsSchema),
  assetController.listAssets.bind(assetController)
);

// 2. Direct AC asset registration
assetRouter.post(
  '/',
  validate(createDirectAcAssetSchema),
  assetController.createAcAsset.bind(assetController)
);

// 3. Get asset by ID
assetRouter.get(
  '/:id',
  validate(assetIdParamSchema),
  assetController.getAssetById.bind(assetController)
);

// 4. Update asset
assetRouter.patch(
  '/:id',
  validate(updateAcAssetSchema),
  assetController.updateAcAsset.bind(assetController)
);

// 5. Update asset active status
assetRouter.patch(
  '/:id/status',
  validate(updateAcAssetStatusSchema),
  assetController.updateAcAssetStatus.bind(assetController)
);

// 6. Get asset AMC history
assetRouter.get(
  '/:id/amc-history',
  validate(assetIdParamSchema),
  assetController.getAssetAmcHistory.bind(assetController)
);

export default assetRouter;

