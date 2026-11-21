import { Request, Response, NextFunction } from 'express';
import { sendError } from '../utils/apiResponse.js';
import { logger } from '../utils/logger.js';
import { redactUrl } from '../utils/safeUrl.js';
import { isSecretBoxConfigured } from '../utils/secretBox.js';
import {
  MAX_CLOCK_SKEW_SECONDS,
  SIGNATURE_HEADERS,
  canonicalString,
  computeSignature,
  signaturesMatch,
} from '../utils/integrationSignature.js';
import { integrationService, ResolvedIntegrationKey } from '../services/integration.service.js';

declare module 'express-serve-static-core' {
  interface Request {
    integration?: Omit<ResolvedIntegrationKey, 'secret'>;
    rawBody?: Buffer;
  }
}

const header = (req: Request, name: string): string => {
  const v = req.headers[name];
  return (Array.isArray(v) ? v[0] : v ?? '').trim();
};

/**
 * Verifies a signed server-to-server request (see utils/integrationSignature.ts) and,
 * when `scope` is given, that the client holds it. Never treats the caller as a user.
 */
export function requireIntegrationClient(scope?: string) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!isSecretBoxConfigured()) {
      sendError(res, 503, 'INTEGRATION_DISABLED', 'Integration access is not configured on this server');
      return;
    }

    const keyId = header(req, SIGNATURE_HEADERS.keyId);
    const timestamp = header(req, SIGNATURE_HEADERS.timestamp);
    const nonce = header(req, SIGNATURE_HEADERS.nonce);
    const signature = header(req, SIGNATURE_HEADERS.signature);

    const reject = (reason: string) => {
      logger.warn('Integration request rejected', { reason, keyId: keyId || undefined, path: redactUrl(req.originalUrl), ip: req.ip });
      sendError(res, 401, 'INVALID_SIGNATURE', 'Request signature is missing or invalid');
    };

    if (!/^[a-z0-9_]{8,64}$/.test(keyId) || !/^\d{9,11}$/.test(timestamp) || !/^[A-Za-z0-9_-]{16,128}$/.test(nonce) || !signature) {
      reject('missing or malformed headers');
      return;
    }
    if (Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp)) > MAX_CLOCK_SKEW_SECONDS) {
      reject('timestamp outside allowed window');
      return;
    }

    try {
      const key = await integrationService.resolveKey(keyId);
      if (!key) {
        reject('unknown, revoked or expired key');
        return;
      }

      const expected = computeSignature(
        key.secret,
        canonicalString({
          timestamp,
          nonce,
          method: req.method,
          pathWithQuery: req.originalUrl,
          body: req.rawBody ?? null,
        })
      );
      if (!signaturesMatch(expected, signature)) {
        reject('signature mismatch');
        return;
      }

      // Nonce is recorded only after the signature is valid, so strangers cannot fill the table.
      if (!(await integrationService.consumeNonce(key.clientId, nonce))) {
        reject('nonce reused (replay)');
        return;
      }

      if (scope && !key.scopes.includes(scope)) {
        sendError(res, 403, 'INSUFFICIENT_SCOPE', `This client is not allowed to use ${scope}`);
        return;
      }

      const { secret: _secret, ...publicKey } = key;
      req.integration = publicKey;
      void integrationService.touch(key);
      next();
    } catch (err) {
      next(err);
    }
  };
}
