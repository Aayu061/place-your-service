import { Router } from 'express';
import { masterDataController } from '../controllers/masterData.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { validate } from '../middleware/validate.js';
import {
  brandIdParamSchema,
  listBrandsQuerySchema,
  createBrandSchema,
  updateBrandSchema,
  updateBrandStatusSchema,
  modelIdParamSchema,
  listModelsQuerySchema,
  createModelSchema,
  updateModelSchema,
  updateModelStatusSchema,
  variantIdParamSchema,
} from '../validators/masterData.validator.js';

export const brandRouter = Router();
export const modelRouter = Router();

// ============================================================================
// AC BRANDS ROUTES (/api/v1/ac-brands)
// ============================================================================

// Read: Both ADMIN and STAFF
brandRouter.get(
  '/',
  requireAuth,
  requireRole('ADMIN', 'STAFF'),
  validate(listBrandsQuerySchema),
  masterDataController.listBrands.bind(masterDataController)
);

brandRouter.get(
  '/:id',
  requireAuth,
  requireRole('ADMIN', 'STAFF'),
  validate(brandIdParamSchema),
  masterDataController.getBrandById.bind(masterDataController)
);

// Manage: ADMIN only
brandRouter.post(
  '/',
  requireAuth,
  requireRole('ADMIN'),
  validate(createBrandSchema),
  masterDataController.createBrand.bind(masterDataController)
);

brandRouter.patch(
  '/:id',
  requireAuth,
  requireRole('ADMIN'),
  validate(updateBrandSchema),
  masterDataController.updateBrand.bind(masterDataController)
);

brandRouter.patch(
  '/:id/status',
  requireAuth,
  requireRole('ADMIN'),
  validate(updateBrandStatusSchema),
  masterDataController.updateBrandStatus.bind(masterDataController)
);

// ============================================================================
// AC MODELS ROUTES (/api/v1/ac-models)
// ============================================================================

// Read: Both ADMIN and STAFF
modelRouter.get(
  '/',
  requireAuth,
  requireRole('ADMIN', 'STAFF'),
  validate(listModelsQuerySchema),
  masterDataController.listModels.bind(masterDataController)
);

modelRouter.get(
  '/:id',
  requireAuth,
  requireRole('ADMIN', 'STAFF'),
  validate(modelIdParamSchema),
  masterDataController.getModelById.bind(masterDataController)
);

// Manage: ADMIN only
modelRouter.post(
  '/',
  requireAuth,
  requireRole('ADMIN'),
  validate(createModelSchema),
  masterDataController.createModel.bind(masterDataController)
);

modelRouter.patch(
  '/:id',
  requireAuth,
  requireRole('ADMIN'),
  validate(updateModelSchema),
  masterDataController.updateModel.bind(masterDataController)
);

modelRouter.patch(
  '/:id/status',
  requireAuth,
  requireRole('ADMIN'),
  validate(updateModelStatusSchema),
  masterDataController.updateModelStatus.bind(masterDataController)
);

// Read Variants under Model: Both ADMIN and STAFF
modelRouter.get(
  '/:id/variants',
  requireAuth,
  requireRole('ADMIN', 'STAFF'),
  validate(modelIdParamSchema),
  masterDataController.listModelVariants.bind(masterDataController)
);

// ============================================================================
// AC MODEL VARIANTS ROUTES (/api/v1/ac-variants)
// ============================================================================

export const variantRouter = Router();

variantRouter.get(
  '/:id',
  requireAuth,
  requireRole('ADMIN', 'STAFF'),
  validate(variantIdParamSchema),
  masterDataController.getVariantById.bind(masterDataController)
);

