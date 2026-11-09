-- Inventory, payment, notification, and email delivery records stay behind
-- the Express service role and retain their history after creation.

ALTER TABLE public.inventory_transactions
  ADD CONSTRAINT inventory_transactions_quantity_nonzero CHECK (quantity <> 0) NOT VALID;

ALTER TABLE public.payment_transactions
  ADD COLUMN IF NOT EXISTS entry_type TEXT NOT NULL DEFAULT 'PAYMENT'
    CHECK (entry_type IN ('PAYMENT', 'REVERSAL')),
  ADD COLUMN IF NOT EXISTS external_payment_reference TEXT,
  ADD COLUMN IF NOT EXISTS reverses_transaction_id UUID
    REFERENCES public.payment_transactions(id) ON DELETE RESTRICT;

ALTER TABLE public.payment_transactions
  DROP CONSTRAINT IF EXISTS payment_transactions_payment_id_fkey;
ALTER TABLE public.payment_transactions
  ADD CONSTRAINT payment_transactions_payment_id_fkey
  FOREIGN KEY (payment_id) REFERENCES public.payments(id) ON DELETE RESTRICT;

ALTER TABLE public.payment_transactions
  DROP CONSTRAINT IF EXISTS payment_transactions_payment_method_check;
ALTER TABLE public.payment_transactions
  ADD CONSTRAINT payment_transactions_payment_method_check
  CHECK (payment_method IN ('CASH', 'ONLINE', 'LEGACY'));

ALTER TABLE public.payment_transactions
  ADD CONSTRAINT payment_transactions_entry_shape CHECK (
    (entry_type = 'PAYMENT' AND reverses_transaction_id IS NULL)
    OR (entry_type = 'REVERSAL' AND reverses_transaction_id IS NOT NULL)
  );

ALTER TABLE public.payment_transactions
  ADD CONSTRAINT payment_transactions_online_reference CHECK (
    payment_method <> 'ONLINE' OR NULLIF(BTRIM(external_payment_reference), '') IS NOT NULL
  ) NOT VALID;

