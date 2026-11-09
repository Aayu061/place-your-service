-- Migration: 20261109180000_high_scale_indexes_and_payment_backfill.sql
-- Description: Backfill missing payment records for AMC contracts, setup email quotation delivery log, and high-scale indexes

-- 1. Enable pg_trgm for ultra-fast text search if available
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 2. Quotation Email Deliveries Table
CREATE TABLE IF NOT EXISTS public.amc_quotation_email_deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    amc_id UUID NOT NULL REFERENCES public.amc_contracts(id) ON DELETE CASCADE,
    recipient_email TEXT NOT NULL,
    subject TEXT NOT NULL,
    provider_message_id TEXT,
    status TEXT NOT NULL CHECK (status IN ('SENT', 'FAILED')),
    error_message TEXT,
    sent_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_amc_quotation_emails_amc ON public.amc_quotation_email_deliveries(amc_id);
CREATE INDEX IF NOT EXISTS idx_amc_quotation_emails_created ON public.amc_quotation_email_deliveries(created_at DESC);

-- 3. High-Scale Composite & Partial Indexes for Millions of Rows
CREATE INDEX IF NOT EXISTS idx_payments_customer_created ON public.payments(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_status_amc ON public.payments(status, amc_id);
CREATE INDEX IF NOT EXISTS idx_payments_amc_id ON public.payments(amc_id);
CREATE INDEX IF NOT EXISTS idx_amc_contracts_status_customer ON public.amc_contracts(status, customer_id);
CREATE INDEX IF NOT EXISTS idx_payments_number_trgm ON public.payments USING gin (payment_number gin_trgm_ops);

-- 4. Idempotent Backfill: Register payment records for existing AMC contracts that lack payments
INSERT INTO public.payments (
    payment_number,
    customer_id,
    amc_id,
    total_amount_due,
    total_amount_paid,
    status,
    created_at,
    updated_at
)
SELECT 
    'PAY-' || TO_CHAR(c.created_at, 'YYYY') || '-' || UPPER(SUBSTRING(REPLACE(c.id::text, '-', ''), 1, 8)),
    c.customer_id,
    c.id,
    COALESCE(c.total_amount, 0),
    0,
    'PENDING',
    c.created_at,
    NOW()
FROM public.amc_contracts c
WHERE NOT EXISTS (
    SELECT 1 FROM public.payments p WHERE p.amc_id = c.id
);

