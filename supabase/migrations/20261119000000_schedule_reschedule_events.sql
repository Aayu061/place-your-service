-- Reschedule events: tell the customer when their visit moves to a new date or time window.
--
-- record_service_schedule_status() used to queue SERVICE_SCHEDULE_STATUS_CHANGED only when the
-- visit's status or technician changed, so moving a visit to another day was silent. It now also
-- queues an event when scheduled_date / start_time / end_time change, and the payload says
-- dateChanged = true with the new date and window (ids, dates and times only, no personal data).
--
-- A visit can be moved two ways:
--   1. in place: the same row gets a new date (schedule.service.ts reschedule())
--   2. replaced: a new row is inserted with rescheduled_from_id -> old row, and the old row is
--      marked RESCHEDULED (or CANCELLED). Either order is covered: the INSERT checks whether the
--      old row is already RESCHEDULED/CANCELLED, and the status change on the old row looks for
--      its replacement. Follow-up revisits after a COMPLETED visit also use rescheduled_from_id;
--      those are new visits, not a moved date, so they do not count as dateChanged.
--
-- Status history rows are still written only for status/technician changes. Date-only changes
-- queue an event keyed by row + transaction + new date/window, so a repeated identical write in
-- one transaction never queues twice. The customer email itself is de-duplicated per new date by
-- the notifier ('sr-visit-date:<request>:<schedule>:<date>:<window>').
-- Safe to re-run: CREATE OR REPLACE + DROP TRIGGER IF EXISTS.

CREATE OR REPLACE FUNCTION public.record_service_schedule_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_hist_id         uuid;
  v_status_changed  boolean;
  v_tech_changed    boolean;
  v_date_changed    boolean := false;
  v_prev_date       date;
  v_prev_start      text;
  v_prev_end        text;
  v_visit_id        uuid := NEW.id;
  v_visit_date      date := NEW.scheduled_date;
  v_visit_start     text := NEW.start_time;
  v_visit_end       text := NEW.end_time;
  v_src             public.service_schedules%ROWTYPE;
  v_repl            public.service_schedules%ROWTYPE;
  v_key             text;
BEGIN
  IF NEW.service_request_id IS NULL THEN
    RETURN NEW;   -- AMC preventive visits without a request: nothing to tell the customer here
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_status_changed := true;
    v_tech_changed   := true;
    -- A replacement row for a visit that was moved (not a follow-up after a finished visit).
    IF NEW.rescheduled_from_id IS NOT NULL THEN
      SELECT * INTO v_src FROM public.service_schedules WHERE id = NEW.rescheduled_from_id;
      IF FOUND AND v_src.status IN ('RESCHEDULED', 'CANCELLED') THEN
        v_prev_date  := v_src.scheduled_date;
        v_prev_start := v_src.start_time;
        v_prev_end   := v_src.end_time;
        v_date_changed := (v_prev_date, v_prev_start, v_prev_end)
                          IS DISTINCT FROM (NEW.scheduled_date, NEW.start_time, NEW.end_time);
      END IF;
    END IF;
  ELSE
    v_status_changed := NEW.status IS DISTINCT FROM OLD.status;
    v_tech_changed   := NEW.technician_id IS DISTINCT FROM OLD.technician_id;
    v_prev_date  := OLD.scheduled_date;
    v_prev_start := OLD.start_time;
    v_prev_end   := OLD.end_time;
    v_date_changed := (OLD.scheduled_date, OLD.start_time, OLD.end_time)
                      IS DISTINCT FROM (NEW.scheduled_date, NEW.start_time, NEW.end_time);

    -- Old row just marked RESCHEDULED and a replacement already exists: report the replacement.
    IF v_status_changed AND NEW.status = 'RESCHEDULED' AND NOT v_date_changed THEN
      SELECT * INTO v_repl FROM public.service_schedules
       WHERE rescheduled_from_id = NEW.id AND id <> NEW.id
       ORDER BY created_at DESC LIMIT 1;
      IF FOUND THEN
        v_visit_id    := v_repl.id;
        v_visit_date  := v_repl.scheduled_date;
        v_visit_start := v_repl.start_time;
        v_visit_end   := v_repl.end_time;
        v_date_changed := (NEW.scheduled_date, NEW.start_time, NEW.end_time)
                          IS DISTINCT FROM (v_repl.scheduled_date, v_repl.start_time, v_repl.end_time);
      END IF;
    END IF;

    IF NOT v_status_changed AND NOT v_tech_changed AND NOT v_date_changed THEN
      RETURN NEW;
    END IF;
  END IF;

  IF v_status_changed OR v_tech_changed THEN
    INSERT INTO public.service_request_status_history
      (service_request_id, schedule_id, entity, from_status, to_status)
    VALUES (NEW.service_request_id, NEW.id, 'SCHEDULE',
            CASE WHEN TG_OP = 'UPDATE' THEN OLD.status END, NEW.status)
    RETURNING id INTO v_hist_id;
    v_key := 'sch-status-change:' || v_hist_id;
  ELSE
    v_key := 'sch-date-change:' || NEW.id || ':' || txid_current() || ':' || NEW.scheduled_date
             || ':' || COALESCE(NEW.start_time, '') || ':' || COALESCE(NEW.end_time, '');
  END IF;

  INSERT INTO public.outbound_events (event_type, aggregate_type, aggregate_id, payload, idempotency_key)
  VALUES ('SERVICE_SCHEDULE_STATUS_CHANGED', 'SERVICE_REQUEST', NEW.service_request_id,
          jsonb_build_object('serviceRequestId', NEW.service_request_id, 'scheduleId', NEW.id,
                             'historyId', v_hist_id,
                             'fromStatus', CASE WHEN TG_OP = 'UPDATE' THEN OLD.status END,
                             'toStatus', NEW.status,
                             'technicianChanged', v_tech_changed,
                             'dateChanged', v_date_changed,
                             'visitScheduleId', v_visit_id,
                             'scheduledDate', v_visit_date,
                             'startTime', v_visit_start,
                             'endTime', v_visit_end,
                             'previousScheduledDate', CASE WHEN v_date_changed THEN v_prev_date END,
                             'previousStartTime', CASE WHEN v_date_changed THEN v_prev_start END,
                             'previousEndTime', CASE WHEN v_date_changed THEN v_prev_end END,
                             'rescheduledFromId', NEW.rescheduled_from_id),
          v_key)
  ON CONFLICT (idempotency_key) DO NOTHING;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_service_schedules_status_history ON public.service_schedules;
CREATE TRIGGER trg_service_schedules_status_history
  AFTER INSERT OR UPDATE OF status, technician_id, scheduled_date, start_time, end_time ON public.service_schedules
  FOR EACH ROW EXECUTE FUNCTION public.record_service_schedule_status();

REVOKE ALL ON FUNCTION public.record_service_schedule_status() FROM PUBLIC, anon, authenticated;