CREATE INDEX IF NOT EXISTS idx_payment_transactions_actor_created
  ON public.payment_transactions(recorded_by, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_reversal
  ON public.payment_transactions(reverses_transaction_id)
  WHERE reverses_transaction_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_external_reference_unique
  ON public.payment_transactions(external_payment_reference)
  WHERE entry_type = 'PAYMENT' AND external_payment_reference IS NOT NULL;

-- Preserve old on-hand balances and paid totals in their respective ledgers.
-- Legacy payment methods remain explicitly unknown instead of being guessed.
DO $$
DECLARE
  migration_actor UUID;
BEGIN
  SELECT s.profile_id INTO migration_actor
    FROM public.staff s WHERE s.role = 'ADMIN' ORDER BY s.created_at LIMIT 1;
  IF EXISTS (
    SELECT 1
    FROM public.payments p
    WHERE COALESCE((
      SELECT SUM(CASE WHEN t.entry_type = 'REVERSAL' THEN -t.amount ELSE t.amount END)
      FROM public.payment_transactions t
      WHERE t.payment_id = p.id AND t.payment_status = 'SUCCESS'
    ), 0) > p.total_amount_paid
  ) THEN
    RAISE EXCEPTION 'Payment history exceeds the stored paid balance; reconcile legacy payments before applying the ledger migration';
  END IF;

  IF migration_actor IS NULL AND (
    EXISTS (
      SELECT 1 FROM public.parts p
      WHERE p.current_stock <> COALESCE((
        SELECT SUM(CASE WHEN t.transaction_type = 'SERVICE_USAGE' THEN -ABS(t.quantity) ELSE t.quantity END)
        FROM public.inventory_transactions t WHERE t.part_id = p.id
      ), 0)
    ) OR EXISTS (
      SELECT 1 FROM public.payments p
      WHERE p.total_amount_paid > COALESCE((
        SELECT SUM(CASE WHEN t.entry_type = 'REVERSAL' THEN -t.amount ELSE t.amount END)
        FROM public.payment_transactions t
        WHERE t.payment_id = p.id AND t.payment_status = 'SUCCESS'
      ), 0)
    )
  ) THEN
    RAISE EXCEPTION 'Operational ledger migration needs an existing Admin profile to attribute legacy balance reconciliation entries';
  END IF;

  INSERT INTO public.inventory_transactions (
    part_id, transaction_type, quantity, reason, recorded_by, created_at
  )
  SELECT p.id, 'OPENING', p.current_stock,
    'Opening balance captured during server-only ledger migration', migration_actor, p.created_at
  FROM public.parts p
  WHERE p.current_stock > 0
    AND NOT EXISTS (SELECT 1 FROM public.inventory_transactions t WHERE t.part_id = p.id);

  INSERT INTO public.inventory_transactions (
    part_id, transaction_type, quantity, reason, recorded_by, created_at
  )
  SELECT p.id, 'ADJUSTMENT',
    p.current_stock - COALESCE((
      SELECT SUM(CASE WHEN t.transaction_type = 'SERVICE_USAGE' THEN -ABS(t.quantity) ELSE t.quantity END)
      FROM public.inventory_transactions t WHERE t.part_id = p.id
    ), 0),
    'Legacy ledger reconciliation to the pre-migration on-hand balance', migration_actor, NOW()
  FROM public.parts p
  WHERE p.current_stock <> COALESCE((
    SELECT SUM(CASE WHEN t.transaction_type = 'SERVICE_USAGE' THEN -ABS(t.quantity) ELSE t.quantity END)
    FROM public.inventory_transactions t WHERE t.part_id = p.id
  ), 0);

  INSERT INTO public.payment_transactions (
    payment_id, transaction_reference, payment_method, amount, payment_status, recorded_by,
    verified_at, notes, entry_type, created_at
  )
  SELECT p.id, 'MIGRATED-' || p.id::TEXT, 'LEGACY', p.total_amount_paid - COALESCE((
      SELECT SUM(CASE WHEN t.entry_type = 'REVERSAL' THEN -t.amount ELSE t.amount END)
      FROM public.payment_transactions t
      WHERE t.payment_id = p.id AND t.payment_status = 'SUCCESS'
    ), 0), 'SUCCESS', migration_actor,
    NOW(), 'Reconciled legacy paid balance; payment method was not recorded.', 'PAYMENT', NOW()
  FROM public.payments p
  WHERE p.total_amount_paid > COALESCE((
    SELECT SUM(CASE WHEN t.entry_type = 'REVERSAL' THEN -t.amount ELSE t.amount END)
    FROM public.payment_transactions t
    WHERE t.payment_id = p.id AND t.payment_status = 'SUCCESS'
  ), 0);
END;
$$;

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS dedupe_key TEXT,
  ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;
CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_dedupe_key
  ON public.notifications(dedupe_key);
CREATE INDEX IF NOT EXISTS idx_notifications_created
  ON public.notifications(recipient_profile_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.service_report_email_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_report_id UUID NOT NULL REFERENCES public.service_reports(id) ON DELETE RESTRICT,
  recipient_email TEXT NOT NULL,
  recipient_name TEXT,
  subject TEXT NOT NULL,
  html_body TEXT NOT NULL,
  text_body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'SENDING', 'SENT', 'FAILED')),
  retryable BOOLEAN NOT NULL DEFAULT TRUE,
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  max_attempts INTEGER NOT NULL DEFAULT 5 CHECK (max_attempts > 0),
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_error TEXT,
  transport TEXT,
  provider_message_id TEXT,
  requested_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMPTZ,
  UNIQUE (service_report_id, recipient_email)
);

CREATE TABLE IF NOT EXISTS public.service_report_email_delivery_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id UUID NOT NULL REFERENCES public.service_report_email_deliveries(id) ON DELETE RESTRICT,
  attempt_number INTEGER NOT NULL CHECK (attempt_number > 0),
  status TEXT NOT NULL CHECK (status IN ('SENT', 'FAILED')),
  transport TEXT NOT NULL,
  provider_message_id TEXT,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (delivery_id, attempt_number)
);
CREATE INDEX IF NOT EXISTS idx_report_email_attempts_delivery
  ON public.service_report_email_delivery_attempts(delivery_id, attempt_number DESC);

