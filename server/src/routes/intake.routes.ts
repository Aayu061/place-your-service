import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { validate } from '../middleware/validate.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { intakeService } from '../services/intake.service.js';
import {
  approveIntakeSchema,
  intakeIdParamSchema,
  listIntakesQuerySchema,
  rejectIntakeSchema,
  ListIntakesQuery,
} from '../validators/intake.validator.js';

/**
 * Website request approval inbox (/api/v1/intakes), ADMIN and STAFF.
 * GET  /             list (?status=&kind=&search=&page=&pageSize=)
 * GET  /stats        counters for the inbox header
 * GET  /:id          one request + customers with the same phone number
 * POST /:id/approve  create customer / site / service request (optionally schedule a visit)
 * POST /:id/reject   mark REJECTED, SPAM or DUPLICATE
 */
export const intakeRouter = Router();

const wrap =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

intakeRouter.use(requireAuth, requireRole('ADMIN', 'STAFF'));

intakeRouter.get(
  '/',
  validate({ query: listIntakesQuerySchema }),
  wrap(async (req, res) => {
    res.set('Cache-Control', 'no-store');
    return sendSuccess(res, await intakeService.list(req.query as unknown as ListIntakesQuery));
  })
);

intakeRouter.get(
  '/stats',
  wrap(async (_req, res) => {
    res.set('Cache-Control', 'no-store');
    return sendSuccess(res, await intakeService.stats());
  })
);

intakeRouter.get(
  '/:id',
  validate({ params: intakeIdParamSchema }),
  wrap(async (req, res) => {
    res.set('Cache-Control', 'no-store');
    return sendSuccess(res, await intakeService.getById(String(req.params.id)));
  })
);

intakeRouter.post(
  '/:id/approve',
  validate({ params: intakeIdParamSchema, body: approveIntakeSchema }),
  wrap(async (req, res) =>
    sendSuccess(res, await intakeService.approve(String(req.params.id), req.body, req.user?.profileId, req.ip))
  )
);

intakeRouter.post(
  '/:id/reject',
  validate({ params: intakeIdParamSchema, body: rejectIntakeSchema }),
  wrap(async (req, res) =>
    sendSuccess(res, await intakeService.reject(String(req.params.id), req.body, req.user?.profileId, req.ip))
  )
);
