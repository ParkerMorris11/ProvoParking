-- Map: lot shapes for parking_area, plus where each shape came from.
-- Additive only and safe to run twice. Existing rows keep working (new columns are NULL).
BEGIN;
ALTER TABLE public.parking_area ADD COLUMN IF NOT EXISTS boundary jsonb;          -- GeoJSON Polygon or MultiPolygon, [lng, lat]
ALTER TABLE public.parking_area ADD COLUMN IF NOT EXISTS source_ref varchar(60);  -- e.g. 'byu-arcgis:30G:1' so re-imports update instead of duplicating
ALTER TABLE public.parking_area ADD COLUMN IF NOT EXISTS source_url text;
ALTER TABLE public.parking_area ADD COLUMN IF NOT EXISTS last_verified_on date;
-- BYU's layer has no stall counts. NULL means "unknown" instead of a made-up number.
ALTER TABLE public.parking_area ALTER COLUMN total_spaces DROP NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS parking_area_source_ref_key ON public.parking_area (source_ref);
COMMIT;
