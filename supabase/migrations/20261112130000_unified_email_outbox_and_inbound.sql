-- Phase 2: Unified Resend Email Outbox, Attempts Ledger, Webhook Event RPCs, Inbound Inbox & Customer Bounce Tracking

CREATE TABLE IF NOT EXISTS public.email_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL CHECK (
    entity_type IN (
      'SERVICE_REPORT',
      'AMC_QUOTATION',
      'AMC_EXPIRY_REMINDER',
      'PAYMENT_INVOICE',
      'PAYMENT_RECEIPT',
      'DISPATCH_CONFIRMATION',
      'TEST_EMAIL'
    )
  ),
  entity_id UUID,
  template_key TEXT NOT NULL,
  recipient_email TEXT NOT NULL,
  recipient_name TEXT,
  reply_to TEXT,
  subject TEXT NOT NULL,
  html_body TEXT NOT NULL,
  text_body TEXT NOT NULL,
  tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  idempotency_key TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (
    status IN ('PENDING', 'SENDING', 'SENT', 'DELIVERED', 'DELAYED', 'BOUNCED', 'COMPLAINED', 'FAILED')
  ),
  retryable BOOLEAN NOT NULL DEFAULT TRUE,
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  max_attempts INTEGER NOT NULL DEFAULT 5 CHECK (max_attempts > 0),
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_error TEXT,
  transport TEXT,
  provider_message_id TEXT,
  requested_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  bounced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.email_delivery_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id UUID NOT NULL REFERENCES public.email_deliveries(id) ON DELETE RESTRICT,
  attempt_number INTEGER NOT NULL CHECK (attempt_number > 0),
  status TEXT NOT NULL CHECK (status IN ('SENT', 'FAILED')),
  transport TEXT NOT NULL,
  provider_message_id TEXT,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (delivery_id, attempt_number)
);

CREATE TABLE IF NOT EXISTS public.inbound_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resend_email_id TEXT NOT NULL UNIQUE,
  from_email TEXT NOT NULL,
  to_emails JSONB NOT NULL DEFAULT '[]'::jsonb,
  subject TEXT,
  text_body TEXT,
  html_body TEXT,
  reply_to TEXT,
  in_reply_to TEXT,
  headers JSONB NOT NULL DEFAULT '{}'::jsonb,
  attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
  matched_entity_type TEXT,
  matched_entity_id UUID,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'UNREAD' CHECK (status IN ('UNREAD', 'READ', 'ARCHIVED')),
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS email_bounced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS email_bounce_reason TEXT,
  ADD COLUMN IF NOT EXISTS email_complained_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_email_deliveries_entity
  ON public.email_deliveries(entity_type, entity_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_email_deliveries_due
  ON public.email_deliveries(status, next_attempt_at)
  WHERE status IN ('PENDING', 'FAILED');

CREATE INDEX IF NOT EXISTS idx_email_deliveries_provider_msg
  ON public.email_deliveries(provider_message_id)
  WHERE provider_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_email_delivery_attempts_delivery
  ON public.email_delivery_attempts(delivery_id, attempt_number DESC);

CREATE INDEX IF NOT EXISTS idx_inbound_emails_received
  ON public.inbound_emails(status, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_inbound_emails_customer
  ON public.inbound_emails(customer_id, received_at DESC)
  WHERE customer_id IS NOT NULL;

-- Row-Level Security
ALTER TABLE public.email_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_delivery_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inbound_emails ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.email_deliveries FROM PUBLIC, anon, authenticated;
GRANT ALL PRIVILEGES ON public.email_deliveries TO service_role;

REVOKE ALL ON public.email_delivery_attempts FROM PUBLIC, anon, authenticated;
GRANT ALL PRIVILEGES ON public.email_delivery_attempts TO service_role;

REVOKE ALL ON public.inbound_emails FROM PUBLIC, anon, authenticated;
GRANT ALL PRIVILEGES ON public.inbound_emails TO service_role;

DROP POLICY IF EXISTS email_deliveries_service_role_all ON public.email_deliveries;
CREATE POLICY email_deliveries_service_role_all
  ON public.email_deliveries
  FOR ALL
  TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);

DROP POLICY IF EXISTS email_deliveries_staff_read ON public.email_deliveries;
CREATE POLICY email_deliveries_staff_read
  ON public.email_deliveries
  FOR SELECT
  TO authenticated
  USING (public.get_user_role((SELECT auth.uid())) IN ('ADMIN', 'STAFF'));

DROP POLICY IF EXISTS email_delivery_attempts_service_role_all ON public.email_delivery_attempts;
CREATE POLICY email_delivery_attempts_service_role_all
  ON public.email_delivery_attempts
  FOR ALL
  TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);

