-- M4: secure integration clients (ESS website → PYS API), idempotency, a general outbox,
-- and a status history for service requests and visits that feeds customer notifications.
-- All tables: RLS on, no anon/authenticated access, service role only.

-- 1. Integration clients and their signing keys ---------------------------------------------
CREATE TABLE IF NOT EXISTS public.integration_clients (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_code  text NOT NULL UNIQUE CHECK (client_code ~ '^[A-Z][A-Z0-9_]{2,40}$'),
  name         text NOT NULL,
  scopes       text[] NOT NULL DEFAULT '{}',
  is_active    boolean NOT NULL DEFAULT true,
  last_used_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- The shared secret is stored encrypted by the API (AES-256-GCM with a server-only key),
-- never in plain text. Up to two usable keys per client so keys can be rotated without downtime.
CREATE TABLE IF NOT EXISTS public.integration_client_keys (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id         uuid NOT NULL REFERENCES public.integration_clients(id) ON DELETE CASCADE,
  key_id            text NOT NULL UNIQUE CHECK (key_id ~ '^[a-z0-9_]{8,64}$'),
  secret_ciphertext text NOT NULL,
  status            text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'RETIRING', 'REVOKED')),
  created_by        uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  expires_at        timestamptz,
  last_used_at      timestamptz,
  revoked_at        timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_integration_client_keys_client ON public.integration_client_keys (client_id, status);

CREATE OR REPLACE FUNCTION public.enforce_integration_key_limit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.status <> 'REVOKED' AND (
    SELECT count(*) FROM public.integration_client_keys
     WHERE client_id = NEW.client_id AND status <> 'REVOKED' AND id <> NEW.id
  ) >= 2 THEN
    RAISE EXCEPTION 'An integration client can have at most two usable keys; revoke one first'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS trg_integration_key_limit ON public.integration_client_keys;
CREATE TRIGGER trg_integration_key_limit BEFORE INSERT OR UPDATE OF status ON public.integration_client_keys
  FOR EACH ROW EXECUTE FUNCTION public.enforce_integration_key_limit();

-- Replay protection: every signed request carries a unique nonce (kept 15 minutes).
CREATE TABLE IF NOT EXISTS public.integration_request_nonces (
  client_id  uuid NOT NULL REFERENCES public.integration_clients(id) ON DELETE CASCADE,
  nonce      text NOT NULL CHECK (length(nonce) BETWEEN 16 AND 128),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (client_id, nonce)
);
CREATE INDEX IF NOT EXISTS idx_integration_request_nonces_created ON public.integration_request_nonces (created_at);

-- 2. Idempotency: the same Idempotency-Key always returns the first result --------------------
CREATE TABLE IF NOT EXISTS public.idempotency_records (
  client_id       uuid NOT NULL REFERENCES public.integration_clients(id) ON DELETE CASCADE,
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 8 AND 200),
  request_hash    text NOT NULL,
  status          text NOT NULL DEFAULT 'IN_PROGRESS' CHECK (status IN ('IN_PROGRESS', 'COMPLETED')),
  response_status integer,
  response_body   jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  completed_at    timestamptz,
  expires_at      timestamptz NOT NULL DEFAULT now() + interval '7 days',
  PRIMARY KEY (client_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_idempotency_records_expires ON public.idempotency_records (expires_at);

CREATE OR REPLACE FUNCTION public.purge_integration_housekeeping()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_nonces integer;
  v_idem   integer;
BEGIN
  DELETE FROM public.integration_request_nonces WHERE created_at < now() - interval '15 minutes';
  GET DIAGNOSTICS v_nonces = ROW_COUNT;
  DELETE FROM public.idempotency_records
   WHERE expires_at < now()
      OR (status = 'IN_PROGRESS' AND created_at < now() - interval '1 hour');
  GET DIAGNOSTICS v_idem = ROW_COUNT;
  RETURN jsonb_build_object('nonces', v_nonces, 'idempotency_records', v_idem);
END;
$function$;

-- 3. General outbox ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.outbound_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type      text NOT NULL CHECK (event_type ~ '^[A-Z][A-Z0-9_]{2,60}$'),
  aggregate_type  text NOT NULL,
  aggregate_id    uuid,
  payload         jsonb NOT NULL DEFAULT '{}'::jsonb,   -- ids and status codes only, no personal data
  idempotency_key text UNIQUE,
  status          text NOT NULL DEFAULT 'PENDING'
                  CHECK (status IN ('PENDING', 'PROCESSING', 'DONE', 'FAILED', 'DEAD', 'SKIPPED')),
  attempt_count   integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  max_attempts    integer NOT NULL DEFAULT 8 CHECK (max_attempts > 0),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error      text,
  processed_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_outbound_events_due
  ON public.outbound_events (next_attempt_at) WHERE status IN ('PENDING', 'FAILED');
CREATE INDEX IF NOT EXISTS idx_outbound_events_aggregate ON public.outbound_events (aggregate_type, aggregate_id);

CREATE TABLE IF NOT EXISTS public.outbound_event_attempts (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id       uuid NOT NULL REFERENCES public.outbound_events(id) ON DELETE CASCADE,
  attempt_number integer NOT NULL CHECK (attempt_number > 0),
  outcome        text NOT NULL CHECK (outcome IN ('DONE', 'FAILED', 'SKIPPED')),
  error          text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, attempt_number)
);

