import { Request, Response, NextFunction } from 'express';
import { technicianPortalService } from '../services/technicianPortal.service.js';
import { mediaStorageService } from '../services/mediaStorage.service.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { BadRequestError } from '../utils/errors.js';

export class TechnicianPortalController {
  async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { identifier, pin } = req.body;
      const result = await technicianPortalService.login(identifier, pin);
      sendSuccess(res, result, 200);
    } catch (err) {
      next(err);
    }
  }

  async getProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const techId = req.technician?.id;
      if (!techId) {
        throw new BadRequestError('Technician context missing.');
      }
      const profile = await technicianPortalService.getProfile(techId);
      sendSuccess(res, profile, 200);
    } catch (err) {
      next(err);
    }
  }

  async updateStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const techId = req.technician?.id;
      if (!techId) {
        throw new BadRequestError('Technician context missing.');
      }
      const { status } = req.body;
      const updated = await technicianPortalService.updateStatus(techId, status);
      sendSuccess(res, updated, 200);
    } catch (err) {
      next(err);
    }
  }

  async getAssignedJobs(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const techId = req.technician?.id;
      if (!techId) {
        throw new BadRequestError('Technician context missing.');
      }
      const date = req.query.date as string | undefined;
      const includeOverdue = req.query.includeOverdue === 'true';
      const jobs = await technicianPortalService.getAssignedJobs(techId, date, includeOverdue);
      sendSuccess(res, jobs, 200);
    } catch (err) {
      next(err);
    }
  }

  async getJobDetail(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const techId = req.technician?.id;
      if (!techId) {
        throw new BadRequestError('Technician context missing.');
      }
      const id = String(req.params.id);
      const detail = await technicianPortalService.getJobDetail(techId, id);
      sendSuccess(res, detail, 200);
    } catch (err) {
      next(err);
    }
  }

  async updateJobStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const techId = req.technician?.id;
      if (!techId) {
        throw new BadRequestError('Technician context missing.');
      }
      const scheduleId = String(req.params.id);
      const { status } = req.body;
      const result = await technicianPortalService.updateJobStatus(techId, scheduleId, status);
      sendSuccess(res, result, 200);
    } catch (err) {
      next(err);
    }
  }

  async getAnalytics(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const techId = req.technician?.id;
      if (!techId) {
        throw new BadRequestError('Technician context missing.');
      }
      const date = req.query.date as string | undefined;
      const analytics = await technicianPortalService.getDailyAnalytics(techId, date);
      sendSuccess(res, analytics, 200);
    } catch (err) {
      next(err);
    }
  }

  async submitFieldReport(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const techId = req.technician?.id;
      if (!techId) {
        throw new BadRequestError('Technician context missing.');
      }
      const createdReport = await technicianPortalService.submitFieldReport(techId, req.body);
      sendSuccess(res, createdReport, 201);
    } catch (err) {
      next(err);
    }
  }

  async updatePin(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const techId = req.technician?.id;
      if (!techId) {
        throw new BadRequestError('Technician context missing.');
      }
      const result = await technicianPortalService.updatePin(
        techId,
        String(req.body.currentPin),
        String(req.body.newPin)
      );
      sendSuccess(res, result, 200);
    } catch (err) {
      next(err);
    }
  }

  async createMediaUploadUrl(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const techId = req.technician?.id;
      if (!techId) {
        throw new BadRequestError('Technician context missing.');
      }
      const result = await mediaStorageService.createSignedUploadUrl({
        scope: req.body.scope,
        mimeType: req.body.mimeType,
        entityRef: req.body.entityRef || techId,
      });
      sendSuccess(res, result, 201);
    } catch (err) {
      next(err);
    }
  }

  async getMediaSignedUrl(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const techId = req.technician?.id;
      if (!techId) {
        throw new BadRequestError('Technician context missing.');
      }
      const signedUrl = await mediaStorageService.createSignedViewUrl(String(req.query.path));
      sendSuccess(res, { signedUrl }, 200);
    } catch (err) {
      next(err);
    }
  }
}

export const technicianPortalController = new TechnicianPortalController();
