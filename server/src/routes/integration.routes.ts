import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { validate } from '../middleware/validate.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { integrationService } from '../services/integration.service.js';
import { outboxService } from '../services/outbox.service.js';
import { NotFoundError } from '../utils/errors.js';

/**
 * Admin management of integration keys and the outbox (/api/v1/integrations). ADMIN only.
 * A new key's secret is shown once in the response and never again.
 */
export const integrationRouter = Router();

integrationRouter.use(requireAuth, requireRole('ADMIN'));

const wrap =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

const clientParams = z.object({ clientCode: z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9_]{2,40}$/) });
const keyParams = z.object({ keyId: z.string().trim().regex(/^[a-z0-9_]{8,64}$/) });
const eventParams = z.object({ id: z.string().uuid() });
const eventQuery = z.object({
  status: z.enum(['PENDING', 'PROCESSING', 'DONE', 'FAILED', 'DEAD', 'SKIPPED']).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

integrationRouter.get(
  '/clients',
  wrap(async (_req, res) => sendSuccess(res, await integrationService.listClients()))
);

integrationRouter.post(
  '/clients/:clientCode/keys',
  validate({ params: clientParams }),
  wrap(async (req, res) => {
    const created = await integrationService.createKey(String(req.params.clientCode), req.user?.profileId);
    res.set('Cache-Control', 'no-store');
    return sendSuccess(
      res,
      { ...created, note: 'Copy this secret now into the ESS server settings. It will not be shown again.' },
      201
    );
  })
);

integrationRouter.post(
  '/keys/:keyId/revoke',
  validate({ params: keyParams }),
  wrap(async (req, res) => {
    await integrationService.revokeKey(String(req.params.keyId), req.user?.profileId);
    return sendSuccess(res, { revoked: true });
  })
);

integrationRouter.get(
  '/events',
  validate({ query: eventQuery }),
  wrap(async (req, res) => {
    const q = req.query as z.infer<typeof eventQuery>;
    return sendSuccess(res, await outboxService.listEvents(q.status, q.limit ?? 50));
  })
);

integrationRouter.post(
  '/events/:id/retry',
  validate({ params: eventParams }),
  wrap(async (req, res) => {
    const ok = await outboxService.retry(String(req.params.id));
    if (!ok) throw new NotFoundError('Event not found or not in a retryable state');
    return sendSuccess(res, { retried: true });
  })
);
