-- Phase 1: Security RLS fix for amc_quotation_email_deliveries and unified SQL dashboard analytics RPC

-- 1. Enable RLS on public.amc_quotation_email_deliveries and add role-scoped policies
ALTER TABLE IF EXISTS public.amc_quotation_email_deliveries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS amc_quotation_email_deliveries_select_authorized ON public.amc_quotation_email_deliveries;
DROP POLICY IF EXISTS amc_quotation_email_deliveries_modify_authorized ON public.amc_quotation_email_deliveries;
DROP POLICY IF EXISTS amc_quotation_email_deliveries_authorized ON public.amc_quotation_email_deliveries;
CREATE POLICY amc_quotation_email_deliveries_authorized
  ON public.amc_quotation_email_deliveries
  FOR ALL
  TO authenticated
  USING (public.get_user_role((SELECT auth.uid())) = ANY (ARRAY['ADMIN'::text, 'STAFF'::text]))
  WITH CHECK (public.get_user_role((SELECT auth.uid())) = ANY (ARRAY['ADMIN'::text, 'STAFF'::text]));

DROP POLICY IF EXISTS amc_quotation_email_deliveries_service_role ON public.amc_quotation_email_deliveries;
CREATE POLICY amc_quotation_email_deliveries_service_role
  ON public.amc_quotation_email_deliveries
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 2. SQL RPC replacing 26 sequential PostgREST scans and removing 1,000-row limits + synthetic 0.6/0.4 split
CREATE OR REPLACE FUNCTION public.get_dashboard_summary(
  p_today date DEFAULT (timezone('Asia/Kolkata', now())::date)
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_today date := COALESCE(p_today, timezone('Asia/Kolkata', now())::date);
  v_open_statuses text[] := ARRAY[
    'REQUESTED', 'PENDING', 'SCHEDULED', 'PLANNED', 'DUE', 'OVERDUE',
    'ASSIGNED', 'IN_PROGRESS', 'AWAITING_PARTS', 'REVISIT_REQUIRED', 'ON_HOLD'
  ];
  v_dispatch_statuses text[] := ARRAY['REQUESTED', 'PENDING', 'AWAITING_PARTS', 'REVISIT_REQUIRED'];
  v_active_amc_count bigint := 0;
  v_expiring_soon_count bigint := 0;
  v_covered_asset_count bigint := 0;
  v_draft_count bigint := 0;
  v_draft_value numeric := 0;
  v_active_technicians bigint := 0;
  v_unassigned_requests bigint := 0;
  v_urgent_requests bigint := 0;
  v_open_schedules bigint := 0;
  v_overdue_schedules bigint := 0;
  v_assigned_schedules bigint := 0;
  v_completed_today bigint := 0;
  v_dry_service_count bigint := 0;
  v_jet_service_count bigint := 0;
  v_total_invoiced numeric := 0;
  v_total_collected numeric := 0;
  v_total_outstanding numeric := 0;
  v_pending_payments bigint := 0;
  v_paid_payments bigint := 0;
  v_cash_collected numeric := 0;
  v_online_collected numeric := 0;
  v_collection_rate integer := 0;
  v_capacity_percent integer := 0;
  v_compliance_percent integer := 0;
  v_recent_requests jsonb := '[]'::jsonb;
  v_recent_schedules jsonb := '[]'::jsonb;
  v_recent_reports jsonb := '[]'::jsonb;
  v_trend_data jsonb := '[]'::jsonb;
BEGIN
  -- AMC portfolio metrics
  SELECT
    COUNT(*) FILTER (WHERE status IN ('ACTIVE', 'EXPIRING_SOON') AND end_date >= v_today),
    COUNT(*) FILTER (WHERE status IN ('ACTIVE', 'EXPIRING_SOON') AND end_date >= v_today AND end_date <= (v_today + 30)),
    COUNT(*) FILTER (WHERE status = 'DRAFT'),
    COALESCE(SUM(total_amount) FILTER (WHERE status = 'DRAFT'), 0)
  INTO v_active_amc_count, v_expiring_soon_count, v_draft_count, v_draft_value
  FROM public.amc_contracts;

  SELECT COUNT(DISTINCT aa.asset_id)
  INTO v_covered_asset_count
  FROM public.amc_assets aa
  JOIN public.amc_contracts ac ON ac.id = aa.amc_id
  WHERE ac.status IN ('ACTIVE', 'EXPIRING_SOON')
    AND ac.end_date >= v_today;

  -- Technician & service request metrics
  SELECT COUNT(*) INTO v_active_technicians
  FROM public.technicians
  WHERE is_active = true;

  SELECT
    COUNT(*) FILTER (WHERE status = ANY(v_dispatch_statuses)),
    COUNT(*) FILTER (WHERE priority IN ('URGENT', 'EMERGENCY') AND status = ANY(v_open_statuses))
  INTO v_unassigned_requests, v_urgent_requests
  FROM public.service_requests;

  -- Schedule metrics + real DRY_SERVICE vs JET_SERVICE counts
  SELECT
    COUNT(*) FILTER (WHERE status = ANY(v_open_statuses)),
    COUNT(*) FILTER (WHERE status = ANY(v_open_statuses) AND scheduled_date < v_today),
    COUNT(*) FILTER (WHERE status = ANY(v_open_statuses) AND technician_id IS NOT NULL),
    COUNT(*) FILTER (WHERE scheduled_date = v_today AND status = 'COMPLETED'),
    COUNT(*) FILTER (WHERE status = ANY(v_open_statuses) AND planned_service_type = 'DRY_SERVICE'),
    COUNT(*) FILTER (WHERE status = ANY(v_open_statuses) AND planned_service_type = 'JET_SERVICE')
  INTO
    v_open_schedules,
    v_overdue_schedules,
    v_assigned_schedules,
    v_completed_today,
    v_dry_service_count,
    v_jet_service_count
  FROM public.service_schedules;

  -- Financials without row caps
  SELECT
    COALESCE(SUM(total_amount_due), 0),
    COALESCE(SUM(total_amount_paid), 0),
    COALESCE(SUM(GREATEST(0, COALESCE(total_amount_due, 0) - COALESCE(total_amount_paid, 0))) FILTER (WHERE status <> 'PAID'), 0),
    COUNT(*) FILTER (WHERE status IN ('PENDING', 'PARTIALLY_PAID')),
    COUNT(*) FILTER (WHERE status = 'PAID')
  INTO
    v_total_invoiced,
    v_total_collected,
    v_total_outstanding,
    v_pending_payments,
    v_paid_payments
  FROM public.payments;

  SELECT
    GREATEST(0, COALESCE(SUM(
      CASE
        WHEN payment_method = 'CASH' THEN CASE WHEN entry_type = 'REVERSAL' THEN -amount ELSE amount END
        ELSE 0
      END
    ), 0)),
    GREATEST(0, COALESCE(SUM(
      CASE
        WHEN payment_method = 'ONLINE' THEN CASE WHEN entry_type = 'REVERSAL' THEN -amount ELSE amount END
        ELSE 0
      END
    ), 0))
  INTO v_cash_collected, v_online_collected
  FROM public.payment_transactions
  WHERE payment_status = 'SUCCESS';

  IF v_total_invoiced > 0 THEN
    v_collection_rate := ROUND((v_total_collected / v_total_invoiced) * 100)::integer;
  END IF;

  IF v_open_schedules > 0 THEN
    v_capacity_percent := ROUND((v_assigned_schedules::numeric / v_open_schedules) * 100)::integer;
    v_compliance_percent := GREATEST(0, ROUND(((v_open_schedules - v_overdue_schedules)::numeric / v_open_schedules) * 100)::integer);
  END IF;

  -- Recent open service requests (top 10)
  SELECT COALESCE(jsonb_agg(item), '[]'::jsonb)
  INTO v_recent_requests
  FROM (
    SELECT jsonb_build_object(
      'id', sr.id,
      'requestNumber', sr.request_number,
      'customerName', c.name,
      'siteName', cs.site_name,
      'assetBrand', aa.brand,
      'assetModel', aa.model_number,
      'requestType', sr.request_type,
      'priority', sr.priority,
      'status', sr.status,
      'createdAt', sr.created_at
    ) AS item
    FROM public.service_requests sr
    LEFT JOIN public.customers c ON c.id = sr.customer_id
    LEFT JOIN public.customer_sites cs ON cs.id = sr.site_id
    LEFT JOIN public.ac_assets aa ON aa.id = sr.asset_id
    WHERE sr.status = ANY(v_open_statuses)
    ORDER BY sr.created_at DESC
    LIMIT 10
  ) reqs;

  -- Recent open schedules (top 10)
  SELECT COALESCE(jsonb_agg(item), '[]'::jsonb)
  INTO v_recent_schedules
  FROM (
    SELECT jsonb_build_object(
      'id', ss.id,
      'scheduleNumber', ss.schedule_number,
      'customerName', c.name,
      'siteName', cs.site_name,
      'brand', aa.brand,
      'scheduledDate', ss.scheduled_date,
      'status', ss.status
    ) AS item
    FROM public.service_schedules ss
    LEFT JOIN public.customers c ON c.id = ss.customer_id
    LEFT JOIN public.customer_sites cs ON cs.id = ss.site_id
    LEFT JOIN public.ac_assets aa ON aa.id = ss.asset_id
    WHERE ss.status = ANY(v_open_statuses)
    ORDER BY ss.scheduled_date ASC
    LIMIT 10
  ) scheds;

  -- Recent service reports (top 8)
  SELECT COALESCE(jsonb_agg(item), '[]'::jsonb)
  INTO v_recent_reports
  FROM (
    SELECT jsonb_build_object(
      'id', rp.id,
      'reportNumber', rp.report_number,
      'serviceDate', rp.service_date,
      'primaryOutcome', rp.primary_outcome,
      'status', rp.status,
      'paymentCollected', COALESCE(rp.payment_collected, false),
      'paymentAmount', rp.payment_amount,
      'paymentMethod', rp.payment_method,
      'customerName', c.name,
      'siteName', cs.site_name,
      'technicianName', t.name
    ) AS item
    FROM public.service_reports rp
    LEFT JOIN public.customers c ON c.id = rp.customer_id
    LEFT JOIN public.customer_sites cs ON cs.id = rp.site_id
    LEFT JOIN public.technicians t ON t.id = rp.technician_id
    ORDER BY rp.service_date DESC, rp.created_at DESC
    LIMIT 8
  ) rpts;

  -- 7-day rolling IST volume trend
  SELECT COALESCE(jsonb_agg(item ORDER BY day_date ASC), '[]'::jsonb)
  INTO v_trend_data
  FROM (
    SELECT
      gs::date AS day_date,
      jsonb_build_object(
        'label', to_char(gs::date, 'Dy'),
        'date', to_char(gs::date, 'YYYY-MM-DD'),
        'value', (
          SELECT COUNT(*)
          FROM public.service_requests sr
          WHERE sr.created_at >= (gs::date::timestamp AT TIME ZONE 'Asia/Kolkata')
            AND sr.created_at < ((gs::date + 1)::timestamp AT TIME ZONE 'Asia/Kolkata')
        ),
        'secondaryValue', (
          SELECT COUNT(*)
          FROM public.service_schedules ss
          WHERE ss.scheduled_date = gs::date
        )
      ) AS item
    FROM generate_series(v_today - 6, v_today, interval '1 day') AS gs
  ) tr;

  RETURN jsonb_build_object(
    'kpi', jsonb_build_object(
      'activeAmcCount', v_active_amc_count,
      'coveredAssetCount', v_covered_asset_count,
      'servicesDueCount', v_open_schedules,
      'overdueScheduleCount', v_overdue_schedules,
      'unassignedRequestsCount', v_unassigned_requests,
      'urgentRequestsCount', v_urgent_requests,
      'activeTechniciansCount', v_active_technicians,
      'completedTodayCount', v_completed_today,
      'totalRevenueCollected', v_total_collected,
      'totalOutstandingBalance', v_total_outstanding,
      'collectionRatePercent', v_collection_rate,
      'draftQuotationsCount', v_draft_count,
      'draftQuotationsValue', v_draft_value
    ),
    'financials', jsonb_build_object(
      'totalInvoiced', v_total_invoiced,
      'totalCollected', v_total_collected,
      'totalOutstanding', v_total_outstanding,
      'collectionRatePercent', v_collection_rate,
      'cashCollected', v_cash_collected,
      'onlineCollected', v_online_collected,
      'pendingPaymentsCount', v_pending_payments,
      'paidPaymentsCount', v_paid_payments
    ),
    'amcPipeline', jsonb_build_object(
      'draftCount', v_draft_count,
      'draftValue', v_draft_value,
      'activeCount', v_active_amc_count,
      'expiringSoonCount', v_expiring_soon_count
    ),
    'capacityPercent', v_capacity_percent,
    'compliancePercent', v_compliance_percent,
    'recentServiceRequests', v_recent_requests,
    'recentSchedules', v_recent_schedules,
    'recentServiceReports', v_recent_reports,
    'workDistribution', jsonb_build_array(
      jsonb_build_object('label', 'Preventive Maint', 'count', v_open_schedules, 'category', 'PM'),
      jsonb_build_object('label', 'Breakdown / Repair', 'count', v_unassigned_requests, 'category', 'BREAKDOWN'),
      jsonb_build_object('label', 'Dry Service', 'count', v_dry_service_count, 'category', 'PM'),
      jsonb_build_object('label', 'Jet Service', 'count', v_jet_service_count, 'category', 'PM'),
      jsonb_build_object('label', 'Urgent / Priority', 'count', v_urgent_requests, 'category', 'BREAKDOWN')
    ),
    'trendData', v_trend_data
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_dashboard_summary(date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_dashboard_summary(date) TO service_role;

