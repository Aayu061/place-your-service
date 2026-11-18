import { Request, Response, NextFunction } from 'express';
import { createHash } from 'node:crypto';
import { getSupabaseClient } from '../lib/supabase.js';
import { sendError } from '../utils/apiResponse.js';
import { logger } from '../utils/logger.js';

/**
 * Idempotent writes for integration clients: the same Idempotency-Key always yields the first
 * response, so a retried booking never creates a second record. Must run after
 * requireIntegrationClient. Server errors (5xx) are not stored, so the client may retry.
 */
export function requireIdempotencyKey() {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const clientId = req.integration?.clientId;
    if (!clientId) {
      sendError(res, 401, 'UNAUTHORIZED', 'Integration client required');
      return;
    }
    const key = String(req.headers['idempotency-key'] ?? '').trim();
    if (!/^[A-Za-z0-9_.:-]{8,200}$/.test(key)) {
      sendError(res, 400, 'IDEMPOTENCY_KEY_REQUIRED', 'Send a unique Idempotency-Key header (8–200 characters)');
      return;
    }

    const requestHash = createHash('sha256')
      .update(`${req.method}\n${req.originalUrl}\n`)
      .update(req.rawBody ?? '')
      .digest('hex');
    const supabase = getSupabaseClient();

    try {
      const { error: insErr } = await supabase
        .from('idempotency_records')
        .insert({ client_id: clientId, idempotency_key: key, request_hash: requestHash });

      if (insErr) {
        if ((insErr as any).code !== '23505') throw new Error(insErr.message);
        const { data: existing, error: readErr } = await supabase
          .from('idempotency_records')
          .select('request_hash, status, response_status, response_body')
          .eq('client_id', clientId)
          .eq('idempotency_key', key)
          .maybeSingle();
        if (readErr || !existing) throw new Error(readErr?.message || 'Idempotency record vanished');
        if (existing.request_hash !== requestHash) {
          sendError(res, 422, 'IDEMPOTENCY_KEY_REUSED', 'This Idempotency-Key was already used for a different request');
          return;
        }
        if (existing.status !== 'COMPLETED') {
          sendError(res, 409, 'REQUEST_IN_PROGRESS', 'The same request is still being processed; retry shortly');
          return;
        }
        res.setHeader('Idempotent-Replayed', 'true');
        res.status(existing.response_status ?? 200).json(existing.response_body);
        return;
      }
    } catch (err) {
      logger.error('Idempotency check failed', { error: err instanceof Error ? err.message : String(err) });
      sendError(res, 503, 'IDEMPOTENCY_UNAVAILABLE', 'Please retry the request shortly');
      return;
    }

    const originalJson = res.json.bind(res);
    res.json = ((body: unknown) => {
      const status = res.statusCode;
      const done =
        status >= 500
          ? supabase.from('idempotency_records').delete().eq('client_id', clientId).eq('idempotency_key', key)
          : supabase
              .from('idempotency_records')
              .update({
                status: 'COMPLETED',
                response_status: status,
                response_body: body ?? null,
                completed_at: new Date().toISOString(),
              })
              .eq('client_id', clientId)
              .eq('idempotency_key', key);
      Promise.resolve(done).catch((e: unknown) =>
        logger.error('Failed to store idempotent response', { error: e instanceof Error ? e.message : String(e) })
      );
      return originalJson(body);
    }) as Response['json'];

    next();
  };
}