CREATE INDEX IF NOT EXISTS idx_report_email_delivery_due
  ON public.service_report_email_deliveries(status, next_attempt_at)
  WHERE status IN ('PENDING', 'FAILED');
ALTER TABLE public.service_report_email_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.service_report_email_deliveries FROM PUBLIC, anon, authenticated;
GRANT ALL PRIVILEGES ON public.service_report_email_deliveries TO service_role;
ALTER TABLE public.service_report_email_delivery_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.service_report_email_delivery_attempts FROM PUBLIC, anon, authenticated;
GRANT ALL PRIVILEGES ON public.service_report_email_delivery_attempts TO service_role;

CREATE OR REPLACE FUNCTION public.prevent_ledger_history_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'Ledger entries are append-only; record a reversal or correction entry'
    USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER trg_inventory_transactions_append_only
  BEFORE UPDATE OR DELETE ON public.inventory_transactions
  FOR EACH ROW EXECUTE FUNCTION public.prevent_ledger_history_mutation();
CREATE TRIGGER trg_service_parts_append_only
  BEFORE UPDATE OR DELETE ON public.service_parts
  FOR EACH ROW EXECUTE FUNCTION public.prevent_ledger_history_mutation();
CREATE TRIGGER trg_payment_transactions_append_only
  BEFORE UPDATE OR DELETE ON public.payment_transactions
  FOR EACH ROW EXECUTE FUNCTION public.prevent_ledger_history_mutation();
CREATE TRIGGER trg_report_email_deliveries_append_only
  BEFORE DELETE ON public.service_report_email_deliveries
  FOR EACH ROW EXECUTE FUNCTION public.prevent_ledger_history_mutation();
CREATE TRIGGER trg_report_email_attempts_append_only
  BEFORE UPDATE OR DELETE ON public.service_report_email_delivery_attempts
  FOR EACH ROW EXECUTE FUNCTION public.prevent_ledger_history_mutation();

