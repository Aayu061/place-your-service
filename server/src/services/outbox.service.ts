import { getSupabaseClient } from '../lib/supabase.js';
import { logger } from '../utils/logger.js';

/**
 * General outbox worker (table outbound_events, migration 20261118030000).
 * Database triggers and services queue events; handlers registered here process them with
 * retries and back-off. Only event types that have a handler are claimed, so events wait
 * safely until the code that handles them is deployed.
 */
export interface OutboundEvent {
  id: string;
  event_type: string;
  aggregate_type: string;
  aggregate_id: string | null;
  payload: Record<string, unknown>;
  attempt_count: number;
  max_attempts: number;
  created_at: string;
}

/** DONE = handled; SKIPPED = nothing to do (e.g. no customer email). Throw to retry later. */
export type OutboxOutcome = 'DONE' | 'SKIPPED';
export type OutboxHandler = (event: OutboundEvent) => Promise<OutboxOutcome>;

/** Throw this from a handler when retrying cannot help (bad data); the event goes to DEAD. */
export class PermanentOutboxError extends Error {}

class OutboxService {
  private handlers = new Map<string, OutboxHandler>();
  private running = false;

  register(eventType: string, handler: OutboxHandler): void {
    this.handlers.set(eventType, handler);
  }

  unregisterAll(): void {
    this.handlers.clear();
  }

  registeredTypes(): string[] {
    return [...this.handlers.keys()];
  }

  async enqueue(input: {
    eventType: string;
    aggregateType: string;
    aggregateId?: string | null;
    payload?: Record<string, unknown>;
    idempotencyKey?: string;
  }): Promise<void> {
    const { error } = await getSupabaseClient().from('outbound_events').insert({
      event_type: input.eventType,
      aggregate_type: input.aggregateType,
      aggregate_id: input.aggregateId ?? null,
      payload: input.payload ?? {},
      idempotency_key: input.idempotencyKey ?? null,
    });
    if (error && (error as any).code !== '23505') {
      throw new Error(`Failed to queue ${input.eventType}: ${error.message}`);
    }
  }

  async processPending(limit = 20): Promise<{ claimed: number; done: number; skipped: number; failed: number }> {
    const summary = { claimed: 0, done: 0, skipped: 0, failed: 0 };
    const types = this.registeredTypes();
    if (types.length === 0 || this.running) return summary;
    this.running = true;
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase.rpc('claim_outbound_events', { p_limit: limit, p_event_types: types });
      if (error) {
        logger.warn('Outbox claim failed', { error: error.message });
        return summary;
      }
      const events = (data ?? []) as OutboundEvent[];
      summary.claimed = events.length;

      for (const event of events) {
        const handler = this.handlers.get(event.event_type);
        let outcome: 'DONE' | 'SKIPPED' | 'FAILED' = 'FAILED';
        let errorText: string | null = null;
        let retryable = true;
        try {
          if (!handler) throw new PermanentOutboxError(`No handler for ${event.event_type}`);
          outcome = await handler(event);
        } catch (err) {
          outcome = 'FAILED';
          errorText = err instanceof Error ? err.message : String(err);
          retryable = !(err instanceof PermanentOutboxError);
        }

        const { error: completeErr } = await supabase.rpc('complete_outbound_event', {
          p_event_id: event.id,
          p_outcome: outcome,
          p_error: errorText,
          p_retryable: retryable,
        });
        if (completeErr) {
          logger.error('Failed to complete outbound event', { id: event.id, error: completeErr.message });
        }
        if (outcome === 'DONE') summary.done++;
        else if (outcome === 'SKIPPED') summary.skipped++;
        else {
          summary.failed++;
          logger.warn('Outbound event failed', { id: event.id, type: event.event_type, error: errorText, retryable });
        }
      }
      return summary;
    } finally {
      this.running = false;
    }
  }

  async housekeeping(): Promise<void> {
    const { error } = await getSupabaseClient().rpc('purge_integration_housekeeping');
    if (error) logger.warn('Integration housekeeping failed', { error: error.message });
  }

  async listEvents(status?: string, limit = 50) {
    let query = getSupabaseClient()
      .from('outbound_events')
      .select('id, event_type, aggregate_type, aggregate_id, status, attempt_count, max_attempts, next_attempt_at, last_error, created_at, processed_at')
      .order('created_at', { ascending: false })
      .limit(Math.min(Math.max(limit, 1), 200));
    if (status) query = query.eq('status', status);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return data ?? [];
  }

  async retry(eventId: string): Promise<boolean> {
    const { data, error } = await getSupabaseClient().rpc('retry_outbound_event', { p_event_id: eventId });
    if (error) throw new Error(error.message);
    return Array.isArray(data) ? data.length > 0 : Boolean(data);
  }
}

export const outboxService = new OutboxService();
