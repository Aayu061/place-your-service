import { Request, Response, NextFunction } from 'express';
import { customerService } from '../services/customer.service.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { CustomerListQuery } from '../types/index.js';

export class CustomerController {
  public async listCustomers(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await customerService.listCustomers(req.query as CustomerListQuery);
      sendSuccess(
        res,
        {
          customers: result.customers,
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

  public async getCustomerById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const customer = await customerService.getCustomerById(req.params.id as string);
      sendSuccess(res, { customer });
    } catch (err) {
      next(err);
    }
  }

  public async createCustomer(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const customer = await customerService.createCustomer(
        req.body,
        req.user!.profileId,
        req.ip
      );
      sendSuccess(res, { customer }, 201);
    } catch (err) {
      next(err);
    }
  }

  public async updateCustomer(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const customer = await customerService.updateCustomer(
        req.params.id as string,
        req.body,
        req.user!.profileId,
        req.ip
      );
      sendSuccess(res, { customer });
    } catch (err) {
      next(err);
    }
  }

  public async updateCustomerStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const customer = await customerService.updateCustomerStatus(
        req.params.id as string,
        req.body.isActive,
        req.user!.profileId,
        req.ip
      );
      sendSuccess(res, { customer });
    } catch (err) {
      next(err);
    }
  }

  public async convertToPermanent(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await customerService.convertToPermanent(
        req.params.id as string,
        req.user!.profileId,
        req.ip
      );
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  }
}

export const customerController = new CustomerController();