DROP POLICY IF EXISTS inbound_emails_service_role_all ON public.inbound_emails;
CREATE POLICY inbound_emails_service_role_all
  ON public.inbound_emails
  FOR ALL
  TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);

DROP POLICY IF EXISTS inbound_emails_staff_read ON public.inbound_emails;
CREATE POLICY inbound_emails_staff_read
  ON public.inbound_emails
  FOR SELECT
  TO authenticated
  USING (public.get_user_role((SELECT auth.uid())) IN ('ADMIN', 'STAFF'));

-- Transactional Outbox RPCs
CREATE OR REPLACE FUNCTION public.claim_email_deliveries(p_limit INTEGER DEFAULT 20)
RETURNS SETOF public.email_deliveries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  UPDATE public.email_deliveries
    SET status = 'PENDING', updated_at = NOW()
    WHERE status = 'SENDING' AND updated_at < NOW() - INTERVAL '10 minutes';

  RETURN QUERY
    WITH due AS (
      SELECT id FROM public.email_deliveries
      WHERE status IN ('PENDING', 'FAILED')
        AND retryable
        AND next_attempt_at <= NOW()
        AND attempt_count < max_attempts
      ORDER BY created_at
      FOR UPDATE SKIP LOCKED
      LIMIT LEAST(GREATEST(p_limit, 1), 100)
    )
    UPDATE public.email_deliveries AS d
      SET status = 'SENDING', attempt_count = attempt_count + 1, updated_at = NOW()
      FROM due WHERE d.id = due.id
      RETURNING d.*;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_email_delivery(
  p_delivery_id UUID,
  p_succeeded BOOLEAN,
  p_transport TEXT,
  p_provider_message_id TEXT,
  p_error TEXT,
  p_retryable BOOLEAN
)
RETURNS public.email_deliveries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  delivery public.email_deliveries%ROWTYPE;
BEGIN
  SELECT * INTO delivery FROM public.email_deliveries
    WHERE id = p_delivery_id FOR UPDATE;
  IF delivery.id IS NULL OR delivery.status <> 'SENDING' THEN
    RAISE EXCEPTION 'Email delivery is not currently claimed' USING ERRCODE = '23514';
  END IF;

  UPDATE public.email_deliveries SET
    status = CASE WHEN p_succeeded THEN 'SENT' ELSE 'FAILED' END,
    retryable = CASE WHEN p_succeeded THEN FALSE ELSE COALESCE(p_retryable, TRUE) END,
    next_attempt_at = CASE WHEN p_succeeded THEN next_attempt_at
      ELSE NOW() + make_interval(secs => LEAST(86400, 30 * (2 ^ LEAST(delivery.attempt_count - 1, 10))::INTEGER)) END,
    last_error = CASE WHEN p_succeeded THEN NULL ELSE LEFT(COALESCE(p_error, 'Delivery failed'), 1000) END,
    transport = p_transport,
    provider_message_id = COALESCE(p_provider_message_id, provider_message_id),
    sent_at = CASE WHEN p_succeeded THEN COALESCE(sent_at, NOW()) ELSE NULL END,
    updated_at = NOW()
  WHERE id = p_delivery_id
  RETURNING * INTO delivery;

  INSERT INTO public.email_delivery_attempts (
    delivery_id, attempt_number, status, transport, provider_message_id, error
  ) VALUES (
    delivery.id,
    delivery.attempt_count,
    CASE WHEN p_succeeded THEN 'SENT' ELSE 'FAILED' END,
    COALESCE(p_transport, 'resend'),
    p_provider_message_id,
    CASE WHEN p_succeeded THEN NULL ELSE LEFT(COALESCE(p_error, 'Delivery failed'), 1000) END
  );

  RETURN delivery;
END;
$$;

