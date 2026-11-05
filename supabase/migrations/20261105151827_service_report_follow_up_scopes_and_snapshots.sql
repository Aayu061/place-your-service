-- Persist exactly which unresolved report items a follow-up schedule addresses.
CREATE TABLE IF NOT EXISTS public.service_report_follow_up_scopes (
  follow_up_schedule_id UUID NOT NULL REFERENCES public.service_schedules(id) ON DELETE RESTRICT,
  source_report_id UUID NOT NULL REFERENCES public.service_reports(id) ON DELETE RESTRICT,
  source_item_id UUID NOT NULL REFERENCES public.service_report_items(id) ON DELETE RESTRICT,
  asset_id UUID NOT NULL REFERENCES public.ac_assets(id) ON DELETE RESTRICT,
  created_by UUID REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (follow_up_schedule_id, source_item_id)
);

CREATE INDEX IF NOT EXISTS idx_report_follow_up_scopes_source
  ON public.service_report_follow_up_scopes(source_report_id, source_item_id);

CREATE INDEX IF NOT EXISTS idx_report_follow_up_scopes_asset
  ON public.service_report_follow_up_scopes(asset_id, follow_up_schedule_id);

ALTER TABLE public.service_report_follow_up_scopes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.service_report_follow_up_scopes FROM PUBLIC, anon, authenticated;
GRANT ALL PRIVILEGES ON public.service_report_follow_up_scopes TO service_role;

CREATE OR REPLACE FUNCTION public.validate_service_report_follow_up_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  source_row public.service_reports%ROWTYPE;
  item_row public.service_report_items%ROWTYPE;
  schedule_row public.service_schedules%ROWTYPE;
BEGIN
  SELECT * INTO source_row FROM public.service_reports WHERE id = NEW.source_report_id;
  SELECT * INTO item_row FROM public.service_report_items WHERE id = NEW.source_item_id;
  SELECT * INTO schedule_row FROM public.service_schedules WHERE id = NEW.follow_up_schedule_id;

  IF source_row.id IS NULL OR item_row.id IS NULL OR schedule_row.id IS NULL THEN
    RAISE EXCEPTION 'Follow-up scope references must exist'
      USING ERRCODE = '23503';
  END IF;
  IF item_row.report_id <> source_row.id OR item_row.asset_id IS DISTINCT FROM NEW.asset_id THEN
    RAISE EXCEPTION 'Follow-up item must belong to the source report and selected asset'
      USING ERRCODE = '23514', CONSTRAINT = 'service_report_follow_up_scope_item_asset';
  END IF;
  IF item_row.is_resolved OR NOT item_row.is_revisit_required THEN
    RAISE EXCEPTION 'Only unresolved items that require a revisit may be scheduled'
      USING ERRCODE = '23514', CONSTRAINT = 'service_report_follow_up_scope_pending_item';
  END IF;
  IF source_row.resolution_status NOT IN ('AWAITING_PARTS', 'AWAITING_REPAIR') THEN
    RAISE EXCEPTION 'Follow-up source report must have an unresolved parts or repair issue'
      USING ERRCODE = '23514', CONSTRAINT = 'service_report_follow_up_scope_source_pending';
  END IF;
  IF source_row.customer_id IS DISTINCT FROM schedule_row.customer_id
    OR source_row.site_id IS DISTINCT FROM schedule_row.site_id
    OR schedule_row.asset_id IS DISTINCT FROM NEW.asset_id THEN
    RAISE EXCEPTION 'Follow-up schedule must match the source customer, site, and asset'
      USING ERRCODE = '23514', CONSTRAINT = 'service_report_follow_up_scope_hierarchy';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_service_report_follow_up_scope
  BEFORE INSERT ON public.service_report_follow_up_scopes
  FOR EACH ROW EXECUTE FUNCTION public.validate_service_report_follow_up_scope();

CREATE OR REPLACE FUNCTION public.prevent_follow_up_scope_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'Follow-up scope records are append-only'
    USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER trg_follow_up_scope_immutable
  BEFORE UPDATE OR DELETE ON public.service_report_follow_up_scopes
  FOR EACH ROW EXECUTE FUNCTION public.prevent_follow_up_scope_mutation();

