import { Router } from 'express';
import { exportWorkbook } from '../controllers/export.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { validate } from '../middleware/validate.js';
import { exportKindParamSchema } from '../validators/export.validator.js';

const router = Router();
router.use(requireAuth, requireRole('ADMIN', 'STAFF'));
router.get('/:kind', validate(exportKindParamSchema), exportWorkbook);
export default router;