CREATE OR REPLACE FUNCTION public.retry_email_delivery(
  p_delivery_id UUID,
  p_actor_profile_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  delivery public.email_deliveries%ROWTYPE;
BEGIN
  SELECT * INTO delivery FROM public.email_deliveries
    WHERE id = p_delivery_id FOR UPDATE;
  IF delivery.id IS NULL THEN
    RAISE EXCEPTION 'Email delivery was not found' USING ERRCODE = 'P0002';
  END IF;
  IF delivery.status NOT IN ('FAILED', 'BOUNCED', 'DELAYED') THEN
    RAISE EXCEPTION 'Only failed, delayed, or bounced email deliveries can be retried' USING ERRCODE = '23514';
  END IF;

  UPDATE public.email_deliveries SET
    status = 'PENDING',
    retryable = TRUE,
    max_attempts = GREATEST(max_attempts, attempt_count + 5),
    next_attempt_at = NOW(),
    requested_by = COALESCE(p_actor_profile_id, requested_by),
    updated_at = NOW()
  WHERE id = p_delivery_id;

  RETURN p_delivery_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_resend_webhook_event(
  p_event_type TEXT,
  p_provider_message_id TEXT,
  p_reason TEXT DEFAULT NULL,
  p_occurred_at TIMESTAMPTZ DEFAULT NOW()
)
RETURNS public.email_deliveries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  delivery public.email_deliveries%ROWTYPE;
  next_status TEXT;
BEGIN
  IF p_provider_message_id IS NULL OR LENGTH(TRIM(p_provider_message_id)) = 0 THEN
    RETURN NULL;
  END IF;

  SELECT * INTO delivery
    FROM public.email_deliveries
    WHERE provider_message_id = p_provider_message_id
    ORDER BY created_at DESC
    LIMIT 1
    FOR UPDATE;

  IF delivery.id IS NULL THEN
    RETURN NULL;
  END IF;

  next_status := CASE p_event_type
    WHEN 'email.sent' THEN 'SENT'
    WHEN 'email.delivered' THEN 'DELIVERED'
    WHEN 'email.delivery_delayed' THEN 'DELAYED'
    WHEN 'email.bounced' THEN 'BOUNCED'
    WHEN 'email.complained' THEN 'COMPLAINED'
    WHEN 'email.failed' THEN 'FAILED'
    ELSE NULL
  END;

  IF next_status IS NULL THEN
    RETURN delivery;
  END IF;

  UPDATE public.email_deliveries SET
    status = next_status,
    sent_at = CASE WHEN next_status = 'SENT' THEN COALESCE(sent_at, p_occurred_at, NOW()) ELSE sent_at END,
    delivered_at = CASE WHEN next_status = 'DELIVERED' THEN COALESCE(delivered_at, p_occurred_at, NOW()) ELSE delivered_at END,
    bounced_at = CASE WHEN next_status IN ('BOUNCED', 'COMPLAINED') THEN COALESCE(bounced_at, p_occurred_at, NOW()) ELSE bounced_at END,
    last_error = CASE WHEN next_status IN ('BOUNCED', 'COMPLAINED', 'DELAYED', 'FAILED')
      THEN LEFT(COALESCE(p_reason, last_error, next_status), 1000)
      ELSE last_error END,
    updated_at = NOW()
  WHERE id = delivery.id
  RETURNING * INTO delivery;

  IF next_status = 'BOUNCED' THEN
    UPDATE public.customers
      SET email_bounced_at = COALESCE(p_occurred_at, NOW()),
          email_bounce_reason = LEFT(COALESCE(p_reason, 'Email bounced'), 500)
      WHERE LOWER(email) = LOWER(delivery.recipient_email);
  ELSIF next_status = 'COMPLAINED' THEN
    UPDATE public.customers
      SET email_complained_at = COALESCE(p_occurred_at, NOW()),
          email_bounce_reason = LEFT(COALESCE(p_reason, 'Marked as spam/complaint'), 500)
      WHERE LOWER(email) = LOWER(delivery.recipient_email);
  END IF;

  RETURN delivery;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_email_deliveries(INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_email_deliveries(INTEGER) TO service_role;

REVOKE ALL ON FUNCTION public.complete_email_delivery(UUID, BOOLEAN, TEXT, TEXT, TEXT, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_email_delivery(UUID, BOOLEAN, TEXT, TEXT, TEXT, BOOLEAN) TO service_role;

REVOKE ALL ON FUNCTION public.retry_email_delivery(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.retry_email_delivery(UUID, UUID) TO service_role;

REVOKE ALL ON FUNCTION public.apply_resend_webhook_event(TEXT, TEXT, TEXT, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_resend_webhook_event(TEXT, TEXT, TEXT, TIMESTAMPTZ) TO service_role;