-- Create a follow-up appointment, its exact item scope, assignment, and parent
-- report link as one transaction.
CREATE OR REPLACE FUNCTION public.create_service_report_follow_up(
  p_source_report_id UUID,
  p_schedule JSONB,
  p_source_item_ids UUID[],
  p_actor_profile_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  source_row public.service_reports%ROWTYPE;
  existing_schedule_status TEXT;
  new_schedule public.service_schedules%ROWTYPE;
  selected_asset_id UUID;
  item_count INTEGER;
  has_active_link BOOLEAN := FALSE;
BEGIN
  SELECT * INTO source_row
    FROM public.service_reports
    WHERE id = p_source_report_id
    FOR UPDATE;
  IF source_row.id IS NULL OR source_row.resolution_status NOT IN ('AWAITING_PARTS', 'AWAITING_REPAIR') THEN
    RAISE EXCEPTION 'Follow-up requires an unresolved parts or repair report'
      USING ERRCODE = '23514', CONSTRAINT = 'service_report_follow_up_source_pending';
  END IF;

  selected_asset_id := (p_schedule->>'asset_id')::UUID;
  IF selected_asset_id IS NULL OR COALESCE(cardinality(p_source_item_ids), 0) = 0 THEN
    RAISE EXCEPTION 'Follow-up requires an asset and at least one unresolved source item'
      USING ERRCODE = '23514', CONSTRAINT = 'service_report_follow_up_scope_required';
  END IF;
  IF cardinality(p_source_item_ids) <> (SELECT COUNT(DISTINCT item_id) FROM unnest(p_source_item_ids) AS u(item_id)) THEN
    RAISE EXCEPTION 'Follow-up source item ids must be unique'
      USING ERRCODE = '23514', CONSTRAINT = 'service_report_follow_up_scope_unique_items';
  END IF;

  SELECT COUNT(*) INTO item_count
    FROM public.service_report_items AS i
    JOIN public.service_report_assets AS a
      ON a.report_id = i.report_id AND a.asset_id = i.asset_id
    WHERE i.report_id = source_row.id
      AND i.id = ANY(p_source_item_ids)
      AND i.asset_id = selected_asset_id
      AND i.is_revisit_required
      AND NOT i.is_resolved
      AND a.asset_outcome IN ('PENDING_PARTS', 'PENDING_REPAIRS');
  IF item_count <> cardinality(p_source_item_ids) THEN
    RAISE EXCEPTION 'Follow-up items must be unresolved revisit items for the selected pending asset'
      USING ERRCODE = '23514', CONSTRAINT = 'service_report_follow_up_scope_pending_item';
  END IF;

  IF (p_schedule->>'customer_id')::UUID IS DISTINCT FROM source_row.customer_id
    OR (p_schedule->>'site_id')::UUID IS DISTINCT FROM source_row.site_id THEN
    RAISE EXCEPTION 'Follow-up schedule must match the source report customer and site'
      USING ERRCODE = '23514', CONSTRAINT = 'service_report_follow_up_scope_hierarchy';
  END IF;

  IF source_row.follow_up_schedule_id IS NOT NULL THEN
    SELECT status INTO existing_schedule_status
      FROM public.service_schedules WHERE id = source_row.follow_up_schedule_id;
    has_active_link := existing_schedule_status IS NOT NULL AND existing_schedule_status <> 'CANCELLED';
  END IF;
  IF has_active_link THEN
    RAISE EXCEPTION 'A follow-up appointment is already active for this report'
      USING ERRCODE = '23505', CONSTRAINT = 'service_report_follow_up_active';
  END IF;

  INSERT INTO public.service_schedules (
    schedule_number, amc_id, service_request_id, pm_obligation_id,
    customer_id, site_id, asset_id, scheduled_date, start_time, end_time,
    duration_minutes, technician_id, rescheduled_from_id, planned_service_type,
    status, is_system_generated, notes, created_by, updated_by
  )
  SELECT
    s.schedule_number, s.amc_id, s.service_request_id, s.pm_obligation_id,
    s.customer_id, s.site_id, s.asset_id, s.scheduled_date, s.start_time, s.end_time,
    s.duration_minutes, s.technician_id, s.rescheduled_from_id, s.planned_service_type,
    s.status, s.is_system_generated, s.notes, s.created_by, s.updated_by
  FROM jsonb_populate_record(NULL::public.service_schedules, p_schedule) AS s
  RETURNING * INTO new_schedule;

  INSERT INTO public.service_report_follow_up_scopes (
    follow_up_schedule_id, source_report_id, source_item_id, asset_id, created_by
  )
  SELECT new_schedule.id, source_row.id, i.id, i.asset_id, p_actor_profile_id
    FROM public.service_report_items AS i
    WHERE i.id = ANY(p_source_item_ids)
      AND i.report_id = source_row.id;

  IF new_schedule.technician_id IS NOT NULL THEN
    INSERT INTO public.service_assignments (
      service_schedule_id, service_request_id, technician_id, assigned_by,
      assigned_at, scheduled_start_time, scheduled_end_time, status
    ) VALUES (
      new_schedule.id, new_schedule.service_request_id, new_schedule.technician_id,
      p_actor_profile_id, NOW(),
      (new_schedule.scheduled_date + new_schedule.start_time) AT TIME ZONE 'UTC',
      (new_schedule.scheduled_date + new_schedule.end_time) AT TIME ZONE 'UTC',
      'ASSIGNED'
    );
  END IF;

  UPDATE public.service_reports
    SET follow_up_schedule_id = new_schedule.id,
        updated_by = p_actor_profile_id,
        updated_at = NOW()
    WHERE id = source_row.id;

  IF source_row.service_request_id IS NOT NULL THEN
    UPDATE public.service_requests
      SET status = CASE WHEN new_schedule.technician_id IS NULL THEN 'SCHEDULED' ELSE 'ASSIGNED' END,
          notes = 'Follow-up revisit scheduled (' || new_schedule.schedule_number || ') from Report #' || source_row.report_number,
          updated_by = p_actor_profile_id,
          updated_at = NOW()
      WHERE id = source_row.service_request_id;
  END IF;

  INSERT INTO public.activity_logs (
    actor_profile_id, action, entity_type, entity_id, details
  ) VALUES (
    p_actor_profile_id,
    'SERVICE_REPORT_FOLLOWUP_CREATED',
    'service_report',
    source_row.id,
    jsonb_build_object(
      'scheduleId', new_schedule.id,
      'scheduleNumber', new_schedule.schedule_number,
      'assetId', selected_asset_id,
      'sourceItemIds', to_jsonb(p_source_item_ids),
      'scheduledDate', new_schedule.scheduled_date
    )
  );

  RETURN jsonb_build_object('id', new_schedule.id, 'schedule_number', new_schedule.schedule_number);
END;
$$;

REVOKE ALL ON FUNCTION public.create_service_report_follow_up(UUID, JSONB, UUID[], UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_service_report_follow_up(UUID, JSONB, UUID[], UUID)
  TO service_role;

-- Resolve only the exact source items linked to the completed follow-up. The
-- source report and item rows are locked so concurrent revisits cannot resolve
-- the same item twice or overwrite a newer resolution status.
CREATE OR REPLACE FUNCTION public.resolve_service_report_follow_up_scope(
  p_follow_up_schedule_id UUID,
  p_resolving_report_id UUID,
  p_actor_profile_id UUID
)
RETURNS TEXT
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  source_id UUID;
  source_row public.service_reports%ROWTYPE;
  resolving_row public.service_reports%ROWTYPE;
  scope_count INTEGER;
  pending_count INTEGER;
  has_pending_parts BOOLEAN;
  next_status TEXT;
BEGIN
  SELECT COUNT(*), (ARRAY_AGG(source_report_id ORDER BY source_report_id))[1]
    INTO scope_count, source_id
    FROM public.service_report_follow_up_scopes
    WHERE follow_up_schedule_id = p_follow_up_schedule_id;

  IF scope_count = 0 OR source_id IS NULL THEN
    RAISE EXCEPTION 'Follow-up schedule has no source item scope'
      USING ERRCODE = '23514', CONSTRAINT = 'service_report_follow_up_scope_required';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.service_report_follow_up_scopes
    WHERE follow_up_schedule_id = p_follow_up_schedule_id
      AND source_report_id <> source_id
  ) THEN
    RAISE EXCEPTION 'Follow-up schedule cannot resolve items from multiple source reports'
      USING ERRCODE = '23514', CONSTRAINT = 'service_report_follow_up_scope_single_source';
  END IF;

  SELECT * INTO resolving_row
    FROM public.service_reports
    WHERE id = p_resolving_report_id
    FOR UPDATE;
  IF resolving_row.id IS NULL OR resolving_row.service_schedule_id <> p_follow_up_schedule_id
    OR resolving_row.originating_report_id <> source_id
    OR resolving_row.primary_outcome <> 'COMPLETED' THEN
    RAISE EXCEPTION 'Resolving report must be a completed report for this follow-up schedule'
      USING ERRCODE = '23514', CONSTRAINT = 'service_report_follow_up_resolving_report';
  END IF;

  SELECT * INTO source_row
    FROM public.service_reports
    WHERE id = source_id
    FOR UPDATE;
  IF source_row.id IS NULL OR source_row.resolution_status NOT IN ('AWAITING_PARTS', 'AWAITING_REPAIR')
    OR source_row.customer_id <> resolving_row.customer_id
    OR source_row.site_id <> resolving_row.site_id THEN
    RAISE EXCEPTION 'Source report is not an unresolved issue for this customer and site'
      USING ERRCODE = '23514', CONSTRAINT = 'service_report_follow_up_source_pending';
  END IF;

  PERFORM i.id
    FROM public.service_report_items AS i
    JOIN public.service_report_follow_up_scopes AS s ON s.source_item_id = i.id
    WHERE s.follow_up_schedule_id = p_follow_up_schedule_id
      AND s.source_report_id = source_id
      AND i.report_id = source_id
    FOR UPDATE OF i;

  SELECT COUNT(*) INTO pending_count
    FROM public.service_report_follow_up_scopes AS s
    JOIN public.service_report_items AS i ON i.id = s.source_item_id
    WHERE s.follow_up_schedule_id = p_follow_up_schedule_id
      AND s.source_report_id = source_id
      AND i.report_id = source_id
      AND i.asset_id = s.asset_id
      AND i.is_revisit_required
      AND NOT i.is_resolved;

  IF pending_count <> scope_count THEN
    RAISE EXCEPTION 'One or more scoped issue items were already resolved or changed'
      USING ERRCODE = '23514', CONSTRAINT = 'service_report_follow_up_scope_pending_item';
  END IF;

  UPDATE public.service_report_items AS i
    SET is_resolved = TRUE, updated_at = NOW()
    FROM public.service_report_follow_up_scopes AS s
    WHERE s.follow_up_schedule_id = p_follow_up_schedule_id
      AND s.source_report_id = source_id
      AND i.id = s.source_item_id;

  SELECT COUNT(*), COALESCE(BOOL_OR(item_type = 'PART_REQUIRED'), FALSE)
    INTO pending_count, has_pending_parts
    FROM public.service_report_items
    WHERE report_id = source_id AND NOT is_resolved;

  IF pending_count = 0 THEN
    next_status := 'RESOLVED';
    UPDATE public.service_reports
      SET resolution_status = next_status,
          resolving_report_id = p_resolving_report_id,
          resolved_at = NOW(),
          updated_by = p_actor_profile_id,
          updated_at = NOW()
      WHERE id = source_id;
  ELSE
    next_status := CASE WHEN has_pending_parts THEN 'AWAITING_PARTS' ELSE 'AWAITING_REPAIR' END;
    UPDATE public.service_reports
      SET resolution_status = next_status,
          updated_by = p_actor_profile_id,
          updated_at = NOW()
      WHERE id = source_id;
  END IF;

  RETURN next_status;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_service_report_follow_up_scope(UUID, UUID, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_service_report_follow_up_scope(UUID, UUID, UUID)
  TO service_role;

-- Publish a staged report and perform all completion side effects together.
-- A report remains DRAFT while its equipment and issue snapshots are inserted;
-- this single transaction resolves only scoped items, completes work records,
-- and then seals the report as SUBMITTED.
CREATE OR REPLACE FUNCTION public.submit_service_report_completion(
  p_service_report_id UUID,
  p_actor_profile_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  report_row public.service_reports%ROWTYPE;
  schedule_row public.service_schedules%ROWTYPE;
  source_row public.service_reports%ROWTYPE;
  scope_count INTEGER := 0;
  source_count INTEGER := 0;
  asset_count INTEGER := 0;
  source_id UUID;
  scoped_asset_id UUID;
  pending_count INTEGER;
  has_pending_parts BOOLEAN;
  next_source_status TEXT;
BEGIN
  SELECT * INTO report_row
    FROM public.service_reports
    WHERE id = p_service_report_id
    FOR UPDATE;
  IF report_row.id IS NULL OR report_row.status <> 'DRAFT' THEN
    RAISE EXCEPTION 'Only a staged draft report can be submitted'
      USING ERRCODE = '23514', CONSTRAINT = 'service_report_submit_draft_only';
  END IF;
  IF report_row.start_time IS NOT NULL AND report_row.end_time IS NOT NULL
    AND report_row.end_time <= report_row.start_time THEN
    RAISE EXCEPTION 'Report end time must be later than its start time'
      USING ERRCODE = '23514', CONSTRAINT = 'service_report_time_range';
  END IF;
  IF report_row.primary_outcome = 'COMPLETED' AND EXISTS (
    SELECT 1 FROM public.service_report_assets
    WHERE report_id = report_row.id AND asset_outcome IN ('PENDING_PARTS', 'PENDING_REPAIRS')
  ) THEN
    RAISE EXCEPTION 'Completed visit cannot include an asset with pending work'
      USING ERRCODE = '23514', CONSTRAINT = 'service_report_completed_asset_outcome';
  END IF;

  SELECT * INTO schedule_row
    FROM public.service_schedules
    WHERE id = report_row.service_schedule_id
    FOR UPDATE;
  IF schedule_row.id IS NULL OR schedule_row.status IN ('CANCELLED', 'RESCHEDULED', 'SKIPPED')
    OR report_row.customer_id IS DISTINCT FROM schedule_row.customer_id
    OR report_row.site_id IS DISTINCT FROM schedule_row.site_id
    OR report_row.service_request_id IS DISTINCT FROM schedule_row.service_request_id
    OR report_row.amc_id IS DISTINCT FROM schedule_row.amc_id
    OR report_row.pm_obligation_id IS DISTINCT FROM schedule_row.pm_obligation_id THEN
    RAISE EXCEPTION 'Report no longer matches a reportable scheduled work item'
      USING ERRCODE = '23514', CONSTRAINT = 'service_report_schedule_reportable';
  END IF;

  SELECT COUNT(*), COUNT(DISTINCT source_report_id), COUNT(DISTINCT asset_id),
         (ARRAY_AGG(source_report_id ORDER BY source_report_id))[1],
         (ARRAY_AGG(asset_id ORDER BY asset_id))[1]
    INTO scope_count, source_count, asset_count, source_id, scoped_asset_id
    FROM public.service_report_follow_up_scopes
    WHERE follow_up_schedule_id = schedule_row.id;

  IF scope_count = 0 THEN
    IF report_row.originating_report_id IS NOT NULL THEN
      RAISE EXCEPTION 'Originating report is not supported without a linked follow-up scope'
        USING ERRCODE = '23514', CONSTRAINT = 'service_report_follow_up_scope_required';
    END IF;
  ELSE
    IF source_count <> 1 OR asset_count <> 1
      OR report_row.originating_report_id IS DISTINCT FROM source_id
      OR schedule_row.asset_id IS DISTINCT FROM scoped_asset_id
      OR (SELECT COUNT(*) FROM public.service_report_assets
          WHERE report_id = report_row.id AND asset_id = scoped_asset_id) <> 1
      OR (SELECT COUNT(*) FROM public.service_report_assets WHERE report_id = report_row.id) <> 1 THEN
      RAISE EXCEPTION 'Follow-up report assets and source relationship must match the scoped schedule'
        USING ERRCODE = '23514', CONSTRAINT = 'service_report_follow_up_scope_hierarchy';
    END IF;

    SELECT * INTO source_row
      FROM public.service_reports
      WHERE id = source_id
      FOR UPDATE;
    IF source_row.id IS NULL
      OR source_row.resolution_status NOT IN ('AWAITING_PARTS', 'AWAITING_REPAIR')
      OR source_row.customer_id IS DISTINCT FROM report_row.customer_id
      OR source_row.site_id IS DISTINCT FROM report_row.site_id THEN
      RAISE EXCEPTION 'Follow-up source report must still have an unresolved issue'
        USING ERRCODE = '23514', CONSTRAINT = 'service_report_follow_up_source_pending';
    END IF;

    IF report_row.primary_outcome = 'COMPLETED' THEN
      PERFORM i.id
        FROM public.service_report_items AS i
        JOIN public.service_report_follow_up_scopes AS s ON s.source_item_id = i.id
        WHERE s.follow_up_schedule_id = schedule_row.id
          AND s.source_report_id = source_id
          AND s.asset_id = scoped_asset_id
          AND i.report_id = source_id
          AND i.asset_id = scoped_asset_id
          AND i.is_revisit_required
          AND NOT i.is_resolved
        FOR UPDATE OF i;

      SELECT COUNT(*) INTO pending_count
        FROM public.service_report_follow_up_scopes AS s
        JOIN public.service_report_items AS i ON i.id = s.source_item_id
        WHERE s.follow_up_schedule_id = schedule_row.id
          AND s.source_report_id = source_id
          AND s.asset_id = scoped_asset_id
          AND i.report_id = source_id
          AND i.asset_id = scoped_asset_id
          AND i.is_revisit_required
          AND NOT i.is_resolved;
      IF pending_count <> scope_count THEN
        RAISE EXCEPTION 'One or more linked source items were already resolved or changed'
          USING ERRCODE = '23514', CONSTRAINT = 'service_report_follow_up_scope_pending_item';
      END IF;

      UPDATE public.service_report_items AS i
        SET is_resolved = TRUE, updated_at = NOW()
        FROM public.service_report_follow_up_scopes AS s
        WHERE s.follow_up_schedule_id = schedule_row.id
          AND s.source_report_id = source_id
          AND i.id = s.source_item_id;

      SELECT COUNT(*), COALESCE(BOOL_OR(item_type = 'PART_REQUIRED'), FALSE)
        INTO pending_count, has_pending_parts
        FROM public.service_report_items
        WHERE report_id = source_id AND NOT is_resolved;
      IF pending_count = 0 THEN
        next_source_status := 'RESOLVED';
      ELSE
        next_source_status := CASE WHEN has_pending_parts THEN 'AWAITING_PARTS' ELSE 'AWAITING_REPAIR' END;
      END IF;
      UPDATE public.service_reports
        SET resolution_status = next_source_status,
            resolving_report_id = CASE WHEN pending_count = 0 THEN report_row.id ELSE NULL END,
            resolved_at = CASE WHEN pending_count = 0 THEN NOW() ELSE NULL END,
            updated_by = p_actor_profile_id,
            updated_at = NOW()
        WHERE id = source_id;
    END IF;
  END IF;

  UPDATE public.service_schedules
    SET status = 'COMPLETED',
        notes = 'Visit Report #' || report_row.report_number || ' filed (' || report_row.primary_outcome || ')',
        updated_by = p_actor_profile_id,
        updated_at = NOW()
    WHERE id = schedule_row.id;
  UPDATE public.service_assignments
    SET status = 'COMPLETED', updated_at = NOW()
    WHERE service_schedule_id = schedule_row.id
      AND status IN ('ASSIGNED', 'ACKNOWLEDGED', 'IN_PROGRESS');

  IF schedule_row.pm_obligation_id IS NOT NULL
    AND schedule_row.pm_obligation_id <> schedule_row.id
    AND report_row.primary_outcome = 'COMPLETED' THEN
    UPDATE public.service_schedules
      SET status = 'COMPLETED',
          notes = 'Completed by Visit Report #' || report_row.report_number,
          updated_by = p_actor_profile_id,
          updated_at = NOW()
      WHERE id = schedule_row.pm_obligation_id;
    UPDATE public.service_assignments
      SET status = 'COMPLETED', updated_at = NOW()
      WHERE service_schedule_id = schedule_row.pm_obligation_id
        AND status IN ('ASSIGNED', 'ACKNOWLEDGED', 'IN_PROGRESS');
  END IF;

  IF schedule_row.service_request_id IS NOT NULL THEN
    UPDATE public.service_requests
      SET status = CASE
            WHEN report_row.primary_outcome = 'PENDING_PARTS' THEN 'AWAITING_PARTS'
            WHEN report_row.primary_outcome = 'PENDING_REPAIRS' THEN 'REVISIT_REQUIRED'
            ELSE 'RESOLVED'
          END,
          notes = 'Updated by Report #' || report_row.report_number || ' (' || report_row.primary_outcome || ')',
          updated_by = p_actor_profile_id,
          updated_at = NOW()
      WHERE id = schedule_row.service_request_id;
  END IF;

  UPDATE public.service_reports
    SET status = 'SUBMITTED', updated_by = p_actor_profile_id, updated_at = NOW()
    WHERE id = report_row.id;

  INSERT INTO public.activity_logs (
    actor_profile_id, action, entity_type, entity_id, details
  ) VALUES (
    p_actor_profile_id,
    'SERVICE_REPORT_CREATED',
    'service_report',
    report_row.id,
    jsonb_build_object(
      'reportNumber', report_row.report_number,
      'scheduleId', schedule_row.id,
      'scheduleNumber', schedule_row.schedule_number,
      'primaryOutcome', report_row.primary_outcome,
      'assetCount', (SELECT COUNT(*) FROM public.service_report_assets WHERE report_id = report_row.id),
      'itemCount', (SELECT COUNT(*) FROM public.service_report_items WHERE report_id = report_row.id)
    )
  );

  RETURN report_row.id;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_service_report_completion(UUID, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_service_report_completion(UUID, UUID)
  TO service_role;

-- Preserve immutable issued equipment snapshots and allow only a one-way
-- resolution marker on issue items after submission.
CREATE OR REPLACE FUNCTION public.guard_issued_report_asset_snapshot()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  report_status TEXT;
BEGIN
  SELECT status INTO report_status
    FROM public.service_reports
    WHERE id = CASE WHEN TG_OP = 'DELETE' THEN OLD.report_id ELSE NEW.report_id END;
  IF TG_OP = 'INSERT' THEN
    IF report_status IN ('SUBMITTED', 'VERIFIED') THEN
      RAISE EXCEPTION 'Issued service report asset snapshots cannot be appended'
        USING ERRCODE = '55000';
    END IF;
    RETURN NEW;
  END IF;
  IF report_status IN ('SUBMITTED', 'VERIFIED') THEN
    RAISE EXCEPTION 'Issued service report asset snapshots are immutable'
      USING ERRCODE = '55000';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_immutable_issued_report_asset_snapshot
  BEFORE INSERT OR UPDATE OR DELETE ON public.service_report_assets
  FOR EACH ROW EXECUTE FUNCTION public.guard_issued_report_asset_snapshot();

CREATE OR REPLACE FUNCTION public.guard_issued_report_item_snapshot()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  report_status TEXT;
BEGIN
  SELECT status INTO report_status
    FROM public.service_reports
    WHERE id = CASE WHEN TG_OP = 'DELETE' THEN OLD.report_id ELSE NEW.report_id END;
  IF TG_OP = 'INSERT' THEN
    IF report_status IN ('SUBMITTED', 'VERIFIED') THEN
      RAISE EXCEPTION 'Issued service report issue snapshots cannot be appended'
        USING ERRCODE = '55000';
    END IF;
    RETURN NEW;
  END IF;
  IF report_status IN ('SUBMITTED', 'VERIFIED') THEN
    IF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION 'Issued service report issue snapshots cannot be deleted'
        USING ERRCODE = '55000';
    END IF;
    IF (to_jsonb(NEW) - 'is_resolved' - 'updated_at') <> (to_jsonb(OLD) - 'is_resolved' - 'updated_at')
      OR (OLD.is_resolved AND NOT NEW.is_resolved) THEN
      RAISE EXCEPTION 'Issued service report issue details are immutable; only unresolved-to-resolved is allowed'
        USING ERRCODE = '55000';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_immutable_issued_report_item_snapshot
  BEFORE INSERT OR UPDATE OR DELETE ON public.service_report_items
  FOR EACH ROW EXECUTE FUNCTION public.guard_issued_report_item_snapshot();

-- Keep an append-only revision trail for editable report-header corrections
-- and workflow state transitions.
ALTER TABLE public.service_reports
  ADD COLUMN IF NOT EXISTS last_correction_reason TEXT;

CREATE TABLE IF NOT EXISTS public.service_report_header_history (
  report_id UUID NOT NULL REFERENCES public.service_reports(id) ON DELETE RESTRICT,
  revision INTEGER NOT NULL CHECK (revision > 0),
  actor_profile_id UUID REFERENCES public.profiles(id) ON DELETE RESTRICT,
  reason TEXT NOT NULL,
  previous_values JSONB NOT NULL,
  new_values JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (report_id, revision)
);

ALTER TABLE public.service_report_header_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.service_report_header_history FROM PUBLIC, anon, authenticated;
GRANT ALL PRIVILEGES ON public.service_report_header_history TO service_role;

CREATE OR REPLACE FUNCTION public.record_service_report_header_history()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  next_revision INTEGER;
  change_reason TEXT;
BEGIN
  IF to_jsonb(NEW) = to_jsonb(OLD) THEN
    RETURN NEW;
  END IF;
  SELECT COALESCE(MAX(revision), 0) + 1 INTO next_revision
    FROM public.service_report_header_history WHERE report_id = OLD.id;
  change_reason := NULLIF(current_setting('app.service_report_correction_reason', TRUE), '');
  IF change_reason IS NULL AND NEW.last_correction_reason IS DISTINCT FROM OLD.last_correction_reason THEN
    change_reason := NULLIF(BTRIM(NEW.last_correction_reason), '');
  END IF;
  INSERT INTO public.service_report_header_history (
    report_id, revision, actor_profile_id, reason, previous_values, new_values
  ) VALUES (
    OLD.id, next_revision, NEW.updated_by,
    COALESCE(change_reason, 'Report workflow or header update'), to_jsonb(OLD), to_jsonb(NEW)
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_service_report_header_history
  AFTER UPDATE ON public.service_reports
  FOR EACH ROW EXECUTE FUNCTION public.record_service_report_header_history();

CREATE OR REPLACE FUNCTION public.prevent_report_history_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'Service report header history is append-only'
    USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER trg_service_report_header_history_immutable
  BEFORE UPDATE OR DELETE ON public.service_report_header_history
  FOR EACH ROW EXECUTE FUNCTION public.prevent_report_history_mutation();

-- Activity records are server-created and append-only. Retain the actor
-- reference so deleting a profile cannot rewrite old audit history.
ALTER TABLE public.activity_logs
  DROP CONSTRAINT IF EXISTS activity_logs_actor_profile_id_fkey;
ALTER TABLE public.activity_logs
  ADD CONSTRAINT activity_logs_actor_profile_id_fkey
  FOREIGN KEY (actor_profile_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;

CREATE OR REPLACE FUNCTION public.prevent_activity_log_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'Activity log records are append-only'
    USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER trg_activity_logs_append_only
  BEFORE UPDATE OR DELETE ON public.activity_logs
  FOR EACH ROW EXECUTE FUNCTION public.prevent_activity_log_mutation();

-- Enforce schedule/report and asset/site/customer consistency at the data boundary.
CREATE OR REPLACE FUNCTION public.validate_service_report_schedule_context()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  schedule_row public.service_schedules%ROWTYPE;
BEGIN
  SELECT * INTO schedule_row FROM public.service_schedules WHERE id = NEW.service_schedule_id;
  IF schedule_row.id IS NULL THEN
    RAISE EXCEPTION 'Service report requires an existing scheduled work item'
      USING ERRCODE = '23503';
  END IF;
  IF schedule_row.status IN ('CANCELLED', 'RESCHEDULED', 'SKIPPED') THEN
    RAISE EXCEPTION 'Cannot issue a service report for a closed or superseded schedule'
      USING ERRCODE = '23514', CONSTRAINT = 'service_report_schedule_reportable';
  END IF;
  IF NEW.customer_id IS DISTINCT FROM schedule_row.customer_id
    OR NEW.site_id IS DISTINCT FROM schedule_row.site_id
    OR NEW.service_request_id IS DISTINCT FROM schedule_row.service_request_id
    OR NEW.amc_id IS DISTINCT FROM schedule_row.amc_id
    OR NEW.pm_obligation_id IS DISTINCT FROM schedule_row.pm_obligation_id THEN
    RAISE EXCEPTION 'Service report context must match its scheduled work'
      USING ERRCODE = '23514', CONSTRAINT = 'service_report_schedule_context';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_service_report_schedule_context
  BEFORE INSERT OR UPDATE OF service_schedule_id, customer_id, site_id, service_request_id, amc_id, pm_obligation_id
  ON public.service_reports
  FOR EACH ROW EXECUTE FUNCTION public.validate_service_report_schedule_context();

CREATE OR REPLACE FUNCTION public.validate_service_report_asset_hierarchy()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  report_row public.service_reports%ROWTYPE;
  schedule_asset_id UUID;
  asset_site_id UUID;
  asset_customer_id UUID;
BEGIN
  SELECT * INTO report_row FROM public.service_reports AS r WHERE r.id = NEW.report_id;
  SELECT asset_id INTO schedule_asset_id FROM public.service_schedules WHERE id = report_row.service_schedule_id;
  SELECT a.site_id, cs.customer_id INTO asset_site_id, asset_customer_id
  FROM public.ac_assets AS a
  JOIN public.customer_sites AS cs ON cs.id = a.site_id
  WHERE a.id = NEW.asset_id;
  IF asset_site_id IS NULL OR asset_customer_id IS NULL THEN
    RAISE EXCEPTION 'Report asset must have a valid site and customer'
      USING ERRCODE = '23503';
  END IF;
  IF asset_site_id IS DISTINCT FROM report_row.site_id
    OR asset_customer_id IS DISTINCT FROM report_row.customer_id THEN
    RAISE EXCEPTION 'Report assets must match the report site and customer'
      USING ERRCODE = '23514', CONSTRAINT = 'service_report_asset_hierarchy';
  END IF;
  IF schedule_asset_id IS NOT NULL AND NEW.asset_id IS DISTINCT FROM schedule_asset_id THEN
    RAISE EXCEPTION 'Report asset must match the asset scheduled for this work'
      USING ERRCODE = '23514', CONSTRAINT = 'service_report_asset_schedule';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_service_report_asset_hierarchy
  BEFORE INSERT OR UPDATE OF report_id, asset_id ON public.service_report_assets
  FOR EACH ROW EXECUTE FUNCTION public.validate_service_report_asset_hierarchy();

CREATE OR REPLACE FUNCTION public.validate_service_report_item_asset()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  report_site_id UUID;
  item_site_id UUID;
BEGIN
  IF NEW.asset_id IS NULL THEN
    IF NEW.is_revisit_required THEN
      RAISE EXCEPTION 'Follow-up issue items must be linked to an asset'
        USING ERRCODE = '23514', CONSTRAINT = 'service_report_item_follow_up_asset_required';
    END IF;
    RETURN NEW;
  END IF;
  SELECT site_id INTO report_site_id FROM public.service_reports WHERE id = NEW.report_id;
  SELECT site_id INTO item_site_id FROM public.ac_assets WHERE id = NEW.asset_id;
  IF report_site_id IS DISTINCT FROM item_site_id THEN
    RAISE EXCEPTION 'Report issue items must reference an asset at the report site'
      USING ERRCODE = '23514', CONSTRAINT = 'service_report_item_asset_site';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_service_report_item_asset
  BEFORE INSERT OR UPDATE OF report_id, asset_id, is_revisit_required
  ON public.service_report_items
  FOR EACH ROW EXECUTE FUNCTION public.validate_service_report_item_asset();
