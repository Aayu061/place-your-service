import { Router } from 'express';
import { analyticsController } from '../controllers/analytics.controller.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// Require authentication for operational metrics
router.use(requireAuth);

router.get('/dashboard-summary', analyticsController.getDashboardSummary.bind(analyticsController));

export default router;
