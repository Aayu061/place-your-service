-- Keep contract entitlements aligned with deterministic cadence dates. The
-- application creates one obligation for each asset and cadence slot.

CREATE OR REPLACE FUNCTION public.amc_cadence_slot_count(
  p_start_date DATE,
  p_end_date DATE,
  p_frequency TEXT
)
RETURNS INTEGER
LANGUAGE SQL
IMMUTABLE
STRICT
PARALLEL SAFE
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT COUNT(*)::INTEGER
  FROM generate_series(
    p_start_date::TIMESTAMP WITHOUT TIME ZONE,
    p_end_date::TIMESTAMP WITHOUT TIME ZONE,
    make_interval(months => CASE p_frequency
      WHEN 'MONTHLY' THEN 1
      WHEN 'QUARTERLY' THEN 3
      WHEN 'HALF_YEARLY' THEN 6
      WHEN 'YEARLY' THEN 12
      ELSE 0
    END)
  ) AS cadence_date
$$;

CREATE OR REPLACE FUNCTION public.enforce_amc_cadence_allocation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  cadence_slots INTEGER;
  allocated_visits INTEGER;
BEGIN
  IF NEW.end_date < NEW.start_date THEN
    RAISE EXCEPTION 'AMC end date cannot precede start date'
      USING ERRCODE = '23514', CONSTRAINT = 'amc_contract_dates_ordered';
  END IF;

  cadence_slots := public.amc_cadence_slot_count(
    NEW.start_date,
    NEW.end_date,
    NEW.frequency
  );
  allocated_visits := COALESCE(NEW.dry_service_visits, 0)
    + COALESCE(NEW.jet_service_visits, 0)
    + COALESCE(NEW.pumpdown_service_visits, 0);

  IF NEW.total_visits <> cadence_slots THEN
    RAISE EXCEPTION 'Included visits (%) must match cadence dates (%)',
      NEW.total_visits, cadence_slots
      USING ERRCODE = '23514', CONSTRAINT = 'amc_total_visits_match_cadence';
  END IF;

  IF allocated_visits <> cadence_slots THEN
    RAISE EXCEPTION 'Service allocation (%) must match cadence dates (%)',
      allocated_visits, cadence_slots
      USING ERRCODE = '23514', CONSTRAINT = 'amc_allocation_matches_cadence';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_amc_cadence_allocation_invariant ON public.amc_contracts;
CREATE TRIGGER trg_amc_cadence_allocation_invariant
  BEFORE INSERT OR UPDATE OF start_date, end_date, frequency, total_visits,
    dry_service_visits, jet_service_visits, pumpdown_service_visits
  ON public.amc_contracts
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_amc_cadence_allocation();

COMMENT ON FUNCTION public.amc_cadence_slot_count(DATE, DATE, TEXT) IS
  'Returns inclusive cadence slots using the same UTC date stepping used by the API.';
