import { Request, Response, NextFunction } from 'express';
import { scheduleService } from '../services/schedule.service.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { ScheduleListQuery, CalendarScheduleQuery } from '../types/index.js';

export class ScheduleController {
  public async getSchedules(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await scheduleService.getSchedules(req.query as unknown as ScheduleListQuery);
      sendSuccess(
        res,
        {
          schedules: result.schedules,
          total: result.total,
          page: result.page,
          pageSize: result.pageSize,
          totalPages: result.totalPages,
        },
        200,
        {
          total: result.total,
          page: result.page,
          pageSize: result.pageSize,
          totalPages: result.totalPages,
        }
      );
    } catch (err) {
      next(err);
    }
  }

  public async getCalendar(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const schedules = await scheduleService.getCalendar(req.query as unknown as CalendarScheduleQuery);
      sendSuccess(res, { schedules });
    } catch (err) {
      next(err);
    }
  }

  public async getUnscheduledWork(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const items = await scheduleService.getUnscheduledWork();
      sendSuccess(res, { items });
    } catch (err) {
      next(err);
    }
  }

  public async getScheduleById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const schedule = await scheduleService.getScheduleById(req.params.id as string);
      sendSuccess(res, { schedule });
    } catch (err) {
      next(err);
    }
  }

  public async createSchedule(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const schedule = await scheduleService.createSchedule(
        req.body,
        req.user?.profileId as string,
        req.ip
      );
      sendSuccess(res, { schedule }, 201);
    } catch (err) {
      next(err);
    }
  }

  public async getEligibleTechnicians(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const date = req.query.date as string | undefined;
      const startTime = req.query.startTime as string | undefined;
      const endTime = req.query.endTime as string | undefined;

      const recommendations = await scheduleService.getEligibleTechnicians(
        req.params.id as string,
        date,
        startTime,
        endTime
      );
      sendSuccess(res, { recommendations });
    } catch (err) {
      next(err);
    }
  }

  public async assignTechnician(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const schedule = await scheduleService.assignTechnician(
        req.params.id as string,
        req.body,
        req.user?.profileId as string,
        req.ip
      );
      sendSuccess(res, { schedule });
    } catch (err) {
      next(err);
    }
  }

  public async reassignTechnician(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const schedule = await scheduleService.reassignTechnician(
        req.params.id as string,
        req.body,
        req.user?.profileId as string,
        req.ip
      );
      sendSuccess(res, { schedule });
    } catch (err) {
      next(err);
    }
  }

  public async reschedule(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const schedule = await scheduleService.reschedule(
        req.params.id as string,
        req.body,
        req.user?.profileId as string,
        req.ip
      );
      sendSuccess(res, { schedule });
    } catch (err) {
      next(err);
    }
  }

  public async cancelSchedule(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const schedule = await scheduleService.cancelSchedule(
        req.params.id as string,
        req.body,
        req.user?.profileId as string,
        req.ip
      );
      sendSuccess(res, { schedule });
    } catch (err) {
      next(err);
    }
  }
}

export const scheduleController = new ScheduleController();
