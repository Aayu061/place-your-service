-- Migration: 20261109160000_service_report_payment_details.sql
-- Description: Add payment collection and settlement fields to service_reports table

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'service_reports'
          AND column_name = 'payment_collected'
    ) THEN
        ALTER TABLE public.service_reports
            ADD COLUMN payment_collected BOOLEAN NOT NULL DEFAULT FALSE,
            ADD COLUMN payment_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (payment_amount >= 0),
            ADD COLUMN payment_method TEXT CHECK (payment_method IS NULL OR payment_method IN ('CASH', 'ONLINE')),
            ADD COLUMN payment_reference TEXT,
            ADD COLUMN payment_notes TEXT,
            ADD COLUMN payment_id UUID REFERENCES public.payments(id) ON DELETE SET NULL;

        CREATE INDEX IF NOT EXISTS idx_service_reports_payment ON public.service_reports(payment_id);
    END IF;
END $$;