-- Use one locked stock balance update and matching immutable ledger insert.
CREATE OR REPLACE FUNCTION public.record_inventory_transaction(
  p_part_id UUID,
  p_transaction_type TEXT,
  p_quantity INTEGER,
  p_reason TEXT,
  p_actor_profile_id UUID,
  p_service_report_id UUID DEFAULT NULL,
  p_unit_price NUMERIC DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  part_row public.parts%ROWTYPE;
  report_row public.service_reports%ROWTYPE;
  movement INTEGER;
  new_stock INTEGER;
  transaction_id UUID;
  normalized_type TEXT := UPPER(BTRIM(p_transaction_type));
BEGIN
  IF p_actor_profile_id IS NULL OR NULLIF(BTRIM(p_reason), '') IS NULL OR p_quantity = 0 THEN
    RAISE EXCEPTION 'Actor, reason, and non-zero quantity are required'
      USING ERRCODE = '22023';
  END IF;
  IF normalized_type NOT IN ('OPENING', 'PURCHASE', 'ADJUSTMENT', 'SERVICE_USAGE', 'RETURN') THEN
    RAISE EXCEPTION 'Unsupported inventory transaction type'
      USING ERRCODE = '22023';
  END IF;
  IF normalized_type IN ('OPENING', 'PURCHASE', 'RETURN') AND p_quantity < 1 THEN
    RAISE EXCEPTION 'Opening, purchase, and return quantities must be positive'
      USING ERRCODE = '22023';
  END IF;
  IF normalized_type = 'SERVICE_USAGE' AND (p_quantity < 1 OR p_service_report_id IS NULL) THEN
    RAISE EXCEPTION 'Service usage requires a positive quantity and report link'
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO part_row FROM public.parts WHERE id = p_part_id FOR UPDATE;
  IF part_row.id IS NULL OR NOT part_row.is_active THEN
    RAISE EXCEPTION 'Part was not found or is inactive' USING ERRCODE = 'P0002';
  END IF;
  IF normalized_type = 'OPENING' AND EXISTS (
    SELECT 1 FROM public.inventory_transactions WHERE part_id = p_part_id
  ) THEN
    RAISE EXCEPTION 'Opening stock can only be recorded once for a part'
      USING ERRCODE = '23505';
  END IF;
  IF normalized_type = 'OPENING' AND part_row.current_stock <> 0 THEN
    RAISE EXCEPTION 'Opening stock can only be recorded when the current balance is zero'
      USING ERRCODE = '23514';
  END IF;
  IF normalized_type = 'SERVICE_USAGE' THEN
    SELECT * INTO report_row FROM public.service_reports
      WHERE id = p_service_report_id FOR UPDATE;
    IF report_row.id IS NULL OR report_row.status NOT IN ('SUBMITTED', 'VERIFIED') THEN
      RAISE EXCEPTION 'Parts can only be consumed against an issued service report'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  movement := CASE WHEN normalized_type = 'SERVICE_USAGE' THEN -p_quantity ELSE p_quantity END;
  new_stock := part_row.current_stock + movement;
  IF new_stock < 0 THEN
    RAISE EXCEPTION 'Insufficient stock: available %, requested %', part_row.current_stock, ABS(movement)
      USING ERRCODE = '23514', CONSTRAINT = 'parts_current_stock_check';
  END IF;

  UPDATE public.parts SET current_stock = new_stock, updated_at = NOW() WHERE id = p_part_id;
  INSERT INTO public.inventory_transactions (
    part_id, transaction_type, quantity, reference_type, reference_id, reason, recorded_by
  ) VALUES (
    p_part_id, normalized_type, movement,
    CASE WHEN p_service_report_id IS NULL THEN NULL ELSE 'SERVICE_REPORT' END,
    p_service_report_id, BTRIM(p_reason), p_actor_profile_id
  ) RETURNING id INTO transaction_id;

  IF normalized_type = 'SERVICE_USAGE' THEN
    INSERT INTO public.service_parts (
      service_report_id, part_id, quantity, unit_price, total_price
    ) VALUES (
      p_service_report_id, p_part_id, p_quantity,
      COALESCE(p_unit_price, part_row.unit_price),
      p_quantity * COALESCE(p_unit_price, part_row.unit_price)
    );
  END IF;

  INSERT INTO public.activity_logs (actor_profile_id, action, entity_type, entity_id, details)
  VALUES (
    p_actor_profile_id, 'INVENTORY_TRANSACTION_RECORDED', 'inventory_transaction', transaction_id,
    jsonb_build_object('partId', p_part_id, 'type', normalized_type, 'quantity', movement, 'stockAfter', new_stock)
  );

  RETURN jsonb_build_object('transaction_id', transaction_id, 'part_id', p_part_id, 'current_stock', new_stock);
END;
$$;

REVOKE ALL ON FUNCTION public.record_inventory_transaction(UUID, TEXT, INTEGER, TEXT, UUID, UUID, NUMERIC)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_inventory_transaction(UUID, TEXT, INTEGER, TEXT, UUID, UUID, NUMERIC)
  TO service_role;

CREATE OR REPLACE FUNCTION public.create_payment_record(
  p_payment_number TEXT,
  p_customer_id UUID,
  p_service_request_id UUID,
  p_amc_id UUID,
  p_total_amount_due NUMERIC,
  p_actor_profile_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  payment_id UUID;
  sr_customer UUID;
  amc_customer UUID;
BEGIN
  IF p_total_amount_due <= 0 OR NULLIF(BTRIM(p_payment_number), '') IS NULL THEN
    RAISE EXCEPTION 'Payment number and positive amount due are required' USING ERRCODE = '22023';
  END IF;
  IF p_service_request_id IS NOT NULL AND p_amc_id IS NOT NULL THEN
    RAISE EXCEPTION 'A payment record can reference either a service request or an AMC contract'
      USING ERRCODE = '22023';
  END IF;
  IF p_service_request_id IS NOT NULL THEN
    SELECT customer_id INTO sr_customer FROM public.service_requests WHERE id = p_service_request_id;
    IF sr_customer IS DISTINCT FROM p_customer_id THEN
      RAISE EXCEPTION 'Service request must belong to the selected customer'
        USING ERRCODE = '23514', CONSTRAINT = 'payment_service_request_customer';
    END IF;
  END IF;
  IF p_amc_id IS NOT NULL THEN
    SELECT customer_id INTO amc_customer FROM public.amc_contracts WHERE id = p_amc_id;
    IF amc_customer IS DISTINCT FROM p_customer_id THEN
      RAISE EXCEPTION 'AMC contract must belong to the selected customer'
        USING ERRCODE = '23514', CONSTRAINT = 'payment_amc_customer';
    END IF;
  END IF;
  INSERT INTO public.payments (payment_number, customer_id, service_request_id, amc_id, total_amount_due)
  VALUES (BTRIM(p_payment_number), p_customer_id, p_service_request_id, p_amc_id, p_total_amount_due)
  RETURNING id INTO payment_id;
  INSERT INTO public.activity_logs (actor_profile_id, action, entity_type, entity_id, details)
  VALUES (p_actor_profile_id, 'PAYMENT_RECORD_CREATED', 'payment', payment_id,
    jsonb_build_object('paymentNumber', p_payment_number, 'customerId', p_customer_id, 'amountDue', p_total_amount_due));
  RETURN payment_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_payment_record(TEXT, UUID, UUID, UUID, NUMERIC, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_payment_record(TEXT, UUID, UUID, UUID, NUMERIC, UUID)
  TO service_role;

CREATE OR REPLACE FUNCTION public.record_payment_transaction(
  p_payment_id UUID,
  p_payment_method TEXT,
  p_amount NUMERIC,
  p_external_payment_reference TEXT,
  p_notes TEXT,
  p_actor_profile_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  payment_row public.payments%ROWTYPE;
  amount_paid NUMERIC;
  transaction_id UUID;
  method_value TEXT := UPPER(BTRIM(p_payment_method));
BEGIN
  IF p_amount <= 0 OR p_actor_profile_id IS NULL OR method_value NOT IN ('CASH', 'ONLINE') THEN
    RAISE EXCEPTION 'Valid payment method, positive amount, and staff actor are required'
      USING ERRCODE = '22023';
  END IF;
  IF method_value = 'ONLINE' AND NULLIF(BTRIM(p_external_payment_reference), '') IS NULL THEN
    RAISE EXCEPTION 'External payment reference is required for online records'
      USING ERRCODE = '22023';
  END IF;
  SELECT * INTO payment_row FROM public.payments WHERE id = p_payment_id FOR UPDATE;
  IF payment_row.id IS NULL OR payment_row.status IN ('FAILED', 'REFUNDED') THEN
    RAISE EXCEPTION 'Payment record cannot accept entries' USING ERRCODE = '23514';
  END IF;
  SELECT COALESCE(SUM(CASE WHEN entry_type = 'REVERSAL' THEN -amount ELSE amount END), 0)
    INTO amount_paid FROM public.payment_transactions
    WHERE payment_id = p_payment_id AND payment_status = 'SUCCESS';
  IF amount_paid + p_amount > payment_row.total_amount_due THEN
    RAISE EXCEPTION 'Payment would exceed the outstanding balance'
      USING ERRCODE = '23514', CONSTRAINT = 'payment_outstanding_balance';
  END IF;
  INSERT INTO public.payment_transactions (
    payment_id, transaction_reference, payment_method, amount, payment_status,
    recorded_by, verified_at, notes, entry_type, external_payment_reference
  ) VALUES (
    p_payment_id, 'PTXN-' || gen_random_uuid()::TEXT, method_value, p_amount, 'SUCCESS',
    p_actor_profile_id, NOW(), NULLIF(BTRIM(p_notes), ''), 'PAYMENT', NULLIF(BTRIM(p_external_payment_reference), '')
  ) RETURNING id INTO transaction_id;

  UPDATE public.payments SET
    total_amount_paid = amount_paid + p_amount,
    status = CASE WHEN amount_paid + p_amount >= total_amount_due THEN 'PAID' ELSE 'PARTIALLY_PAID' END,
    updated_at = NOW()
    WHERE id = p_payment_id;
  INSERT INTO public.activity_logs (actor_profile_id, action, entity_type, entity_id, details)
  VALUES (p_actor_profile_id, 'PAYMENT_TRANSACTION_RECORDED', 'payment_transaction', transaction_id,
    jsonb_build_object('paymentId', p_payment_id, 'method', method_value, 'amount', p_amount));
  RETURN transaction_id;
END;
$$;

REVOKE ALL ON FUNCTION public.record_payment_transaction(UUID, TEXT, NUMERIC, TEXT, TEXT, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_payment_transaction(UUID, TEXT, NUMERIC, TEXT, TEXT, UUID)
  TO service_role;

CREATE OR REPLACE FUNCTION public.record_payment_reversal(
  p_original_transaction_id UUID,
  p_amount NUMERIC,
  p_reason TEXT,
  p_actor_profile_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  original_row public.payment_transactions%ROWTYPE;
  payment_row public.payments%ROWTYPE;
  reversed_amount NUMERIC;
  paid_balance NUMERIC;
  reversal_id UUID;
BEGIN
  IF p_amount <= 0 OR p_actor_profile_id IS NULL OR NULLIF(BTRIM(p_reason), '') IS NULL THEN
    RAISE EXCEPTION 'Positive reversal amount, reason, and staff actor are required' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO original_row FROM public.payment_transactions
    WHERE id = p_original_transaction_id FOR UPDATE;
  IF original_row.id IS NULL OR original_row.entry_type <> 'PAYMENT' OR original_row.payment_status <> 'SUCCESS' THEN
    RAISE EXCEPTION 'Only successful original payment entries can be reversed' USING ERRCODE = '23514';
  END IF;
  SELECT * INTO payment_row FROM public.payments WHERE id = original_row.payment_id FOR UPDATE;
  SELECT COALESCE(SUM(amount), 0) INTO reversed_amount
    FROM public.payment_transactions
    WHERE reverses_transaction_id = original_row.id AND payment_status = 'SUCCESS';
  IF reversed_amount + p_amount > original_row.amount THEN
    RAISE EXCEPTION 'Reversal exceeds the remaining amount on the original payment'
      USING ERRCODE = '23514', CONSTRAINT = 'payment_reversal_not_over_original';
  END IF;
  INSERT INTO public.payment_transactions (
    payment_id, transaction_reference, payment_method, amount, payment_status,
    recorded_by, verified_at, notes, entry_type, reverses_transaction_id, external_payment_reference
  ) VALUES (
    original_row.payment_id, 'PREV-' || gen_random_uuid()::TEXT, original_row.payment_method,
    p_amount, 'SUCCESS', p_actor_profile_id, NOW(), BTRIM(p_reason), 'REVERSAL', original_row.id,
    original_row.external_payment_reference
  ) RETURNING id INTO reversal_id;

  SELECT COALESCE(SUM(CASE WHEN entry_type = 'REVERSAL' THEN -amount ELSE amount END), 0)
    INTO paid_balance FROM public.payment_transactions
    WHERE payment_id = original_row.payment_id AND payment_status = 'SUCCESS';
  UPDATE public.payments SET
    total_amount_paid = GREATEST(paid_balance, 0),
    status = CASE WHEN paid_balance <= 0 THEN 'REFUNDED'
      WHEN paid_balance >= total_amount_due THEN 'PAID' ELSE 'PARTIALLY_PAID' END,
    updated_at = NOW()
    WHERE id = original_row.payment_id;
  INSERT INTO public.activity_logs (actor_profile_id, action, entity_type, entity_id, details)
  VALUES (p_actor_profile_id, 'PAYMENT_REVERSAL_RECORDED', 'payment_transaction', reversal_id,
    jsonb_build_object('paymentId', original_row.payment_id, 'reversesTransactionId', original_row.id,
      'amount', p_amount, 'reason', BTRIM(p_reason)));
  RETURN reversal_id;
END;
$$;

REVOKE ALL ON FUNCTION public.record_payment_reversal(UUID, NUMERIC, TEXT, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_payment_reversal(UUID, NUMERIC, TEXT, UUID)
  TO service_role;

CREATE OR REPLACE FUNCTION public.claim_service_report_email_deliveries(p_limit INTEGER DEFAULT 20)
RETURNS SETOF public.service_report_email_deliveries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  UPDATE public.service_report_email_deliveries
    SET status = 'PENDING', updated_at = NOW()
    WHERE status = 'SENDING' AND updated_at < NOW() - INTERVAL '10 minutes';

  RETURN QUERY
    WITH due AS (
      SELECT id FROM public.service_report_email_deliveries
      WHERE status IN ('PENDING', 'FAILED')
        AND retryable AND next_attempt_at <= NOW() AND attempt_count < max_attempts
      ORDER BY created_at
      FOR UPDATE SKIP LOCKED
      LIMIT LEAST(GREATEST(p_limit, 1), 100)
    )
    UPDATE public.service_report_email_deliveries AS d
      SET status = 'SENDING', attempt_count = attempt_count + 1, updated_at = NOW()
      FROM due WHERE d.id = due.id
      RETURNING d.*;
END;
$$;

CREATE OR REPLACE FUNCTION public.retry_service_report_email_delivery(
  p_delivery_id UUID,
  p_report_id UUID,
  p_actor_profile_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  delivery public.service_report_email_deliveries%ROWTYPE;
BEGIN
  SELECT * INTO delivery FROM public.service_report_email_deliveries
  WHERE id = p_delivery_id AND service_report_id = p_report_id FOR UPDATE;
  IF delivery.id IS NULL THEN
    RAISE EXCEPTION 'Email delivery was not found for this report' USING ERRCODE = 'P0002';
  END IF;
  IF delivery.status <> 'FAILED' THEN
    RAISE EXCEPTION 'Only a failed email delivery can be retried' USING ERRCODE = '23514';
  END IF;

  UPDATE public.service_report_email_deliveries SET
    status = 'PENDING',
    retryable = TRUE,
    max_attempts = GREATEST(max_attempts, attempt_count + 5),
    next_attempt_at = NOW(),
    requested_by = p_actor_profile_id,
    updated_at = NOW()
  WHERE id = p_delivery_id;
  RETURN p_delivery_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_service_report_email_delivery(
  p_delivery_id UUID,
  p_succeeded BOOLEAN,
  p_transport TEXT,
  p_provider_message_id TEXT,
  p_error TEXT,
  p_retryable BOOLEAN
)
RETURNS public.service_report_email_deliveries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  delivery public.service_report_email_deliveries%ROWTYPE;
BEGIN
  SELECT * INTO delivery FROM public.service_report_email_deliveries
    WHERE id = p_delivery_id FOR UPDATE;
  IF delivery.id IS NULL OR delivery.status <> 'SENDING' THEN
    RAISE EXCEPTION 'Email delivery is not currently claimed' USING ERRCODE = '23514';
  END IF;
  UPDATE public.service_report_email_deliveries SET
    status = CASE WHEN p_succeeded THEN 'SENT'
      WHEN delivery.attempt_count >= delivery.max_attempts THEN 'FAILED' ELSE 'FAILED' END,
    retryable = CASE WHEN p_succeeded THEN FALSE ELSE COALESCE(p_retryable, TRUE) END,
    next_attempt_at = CASE WHEN p_succeeded THEN next_attempt_at
      ELSE NOW() + make_interval(secs => LEAST(86400, 30 * (2 ^ LEAST(delivery.attempt_count - 1, 10))::INTEGER)) END,
    last_error = CASE WHEN p_succeeded THEN NULL ELSE LEFT(COALESCE(p_error, 'Delivery failed'), 1000) END,
    transport = p_transport,
    provider_message_id = p_provider_message_id,
    sent_at = CASE WHEN p_succeeded THEN NOW() ELSE NULL END,
    updated_at = NOW()
    WHERE id = p_delivery_id
    RETURNING * INTO delivery;
  INSERT INTO public.service_report_email_delivery_attempts (
    delivery_id, attempt_number, status, transport, provider_message_id, error
  ) VALUES (
    delivery.id, delivery.attempt_count, CASE WHEN p_succeeded THEN 'SENT' ELSE 'FAILED' END,
    COALESCE(p_transport, 'unknown'), p_provider_message_id,
    CASE WHEN p_succeeded THEN NULL ELSE LEFT(COALESCE(p_error, 'Delivery failed'), 1000) END
  );
  RETURN delivery;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_service_report_email_deliveries(INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_service_report_email_deliveries(INTEGER)
  TO service_role;
REVOKE ALL ON FUNCTION public.complete_service_report_email_delivery(UUID, BOOLEAN, TEXT, TEXT, TEXT, BOOLEAN)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_service_report_email_delivery(UUID, BOOLEAN, TEXT, TEXT, TEXT, BOOLEAN)
  TO service_role;
REVOKE ALL ON FUNCTION public.retry_service_report_email_delivery(UUID, UUID, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.retry_service_report_email_delivery(UUID, UUID, UUID)
  TO service_role;

-- Cross-module search stays parameterized in PostgreSQL and returns a bounded
-- set of records the authenticated internal API is allowed to expose.
CREATE OR REPLACE FUNCTION public.search_business_records(p_query TEXT, p_limit INTEGER DEFAULT 60)
RETURNS TABLE (
  record_type TEXT,
  record_id UUID,
  context_id UUID,
  title TEXT,
  subtitle TEXT,
  status TEXT,
  occurred_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  WITH q AS (SELECT LOWER(BTRIM(p_query)) AS needle), matches AS (
    SELECT 'customer'::TEXT AS record_type, c.id AS record_id, c.id AS context_id, c.name AS title,
      c.customer_code || ' · ' || c.phone AS subtitle,
      CASE WHEN c.is_active THEN 'ACTIVE' ELSE 'INACTIVE' END AS status, c.created_at AS occurred_at,
      concat_ws(' ', c.name, c.company_name, c.customer_code, c.phone, c.email) AS search_text
    FROM public.customers c
    UNION ALL
    SELECT 'site', cs.id, cs.customer_id, cs.site_name, cs.address, CASE WHEN cs.is_active THEN 'ACTIVE' ELSE 'INACTIVE' END,
      cs.created_at, concat_ws(' ', cs.site_name, cs.address, cs.contact_person, cs.contact_phone)
    FROM public.customer_sites cs
    UNION ALL
    SELECT 'asset', a.id, cs.customer_id, a.asset_tag, concat_ws(' ', a.brand, a.model_number, a.serial_number),
      CASE WHEN a.is_active THEN 'ACTIVE' ELSE 'INACTIVE' END, a.created_at,
      concat_ws(' ', a.asset_tag, a.brand, a.model_number, a.serial_number)
    FROM public.ac_assets a JOIN public.customer_sites cs ON cs.id = a.site_id
    UNION ALL
    SELECT 'service_request', sr.id, sr.customer_id, sr.request_number, sr.description, sr.status, sr.created_at,
      concat_ws(' ', sr.request_number, sr.description, sr.status)
    FROM public.service_requests sr
    UNION ALL
    SELECT 'schedule', s.id, s.customer_id, s.schedule_number, s.scheduled_date::TEXT, s.status,
      s.scheduled_date::TIMESTAMPTZ, concat_ws(' ', s.schedule_number, s.status, s.notes, s.scheduled_date::TEXT)
    FROM public.service_schedules s
    UNION ALL
    SELECT 'service_report', r.id, r.customer_id, r.report_number, r.primary_outcome, r.status,
      r.service_date::TIMESTAMPTZ, concat_ws(' ', r.report_number, r.primary_outcome, r.technician_remarks)
    FROM public.service_reports r
    UNION ALL
    SELECT 'amc', a.id, a.customer_id, a.contract_number, a.end_date::TEXT, a.status,
      a.end_date::TIMESTAMPTZ, concat_ws(' ', a.contract_number, a.status, a.end_date::TEXT)
    FROM public.amc_contracts a
  )
  SELECT m.record_type, m.record_id, m.context_id, m.title, m.subtitle, m.status, m.occurred_at
  FROM matches m CROSS JOIN q
  WHERE char_length(q.needle) >= 2 AND POSITION(q.needle IN LOWER(m.search_text)) > 0
  ORDER BY m.occurred_at DESC NULLS LAST
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 60), 1), 100)
$$;

REVOKE ALL ON FUNCTION public.search_business_records(TEXT, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_business_records(TEXT, INTEGER)
  TO service_role;

