import { Router } from 'express';
import { lookupGstin } from '../controllers/compliance.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { validate } from '../middleware/validate.js';
import { gstinLookupSchema } from '../validators/compliance.validator.js';

const router = Router();

router.post(
  '/gstin/lookup',
  requireAuth,
  requireRole('ADMIN', 'STAFF'),
  validate(gstinLookupSchema),
  lookupGstin
);

export default router;


