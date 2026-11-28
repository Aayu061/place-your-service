import { describe, it, expect } from 'vitest';
import { canonicalString, computeSignature } from '../src/utils/integrationSignature.js';

/**
 * A fixed signing example shared with the ESS website (web/tests/signature-vector.test.ts holds the same values).
 * The expected signature was worked out once with plain Node crypto, not with either side's code, so a change to
 * the signing on one side only fails here instead of being "confirmed" by the same code that changed.
 */
const VECTOR = {
  secret: 'golden-secret-not-real',
  timestamp: '1764300000',
  nonce: 'nonce-0123456789abcdef',
  method: 'post',
  pathWithQuery: '/api/v1/ess/portal/code?x=1',
  body: '{"email":"a@example.com"}',
  signature: '6e03fe6332ed0ee62771b69af47927311c91cac97ac81c778c6d4135445f2db1',
};

describe('ESS request signing: fixed example shared with the website', () => {
  it('gives the agreed signature', () => {
    const canonical = canonicalString(VECTOR);
    expect(computeSignature(VECTOR.secret, canonical)).toBe(VECTOR.signature);
  });

  it('a different body, path or method gives a different signature', () => {
    for (const change of [{ body: '{"email":"b@example.com"}' }, { pathWithQuery: '/api/v1/ess/portal/code' }, { method: 'get' }]) {
      expect(computeSignature(VECTOR.secret, canonicalString({ ...VECTOR, ...change }))).not.toBe(VECTOR.signature);
    }
  });
});
