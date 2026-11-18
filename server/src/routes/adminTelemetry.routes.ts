// server/src/routes/adminTelemetry.routes.ts
// ═══════════════════════════════════════════════════════════════════════════
// ADMIN TELEMETRY & SYSTEM OBSERVABILITY ROUTES
// Live Server Metrics, 500-slot Ring Buffer Logs, Bug & Crash Inspector
// Strictly Protected by requireAuth & requireRole('ADMIN')
// ═══════════════════════════════════════════════════════════════════════════

import { Router, Request, Response, NextFunction } from 'express';
import { telemetryLogService } from '../services/telemetryLog.service.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { logger } from '../utils/logger.js';

export const adminTelemetryRouter = Router();

// Protect all telemetry routes for Admin only
adminTelemetryRouter.use(requireAuth);
adminTelemetryRouter.use(requireRole('ADMIN'));

/**
 * GET /api/v1/admin/telemetry/health
 * Returns live system metrics (CPU load, Heap memory, DB ping latency, services)
 */
adminTelemetryRouter.get('/health', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const health = await telemetryLogService.getSystemHealth();
    return res.json({
      success: true,
      data: health,
    });
  } catch (error) {
    return next(error);
  }
});

/**
 * GET /api/v1/admin/telemetry/logs
 * Fetches recent logs from circular ring buffer with service and level filtering
 */
adminTelemetryRouter.get('/logs', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsedLimit = req.query.limit ? parseInt(req.query.limit as string, 10) : 100;
    const limit = Math.min(Math.max(Number.isFinite(parsedLimit) ? parsedLimit : 100, 1), 500);
    const service = (req.query.service as string) || 'ALL';
    const level = (req.query.level as string) || 'ALL';
    const search = (req.query.search as string) || '';

    const logs = telemetryLogService.getLogs({
      limit,
      service,
      level,
      search,
    });

    return res.json({
      success: true,
      data: {
        totalReturned: logs.length,
        // The buffer is in memory: it starts empty whenever the server restarts.
        // Errors are also saved to system_error_logs (see /crashes), which survives restarts.
        bufferStartedAt: telemetryLogService.getStartedAt(),
        bufferCapacity: telemetryLogService.getBufferCapacity(),
        logs,
      },
    });
  } catch (error) {
    return next(error);
  }
});

/**
 * GET /api/v1/admin/telemetry/crashes
 * Fetches recent crash and unhandled error entries from Supabase system_error_logs
 */
adminTelemetryRouter.get('/crashes', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsedLimit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
    const limit = Number.isFinite(parsedLimit) ? parsedLimit : 50;
    const crashes = await telemetryLogService.getCrashesFromDb(limit);

    return res.json({
      success: true,
      data: crashes,
    });
  } catch (error) {
    return next(error);
  }
});

/**
 * PATCH /api/v1/admin/telemetry/crashes/:id/resolve
 * Marks a recorded error/crash as resolved
 */
adminTelemetryRouter.patch('/crashes/:id/resolve', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const updated = await telemetryLogService.resolveCrashInDb(String(id));

    return res.json({
      success: true,
      message: 'Crash incident marked as resolved.',
      data: updated,
    });
  } catch (error) {
    return next(error);
  }
});

/**
 * POST /api/v1/admin/telemetry/crash-report
 * Ingestion endpoint for ESS platform or client-side runtime crashes
 */
adminTelemetryRouter.post('/crash-report', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { service, errorName, message, stack, context, url, method, statusCode } = req.body;

    if (!message) {
      return res.status(400).json({ success: false, message: 'Crash report requires a message.' });
    }

    const report = await telemetryLogService.recordCrash({
      service: service || 'ESS',
      errorName: errorName || 'UnhandledError',
      message,
      stack,
      context,
      url,
      method,
      statusCode,
    });

    return res.status(201).json({
      success: true,
      message: 'Crash report recorded and analyzed by Bug Inspector.',
      data: report,
    });
  } catch (error) {
    return next(error);
  }
});

/**
 * POST /api/v1/admin/telemetry/test-error
 * Diagnostic self-test endpoint to simulate a controlled exception and verify Bug Inspector
 */
adminTelemetryRouter.post('/test-error', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const testError = new Error('Diagnostic Self-Test: Verification of Bug & Crash Inspector telemetry pipeline.');
    testError.name = 'DiagnosticSelfTestError';

    const recorded = await telemetryLogService.recordCrash({
      service: 'PYS',
      errorName: testError.name,
      message: testError.message,
      stack: testError.stack,
      context: {
        triggeredBy: req.user?.email || 'Admin User',
        timestamp: new Date().toISOString(),
      },
    });

    return res.json({
      success: true,
      message: 'Controlled diagnostic test error triggered and logged.',
      data: recorded,
    });
  } catch (error) {
    return next(error);
  }
});
