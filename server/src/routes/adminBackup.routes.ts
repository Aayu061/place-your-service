// server/src/routes/adminBackup.routes.ts
import { Router, Request, Response, NextFunction } from 'express';
import { backupService } from '../services/backup.service.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';

export const adminBackupRouter = Router();

// Protect all backup endpoints for Admin role only
adminBackupRouter.use(requireAuth);
adminBackupRouter.use(requireRole('ADMIN'));

/**
 * GET /api/v1/admin/database/backup
 * Downloads complete database snapshot as a file attachment (1-click browser download)
 */
adminBackupRouter.get('/backup', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const format = req.query.format === 'sql' ? 'sql' : 'json';
    const actorEmail = (req as any).user?.email || 'ADMIN';
    const result = await backupService.generateBackup(format, actorEmail);

    res.setHeader('Content-Type', format === 'sql' ? 'application/sql' : 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${result.fileName}"`);
    res.setHeader('X-Checksum-SHA256', result.checksumSha256);
    res.setHeader('X-Total-Records', String(result.totalRecords));

    return res.send(result.content);
  } catch (error) {
    return next(error);
  }
});

/**
 * GET /api/v1/admin/database/backup/metadata
 * Returns live table counts, total records, and recent backup history for UI telemetry
 */
adminBackupRouter.get('/backup/metadata', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const metadata = await backupService.getBackupMetadata();
    return res.json({
      success: true,
      data: metadata,
    });
  } catch (error) {
    return next(error);
  }
});

/**
 * POST /api/v1/admin/database/backup/trigger
 * Triggers a server-side backup snapshot and writes to disk
 */
adminBackupRouter.post('/backup/trigger', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const format = req.body?.format === 'sql' ? 'sql' : 'json';
    const { filePath, result } = await backupService.saveBackupToDisk(format);
    return res.json({
      success: true,
      message: `Database backup created successfully: ${result.fileName}`,
      data: {
        fileName: result.fileName,
        format: result.format,
        fileSizeBytes: result.fileSizeBytes,
        totalRecords: result.totalRecords,
        checksumSha256: result.checksumSha256,
        filePath,
      },
    });
  } catch (error) {
    return next(error);
  }
});
