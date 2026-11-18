import { randomBytes } from 'node:crypto';
import { getSupabaseClient } from '../lib/supabase.js';
import { BadRequestError, ConflictError, NotFoundError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import { openSecret, sealSecret } from '../utils/secretBox.js';
import { logActivity } from './audit.service.js';

export interface ResolvedIntegrationKey {
  keyId: string;
  keyRowId: string;
  clientId: string;
  clientCode: string;
  scopes: string[];
  secret: string;
}

export interface IntegrationClientSummary {
  clientCode: string;
  name: string;
  scopes: string[];
  isActive: boolean;
  lastUsedAt: string | null;
  keys: Array<{
    keyId: string;
    status: string;
    createdAt: string;
    lastUsedAt: string | null;
    expiresAt: string | null;
    revokedAt: string | null;
  }>;
}

const KEY_CACHE_TTL_MS = 60_000;
const LAST_USED_WRITE_INTERVAL_MS = 5 * 60_000;

class IntegrationService {
  private keyCache = new Map<string, { at: number; value: ResolvedIntegrationKey | null }>();
  private lastUsedWrites = new Map<string, number>();

  clearCache(): void {
    this.keyCache.clear();
  }

  /** Looks up a usable key (ACTIVE/RETIRING, not expired, client active) and decrypts its secret. */
  async resolveKey(keyId: string): Promise<ResolvedIntegrationKey | null> {
    const cached = this.keyCache.get(keyId);
    if (cached && Date.now() - cached.at < KEY_CACHE_TTL_MS) return cached.value;

    const { data, error } = await getSupabaseClient()
      .from('integration_client_keys')
      .select('id, key_id, secret_ciphertext, status, expires_at, integration_clients!inner(id, client_code, scopes, is_active)')
      .eq('key_id', keyId)
      .maybeSingle();

    if (error) {
      logger.error('Integration key lookup failed', { error: error.message });
      throw new Error('Integration key lookup failed');
    }

    let value: ResolvedIntegrationKey | null = null;
    const client: any = data ? (Array.isArray((data as any).integration_clients) ? (data as any).integration_clients[0] : (data as any).integration_clients) : null;
    const usable =
      data &&
      client?.is_active &&
      data.status !== 'REVOKED' &&
      (!data.expires_at || new Date(data.expires_at).getTime() > Date.now());
    if (usable) {
      try {
        value = {
          keyId: data.key_id,
          keyRowId: data.id,
          clientId: client.id,
          clientCode: client.client_code,
          scopes: client.scopes ?? [],
          secret: openSecret(data.secret_ciphertext),
        };
      } catch (err) {
        logger.error('Integration key could not be decrypted (wrong INTEGRATION_SECRET_KEY?)', {
          keyId,
          error: err instanceof Error ? err.message : String(err),
        });
        value = null;
      }
    }
    this.keyCache.set(keyId, { at: Date.now(), value });
    return value;
  }

  /** Records a nonce; returns false when it was already used (replay). */
  async consumeNonce(clientId: string, nonce: string): Promise<boolean> {
    const { error } = await getSupabaseClient().from('integration_request_nonces').insert({ client_id: clientId, nonce });
    if (!error) return true;
    if ((error as any).code === '23505') return false;
    logger.error('Failed to record integration nonce', { error: error.message });
    throw new Error('Failed to record integration nonce');
  }

  /** Updates last_used_at at most every few minutes per key (keeps writes low). */
  async touch(key: ResolvedIntegrationKey): Promise<void> {
    const last = this.lastUsedWrites.get(key.keyRowId) ?? 0;
    if (Date.now() - last < LAST_USED_WRITE_INTERVAL_MS) return;
    this.lastUsedWrites.set(key.keyRowId, Date.now());
    const now = new Date().toISOString();
    const supabase = getSupabaseClient();
    await Promise.all([
      supabase.from('integration_client_keys').update({ last_used_at: now }).eq('id', key.keyRowId),
      supabase.from('integration_clients').update({ last_used_at: now }).eq('id', key.clientId),
    ]).catch(() => undefined);
  }

  async listClients(): Promise<IntegrationClientSummary[]> {
    const { data, error } = await getSupabaseClient()
      .from('integration_clients')
      .select('client_code, name, scopes, is_active, last_used_at, integration_client_keys(key_id, status, created_at, last_used_at, expires_at, revoked_at)')
      .order('client_code', { ascending: true });
    if (error) throw new BadRequestError('Failed to load integration clients');
    return (data ?? []).map((c: any) => ({
      clientCode: c.client_code,
      name: c.name,
      scopes: c.scopes ?? [],
      isActive: c.is_active,
      lastUsedAt: c.last_used_at ?? null,
      keys: (c.integration_client_keys ?? []).map((k: any) => ({
        keyId: k.key_id,
        status: k.status,
        createdAt: k.created_at,
        lastUsedAt: k.last_used_at ?? null,
        expiresAt: k.expires_at ?? null,
        revokedAt: k.revoked_at ?? null,
      })),
    }));
  }

  /**
   * Creates a new signing key. The secret is returned ONCE; only its encrypted form is stored.
   * Older ACTIVE keys become RETIRING (still accepted) so the other site can switch without downtime.
   */
  async createKey(clientCode: string, actorId?: string): Promise<{ keyId: string; secret: string; clientCode: string }> {
    const supabase = getSupabaseClient();
    const { data: client, error } = await supabase
      .from('integration_clients')
      .select('id, client_code')
      .eq('client_code', clientCode)
      .maybeSingle();
    if (error) throw new BadRequestError('Failed to load integration client');
    if (!client) throw new NotFoundError(`Integration client ${clientCode} not found`);

    const keyId = `${clientCode.toLowerCase().replace(/[^a-z0-9]/g, '')}_${randomBytes(6).toString('hex')}`;
    const secret = randomBytes(32).toString('base64url');

    const { error: retireErr } = await supabase
      .from('integration_client_keys')
      .update({ status: 'RETIRING' })
      .eq('client_id', client.id)
      .eq('status', 'ACTIVE');
    if (retireErr) throw new BadRequestError('Failed to retire the previous key');

    const { error: insErr } = await supabase.from('integration_client_keys').insert({
      client_id: client.id,
      key_id: keyId,
      secret_ciphertext: sealSecret(secret),
      status: 'ACTIVE',
      created_by: actorId ?? null,
    });
    if (insErr) {
      if ((insErr as any).code === '23514') {
        throw new ConflictError('This client already has two usable keys. Revoke the old one first.');
      }
      throw new BadRequestError('Failed to create integration key');
    }

    this.clearCache();
    await logActivity({
      actorProfileId: actorId,
      action: 'INTEGRATION_KEY_CREATED',
      entityType: 'INTEGRATION_CLIENT',
      entityId: client.id,
      details: { clientCode, keyId },
    });
    return { keyId, secret, clientCode };
  }

  async revokeKey(keyId: string, actorId?: string): Promise<void> {
    const { data, error } = await getSupabaseClient()
      .from('integration_client_keys')
      .update({ status: 'REVOKED', revoked_at: new Date().toISOString() })
      .eq('key_id', keyId)
      .neq('status', 'REVOKED')
      .select('id, client_id')
      .maybeSingle();
    if (error) throw new BadRequestError('Failed to revoke integration key');
    if (!data) throw new NotFoundError('Key not found or already revoked');
    this.clearCache();
    await logActivity({
      actorProfileId: actorId,
      action: 'INTEGRATION_KEY_REVOKED',
      entityType: 'INTEGRATION_CLIENT',
      entityId: data.client_id,
      details: { keyId },
    });
  }
}

export const integrationService = new IntegrationService();
