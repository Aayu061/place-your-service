-- ============================================================================
-- Migration: 20261010040000_service_report_assets_snapshot_integrity.sql
-- Description: Adds immutable snapshot columns to service_report_assets to
--              preserve historical equipment identification and specifications
--              at time of service without depending on future live asset edits.
-- ============================================================================

-- 1. Add nullable snapshot columns to service_report_assets
ALTER TABLE public.service_report_assets
  ADD COLUMN IF NOT EXISTS asset_tag text,
  ADD COLUMN IF NOT EXISTS brand text,
  ADD COLUMN IF NOT EXISTS model_number text,
  ADD COLUMN IF NOT EXISTS indoor_serial_number text,
  ADD COLUMN IF NOT EXISTS outdoor_serial_number text,
  ADD COLUMN IF NOT EXISTS serial_number text,
  ADD COLUMN IF NOT EXISTS ac_type text,
  ADD COLUMN IF NOT EXISTS technology text,
  ADD COLUMN IF NOT EXISTS capacity_tons numeric,
  ADD COLUMN IF NOT EXISTS star_rating text,
  ADD COLUMN IF NOT EXISTS refrigerant_type text,
  ADD COLUMN IF NOT EXISTS floor_location text,
  ADD COLUMN IF NOT EXISTS room_location text;

-- 2. Idempotent historical backfill of existing report asset records from ac_assets
UPDATE public.service_report_assets sra
SET 
  asset_tag = a.asset_tag,
  brand = a.brand,
  model_number = a.model_number,
  indoor_serial_number = a.indoor_serial_number,
  outdoor_serial_number = a.outdoor_serial_number,
  serial_number = a.serial_number,
  ac_type = a.ac_type,
  technology = a.technology,
  capacity_tons = a.capacity_tons,
  star_rating = a.star_rating,
  refrigerant_type = a.refrigerant_type,
  floor_location = a.floor_location,
  room_location = COALESCE(sra.room_location, a.room_location)
FROM public.ac_assets a
WHERE sra.asset_id = a.id
  AND sra.asset_tag IS NULL;
