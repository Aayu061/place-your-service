import { getSupabaseClient } from '../../lib/supabase.js';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import { openSecret } from '../../utils/secretBox.js';
import { signRequest } from '../../utils/integrationSignature.js';
import { outboxService, OutboundEvent, OutboxOutcome, PermanentOutboxError } from '../outbox.service.js';

/**
 * ESS_REVALIDATE: tells the ESS website to refresh cached pages after catalog / product /
 * content / service-area changes (events queued by triggers, migration 20261119010000).
 *
 * POST {ESS_REVALIDATE_URL} with body {"topic":"catalog"} signed exactly like ESS's own calls to
 * PYS (X-PYS-Key-Id/Timestamp/Nonce/Signature) using ESS_WEB's ACTIVE key — ESS already holds
 * that secret, so no extra shared secret is needed. Without ESS_REVALIDATE_URL (the new ESS site
 * is not live yet) events are marked SKIPPED; ESS also refreshes on its own every few minutes.
 */

const REVALIDATE_TIMEOUT_MS = 8000;
/** Older than this, a refresh is pointless: ESS has refreshed on its own timer since. */
const STALE_AFTER_MS = 60 * 60 * 1000;

async function activeEssKey(): Promise<{ keyId: string; secret: string } | null> {
  const { data, error } = await getSupabaseClient()
    .from('integration_client_keys')
    .select('key_id, secret_ciphertext, integration_clients!inner(client_code, is_active)')
    .eq('status', 'ACTIVE')
    .eq('integration_clients.client_code', 'ESS_WEB')
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) throw new Error(`Failed to load the ESS key: ${error.message}`);
  const row = (data ?? [])[0] as any;
  if (!row) return null;
  return { keyId: row.key_id, secret: openSecret(row.secret_ciphertext) };
}

export async function handleEssRevalidate(event: OutboundEvent, fetchImpl: typeof fetch = fetch): Promise<OutboxOutcome> {
  const url = env.ESS_REVALIDATE_URL;
  if (!url) return 'SKIPPED';
  if (Date.now() - new Date(event.created_at).getTime() > STALE_AFTER_MS) return 'SKIPPED';

  const topic = typeof event.payload?.topic === 'string' ? event.payload.topic : null;
  if (!topic || !/^[a-z]{2,20}$/.test(topic)) throw new PermanentOutboxError('ESS_REVALIDATE event without a valid topic');

  const key = await activeEssKey();
  if (!key) {
    logger.warn('ESS revalidate skipped: ESS_WEB has no ACTIVE key');
    return 'SKIPPED';
  }

  const body = JSON.stringify({ topic, eventId: event.id });
  const target = new URL(url);
  const headers = signRequest({
    keyId: key.keyId,
    secret: key.secret,
    method: 'POST',
    pathWithQuery: `${target.pathname}${target.search}`,
    body,
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REVALIDATE_TIMEOUT_MS);
  try {
    const res = await fetchImpl(target.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body,
      signal: controller.signal,
    });
    if (res.ok) return 'DONE';
    if (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) {
      throw new PermanentOutboxError(`ESS refused the refresh (HTTP ${res.status})`);
    }
    throw new Error(`ESS refresh failed (HTTP ${res.status})`);
  } finally {
    clearTimeout(timer);
  }
}

export function registerEssRevalidate(): void {
  outboxService.register('ESS_REVALIDATE', (event) => handleEssRevalidate(event));
}