CREATE OR REPLACE FUNCTION public.claim_outbound_events(p_limit integer DEFAULT 20, p_event_types text[] DEFAULT NULL)
RETURNS SETOF public.outbound_events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
  -- Release events stuck in PROCESSING (worker crashed) after 10 minutes.
  UPDATE public.outbound_events
     SET status = 'FAILED', last_error = 'Processing timed out', updated_at = now()
   WHERE status = 'PROCESSING' AND updated_at < now() - interval '10 minutes';

  RETURN QUERY
    WITH due AS (
      SELECT id FROM public.outbound_events
       WHERE status IN ('PENDING', 'FAILED')
         AND next_attempt_at <= now()
         AND attempt_count < max_attempts
         AND (p_event_types IS NULL OR event_type = ANY (p_event_types))
       ORDER BY created_at
       FOR UPDATE SKIP LOCKED
       LIMIT LEAST(GREATEST(p_limit, 1), 100)
    )
    UPDATE public.outbound_events AS e
       SET status = 'PROCESSING', attempt_count = e.attempt_count + 1, updated_at = now()
      FROM due WHERE e.id = due.id
    RETURNING e.*;
END;
$function$;

-- p_outcome: DONE (handled), SKIPPED (nothing to do, e.g. customer has no email), FAILED (retry later).
CREATE OR REPLACE FUNCTION public.complete_outbound_event(
  p_event_id uuid,
  p_outcome text,
  p_error text DEFAULT NULL,
  p_retryable boolean DEFAULT true
)
RETURNS public.outbound_events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  ev public.outbound_events%ROWTYPE;
BEGIN
  IF p_outcome NOT IN ('DONE', 'FAILED', 'SKIPPED') THEN
    RAISE EXCEPTION 'Unknown outcome %', p_outcome USING ERRCODE = '22023';
  END IF;
  SELECT * INTO ev FROM public.outbound_events WHERE id = p_event_id FOR UPDATE;
  IF ev.id IS NULL OR ev.status <> 'PROCESSING' THEN
    RAISE EXCEPTION 'Outbound event is not currently claimed' USING ERRCODE = '23514';
  END IF;

  UPDATE public.outbound_events SET
    status = CASE
      WHEN p_outcome = 'DONE' THEN 'DONE'
      WHEN p_outcome = 'SKIPPED' THEN 'SKIPPED'
      WHEN NOT COALESCE(p_retryable, true) OR ev.attempt_count >= ev.max_attempts THEN 'DEAD'
      ELSE 'FAILED' END,
    next_attempt_at = CASE WHEN p_outcome = 'FAILED'
      THEN now() + make_interval(secs => LEAST(21600, 30 * (2 ^ LEAST(ev.attempt_count - 1, 10))::integer))
      ELSE next_attempt_at END,
    last_error = CASE WHEN p_outcome = 'FAILED' THEN left(COALESCE(p_error, 'Handler failed'), 1000) ELSE NULL END,
    processed_at = CASE WHEN p_outcome <> 'FAILED' THEN now() ELSE NULL END,
    updated_at = now()
  WHERE id = p_event_id
  RETURNING * INTO ev;

  INSERT INTO public.outbound_event_attempts (event_id, attempt_number, outcome, error)
  VALUES (ev.id, ev.attempt_count, p_outcome,
          CASE WHEN p_outcome = 'FAILED' THEN left(COALESCE(p_error, 'Handler failed'), 1000) END)
  ON CONFLICT (event_id, attempt_number) DO NOTHING;

  RETURN ev;
END;
$function$;

-- Admin "retry now" for a DEAD/FAILED event.
CREATE OR REPLACE FUNCTION public.retry_outbound_event(p_event_id uuid)
RETURNS public.outbound_events
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  UPDATE public.outbound_events
     SET status = 'PENDING', next_attempt_at = now(),
         max_attempts = GREATEST(max_attempts, attempt_count + 1), updated_at = now()
   WHERE id = p_event_id AND status IN ('FAILED', 'DEAD')
  RETURNING *;
$function$;

