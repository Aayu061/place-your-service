import { Router } from 'express';
import { amcController } from '../controllers/amc.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { validate } from '../middleware/validate.js';
import {
  amcIdParamSchema,
  amcAssetParamSchema,
  listAmcQuerySchema,
  createAmcContractSchema,
  updateAmcContractSchema,
  updateAmcStatusSchema,
  cancelAmcSchema,
  addAmcAssetsSchema,
  generatePmSchema,
} from '../validators/amc.validator.js';

const amcRouter = Router();

// All AMC routes require authentication and ADMIN or STAFF role
amcRouter.use(requireAuth, requireRole('ADMIN', 'STAFF'));

// 1. Reusable plans
amcRouter.get('/plans', amcController.listPlans.bind(amcController));

// 2. Dashboard metrics
amcRouter.get('/metrics', amcController.getMetrics.bind(amcController));

// 3. List contracts
amcRouter.get(
  '/',
  validate({ query: listAmcQuerySchema }),
  amcController.listContracts.bind(amcController)
);

// 4. Get single contract
amcRouter.get(
  '/:id',
  validate({ params: amcIdParamSchema }),
  amcController.getContract.bind(amcController)
);

// 5. Create contract
amcRouter.post(
  '/',
  validate({ body: createAmcContractSchema }),
  amcController.createContract.bind(amcController)
);

// 6. Update contract details
amcRouter.patch(
  '/:id',
  validate({ params: amcIdParamSchema, body: updateAmcContractSchema }),
  amcController.updateContract.bind(amcController)
);

// 7. Update contract status
amcRouter.patch(
  '/:id/status',
  validate({ params: amcIdParamSchema, body: updateAmcStatusSchema }),
  amcController.updateStatus.bind(amcController)
);

// 8. Cancel contract
amcRouter.post(
  '/:id/cancel',
  validate({ params: amcIdParamSchema, body: cancelAmcSchema }),
  amcController.cancelContract.bind(amcController)
);

// 9. List covered assets
amcRouter.get(
  '/:id/assets',
  validate({ params: amcIdParamSchema }),
  amcController.getAssets.bind(amcController)
);

// 10. Add covered assets
amcRouter.post(
  '/:id/assets',
  validate({ params: amcIdParamSchema, body: addAmcAssetsSchema }),
  amcController.addAssets.bind(amcController)
);

// 11. Remove covered asset
amcRouter.delete(
  '/:id/assets/:assetId',
  validate({ params: amcAssetParamSchema }),
  amcController.removeAsset.bind(amcController)
);

// 12. Generate PM obligations
amcRouter.post(
  '/:id/generate-pm',
  validate({ params: amcIdParamSchema, body: generatePmSchema }),
  amcController.generatePm.bind(amcController)
);

// 13. List PM schedules
amcRouter.get(
  '/:id/schedules',
  validate({ params: amcIdParamSchema }),
  amcController.getSchedules.bind(amcController)
);

// 14. Renew contract
amcRouter.post(
  '/:id/renew',
  validate({ params: amcIdParamSchema, body: createAmcContractSchema }),
  amcController.renewContract.bind(amcController)
);

export { amcRouter };
