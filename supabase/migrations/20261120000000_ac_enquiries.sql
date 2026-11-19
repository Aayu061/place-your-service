-- AC enquiries (ESS plan 3, 2026-11-20)
-- * A PRODUCT_ENQUIRY may now carry several AC lines (web_intake_items, one per AC, with its seller).
--   approve_web_intake already treats it like an ACs-only basket: lines -> QUOTE_PENDING, no service request.
-- * The seller sends a price per line: new line status QUOTED + quote columns.
-- * Customer email for a price: email_deliveries entity type ENQUIRY_QUOTE.
-- Idempotent; safe to re-run.

ALTER TABLE public.web_intake_items DROP CONSTRAINT IF EXISTS web_intake_items_line_status_check;
ALTER TABLE public.web_intake_items ADD CONSTRAINT web_intake_items_line_status_check
  CHECK (line_status IN ('PENDING', 'APPROVED', 'QUOTE_PENDING', 'QUOTED', 'FULFILLED', 'REJECTED', 'CANCELLED'));

ALTER TABLE public.web_intake_items ADD COLUMN IF NOT EXISTS quote_total numeric(12,2);
ALTER TABLE public.web_intake_items ADD COLUMN IF NOT EXISTS quote_note  text;
ALTER TABLE public.web_intake_items ADD COLUMN IF NOT EXISTS quoted_at   timestamptz;
ALTER TABLE public.web_intake_items ADD COLUMN IF NOT EXISTS quoted_by   uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.web_intake_items DROP CONSTRAINT IF EXISTS web_intake_items_quote_check;
ALTER TABLE public.web_intake_items ADD CONSTRAINT web_intake_items_quote_check
  CHECK ((quote_total IS NULL OR (quote_total > 0 AND quote_total <= 10000000))
         AND (quote_note IS NULL OR length(quote_note) <= 1000)
         AND (line_status <> 'QUOTED' OR quote_total IS NOT NULL));

CREATE INDEX IF NOT EXISTS idx_web_intake_items_seller_enquiries
  ON public.web_intake_items (seller_id, line_status)
  WHERE item_type = 'PRODUCT';

ALTER TABLE public.email_deliveries DROP CONSTRAINT IF EXISTS email_deliveries_entity_type_check;
ALTER TABLE public.email_deliveries ADD CONSTRAINT email_deliveries_entity_type_check
  CHECK (entity_type IN (
    'SERVICE_REPORT', 'AMC_QUOTATION', 'AMC_EXPIRY_REMINDER', 'PAYMENT_INVOICE', 'PAYMENT_RECEIPT',
    'DISPATCH_CONFIRMATION', 'TEST_EMAIL',
    'INTAKE_RECEIPT', 'INTAKE_CONFIRMATION', 'INTAKE_REJECTION', 'SERVICE_STATUS_UPDATE', 'PORTAL_OTP',
    'ENQUIRY_QUOTE'
  ));