-- 4. Status history for requests and visits (also catches writes outside the state machine) ---
CREATE TABLE IF NOT EXISTS public.service_request_status_history (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_request_id uuid NOT NULL REFERENCES public.service_requests(id) ON DELETE CASCADE,
  schedule_id        uuid REFERENCES public.service_schedules(id) ON DELETE CASCADE,
  entity             text NOT NULL CHECK (entity IN ('REQUEST', 'SCHEDULE')),
  from_status        text,
  to_status          text NOT NULL,
  changed_by         uuid,
  source             text NOT NULL DEFAULT 'TRIGGER' CHECK (source IN ('TRIGGER', 'BACKFILL')),
  changed_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sr_status_history_request
  ON public.service_request_status_history (service_request_id, changed_at);

CREATE OR REPLACE FUNCTION public.record_service_request_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_hist_id uuid;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.service_request_status_history
    (service_request_id, entity, from_status, to_status, changed_by)
  VALUES (NEW.id, 'REQUEST', CASE WHEN TG_OP = 'UPDATE' THEN OLD.status END, NEW.status,
          COALESCE(NEW.updated_by, NEW.created_by))
  RETURNING id INTO v_hist_id;

  INSERT INTO public.outbound_events (event_type, aggregate_type, aggregate_id, payload, idempotency_key)
  VALUES ('SERVICE_REQUEST_STATUS_CHANGED', 'SERVICE_REQUEST', NEW.id,
          jsonb_build_object('serviceRequestId', NEW.id, 'historyId', v_hist_id,
                             'fromStatus', CASE WHEN TG_OP = 'UPDATE' THEN OLD.status END,
                             'toStatus', NEW.status, 'sourceChannel', NEW.source_channel),
          'sr-status-change:' || v_hist_id)
  ON CONFLICT (idempotency_key) DO NOTHING;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.record_service_schedule_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_hist_id uuid;
BEGIN
  IF NEW.service_request_id IS NULL THEN
    RETURN NEW;   -- AMC preventive visits without a request: nothing to tell the customer here
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status
     AND NEW.technician_id IS NOT DISTINCT FROM OLD.technician_id THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.service_request_status_history
    (service_request_id, schedule_id, entity, from_status, to_status)
  VALUES (NEW.service_request_id, NEW.id, 'SCHEDULE',
          CASE WHEN TG_OP = 'UPDATE' THEN OLD.status END, NEW.status)
  RETURNING id INTO v_hist_id;

  INSERT INTO public.outbound_events (event_type, aggregate_type, aggregate_id, payload, idempotency_key)
  VALUES ('SERVICE_SCHEDULE_STATUS_CHANGED', 'SERVICE_REQUEST', NEW.service_request_id,
          jsonb_build_object('serviceRequestId', NEW.service_request_id, 'scheduleId', NEW.id,
                             'historyId', v_hist_id,
                             'fromStatus', CASE WHEN TG_OP = 'UPDATE' THEN OLD.status END,
                             'toStatus', NEW.status,
                             'technicianChanged', TG_OP = 'INSERT' OR NEW.technician_id IS DISTINCT FROM OLD.technician_id),
          'sch-status-change:' || v_hist_id)
  ON CONFLICT (idempotency_key) DO NOTHING;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_service_requests_status_history ON public.service_requests;
CREATE TRIGGER trg_service_requests_status_history
  AFTER INSERT OR UPDATE OF status ON public.service_requests
  FOR EACH ROW EXECUTE FUNCTION public.record_service_request_status();

DROP TRIGGER IF EXISTS trg_service_schedules_status_history ON public.service_schedules;
CREATE TRIGGER trg_service_schedules_status_history
  AFTER INSERT OR UPDATE OF status, technician_id ON public.service_schedules
  FOR EACH ROW EXECUTE FUNCTION public.record_service_schedule_status();

-- One starting row per existing request (no events, so no emails for old tickets).
INSERT INTO public.service_request_status_history
  (service_request_id, entity, from_status, to_status, changed_by, source, changed_at)
SELECT sr.id, 'REQUEST', NULL, sr.status, sr.created_by, 'BACKFILL', sr.created_at
  FROM public.service_requests sr
 WHERE NOT EXISTS (SELECT 1 FROM public.service_request_status_history h WHERE h.service_request_id = sr.id);

-- 5. Security ---------------------------------------------------------------------------------
ALTER TABLE public.integration_clients            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_client_keys        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_request_nonces     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.idempotency_records            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outbound_events                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outbound_event_attempts        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_request_status_history ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.integration_clients, public.integration_client_keys, public.integration_request_nonces,
              public.idempotency_records, public.outbound_events, public.outbound_event_attempts,
              public.service_request_status_history
  FROM anon, authenticated;
GRANT ALL ON public.integration_clients, public.integration_client_keys, public.integration_request_nonces,
             public.idempotency_records, public.outbound_events, public.outbound_event_attempts,
             public.service_request_status_history
  TO service_role;

REVOKE ALL ON FUNCTION public.claim_outbound_events(integer, text[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_outbound_event(uuid, text, text, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.retry_outbound_event(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.purge_integration_housekeeping() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_service_request_status() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_service_schedule_status() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_integration_key_limit() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_outbound_events(integer, text[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_outbound_event(uuid, text, text, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.retry_outbound_event(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.purge_integration_housekeeping() TO service_role;

-- 6. The ESS website as the first integration client (keys are created from the API) --------
INSERT INTO public.integration_clients (client_code, name, scopes)
VALUES ('ESS_WEB', 'Extreme Sales & Services website',
        ARRAY['catalog:read', 'intake:write', 'track:read'])
ON CONFLICT (client_code) DO NOTHING;
