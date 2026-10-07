import { Router } from 'express';
import { assetController } from '../controllers/asset.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { validate } from '../middleware/validate.js';
import {
  assetIdParamSchema,
  updateAcAssetSchema,
  updateAcAssetStatusSchema,
} from '../validators/asset.validator.js';

const assetRouter = Router();

// All Asset endpoints require active authentication and either ADMIN or STAFF role
assetRouter.use(requireAuth, requireRole('ADMIN', 'STAFF'));

// 1. Get asset by ID
assetRouter.get(
  '/:id',
  validate(assetIdParamSchema),
  assetController.getAssetById.bind(assetController)
);

// 2. Update asset
assetRouter.patch(
  '/:id',
  validate(updateAcAssetSchema),
  assetController.updateAcAsset.bind(assetController)
);

// 3. Update asset active status
assetRouter.patch(
  '/:id/status',
  validate(updateAcAssetStatusSchema),
  assetController.updateAcAssetStatus.bind(assetController)
);

export default assetRouter;
