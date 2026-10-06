import { Router } from 'express';
import { healthController } from '../controllers/health.controller.js';

const router = Router();

/**
 * @route   GET /api/v1/health
 * @desc    Liveness check: validates that the API process is alive and healthy
 * @access  Public
 */
router.get('/', (req, res) => healthController.getHealth(req, res));

/**
 * @route   GET /api/v1/health/ready
 * @desc    Readiness check: validates backing dependencies (Supabase PostgreSQL)
 * @access  Public
 */
router.get('/ready', (req, res, next) => healthController.getReadiness(req, res, next));

export default router;
