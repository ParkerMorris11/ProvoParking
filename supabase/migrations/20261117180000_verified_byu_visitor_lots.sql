-- BYU visitor sections 2V and 26V, verified 2026-11-17.
-- Official sources:
--   https://map.byu.edu/?layer=parking
--   https://services.arcgis.com/FvF9MZKp3JWPrSkg/arcgis/rest/services/Campus_Parking_Lots/FeatureServer/0
--   https://security.byu.edu/parking-regulations (released July 23, 2026, SHA-256 bd30b8791168f1d94bf01277eec5255f7bc514b1707bdb28b88a6cbb116dfff6)
--   https://security.byu.edu/parking-in-a-nutshell
-- Live GIS attributes and geometry for object IDs 15 (2V) and 88 (26V) matched the checked-in campus parking snapshot.
-- These two lots are free visitor parking during the weekday hours on the map. Students and employees may not use visitor parking. Overnight parking is prohibited 01:00-05:00. This migration does not invent after-hours, weekend, payment, validation, or stay-limit rules, and it never deletes or replaces rows for any other area.

DO $$
BEGIN
  IF (SELECT count(*) FROM public.permit WHERE permit_code = 'V') <> 1 THEN
    RAISE EXCEPTION 'Required V visitor permit missing';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.parking_area
    WHERE operator = 'BYU'
      AND lot_code IN ('2V', '26V')
      AND source_feature_global_id IS DISTINCT FROM CASE lot_code
        WHEN '2V' THEN '7f6b3fc5-7fd8-493d-b35a-8fc27b385698'::uuid
        WHEN '26V' THEN 'a71c40c0-b1f3-4003-9ac6-ea3dbf822e0a'::uuid
      END
  ) THEN
    RAISE EXCEPTION 'Existing visitor lot codes require review';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.parking_area
    WHERE source_feature_id IN (15, 88)
      AND source_feature_global_id IS DISTINCT FROM CASE source_feature_id
        WHEN 15 THEN '7f6b3fc5-7fd8-493d-b35a-8fc27b385698'::uuid
        WHEN 88 THEN 'a71c40c0-b1f3-4003-9ac6-ea3dbf822e0a'::uuid
      END
  ) THEN
    RAISE EXCEPTION 'Existing visitor feature identity mismatch';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.parking_area
    WHERE source_feature_global_id IN (
        '7f6b3fc5-7fd8-493d-b35a-8fc27b385698'::uuid,
        'a71c40c0-b1f3-4003-9ac6-ea3dbf822e0a'::uuid
      )
      AND (
        lot_code IS DISTINCT FROM CASE source_feature_global_id
          WHEN '7f6b3fc5-7fd8-493d-b35a-8fc27b385698'::uuid THEN '2V'
          WHEN 'a71c40c0-b1f3-4003-9ac6-ea3dbf822e0a'::uuid THEN '26V'
        END
        OR source_feature_id IS DISTINCT FROM CASE source_feature_global_id
          WHEN '7f6b3fc5-7fd8-493d-b35a-8fc27b385698'::uuid THEN 15
          WHEN 'a71c40c0-b1f3-4003-9ac6-ea3dbf822e0a'::uuid THEN 88
        END
        OR operator IS DISTINCT FROM 'BYU'
      )
  ) THEN
    RAISE EXCEPTION 'Existing visitor feature identity mismatch';
  END IF;
END $$;

INSERT INTO public.parking_area (
  area_name, lot_code, operator, latitude, longitude,
  total_spaces, est_available_spaces, availability_updated_at,
  is_free, tow_company_id, is_sample_data, source_feature_id, source_feature_global_id
)
VALUES
  (
    'BYU Lot 2V (section 15)', '2V', 'BYU', 40.251904, -111.647447,
    NULL, NULL, NULL, true, NULL, false, 15, '7f6b3fc5-7fd8-493d-b35a-8fc27b385698'
  ),
  (
    'BYU Lot 26V (section 88)', '26V', 'BYU', 40.248169, -111.644898,
    NULL, NULL, NULL, true, NULL, false, 88, 'a71c40c0-b1f3-4003-9ac6-ea3dbf822e0a'
  )
ON CONFLICT (source_feature_global_id) DO UPDATE SET
  area_name = EXCLUDED.area_name,
  lot_code = EXCLUDED.lot_code,
  operator = EXCLUDED.operator,
  latitude = EXCLUDED.latitude,
  longitude = EXCLUDED.longitude,
  total_spaces = NULL,
  est_available_spaces = NULL,
  availability_updated_at = NULL,
  is_free = EXCLUDED.is_free,
  tow_company_id = NULL,
  is_sample_data = false
WHERE public.parking_area.lot_code IN ('2V', '26V')
  AND public.parking_area.operator = 'BYU';

DELETE FROM public.parking_rule r
USING public.parking_area a
WHERE r.area_id = a.area_id
  AND a.source_feature_global_id IN (
    '7f6b3fc5-7fd8-493d-b35a-8fc27b385698'::uuid,
    'a71c40c0-b1f3-4003-9ac6-ea3dbf822e0a'::uuid
  );

INSERT INTO public.parking_rule (
  area_id, permit_id, days_of_week, start_time, end_time,
  blocked_start, blocked_end, vehicle_type, source_url, last_verified_on, rule_note
)
SELECT
  a.area_id, NULL, 'All', '01:00'::time, '04:59'::time,
  '01:00'::time, '05:00'::time, 'car',
  'https://security.byu.edu/parking-regulations', DATE '2026-11-17',
  'Overnight parking prohibited 01:00–05:00. Ordinary non-housing visitor lot; BYU-owned vehicles and arranged exceptions are outside this app check.'
FROM public.parking_area a
WHERE a.source_feature_global_id IN (
  '7f6b3fc5-7fd8-493d-b35a-8fc27b385698'::uuid,
  'a71c40c0-b1f3-4003-9ac6-ea3dbf822e0a'::uuid
);

INSERT INTO public.parking_rule (
  area_id, permit_id, days_of_week, start_time, end_time,
  blocked_start, blocked_end, vehicle_type, source_url, last_verified_on, rule_note
)
SELECT
  a.area_id, p.permit_id, 'Mon-Fri', '07:00'::time,
  CASE a.lot_code WHEN '2V' THEN '17:59'::time WHEN '26V' THEN '15:59'::time END,
  NULL, NULL, 'car',
  'https://services.arcgis.com/FvF9MZKp3JWPrSkg/arcgis/rest/services/Campus_Parking_Lots/FeatureServer/0/' || a.source_feature_id,
  DATE '2026-11-17',
  'Visitor stalls in this section only. Current students and employees may not park here. Visitors may be asked to show a driver’s license. No stay limit or payment is listed for this GIS feature; check posted signs, time stalls, events, holidays, finals, and academic breaks. Privileges: https://security.byu.edu/parking-regulations'
FROM public.parking_area a
JOIN public.permit p ON p.permit_code = 'V'
WHERE a.source_feature_global_id IN (
  '7f6b3fc5-7fd8-493d-b35a-8fc27b385698'::uuid,
  'a71c40c0-b1f3-4003-9ac6-ea3dbf822e0a'::uuid
);

DO $$
BEGIN
  IF (SELECT count(*) FROM public.parking_area WHERE source_feature_global_id IN (
        '7f6b3fc5-7fd8-493d-b35a-8fc27b385698'::uuid,
        'a71c40c0-b1f3-4003-9ac6-ea3dbf822e0a'::uuid
      ) AND NOT is_sample_data AND operator = 'BYU') <> 2 THEN
    RAISE EXCEPTION 'Expected exactly two managed visitor sections';
  END IF;
  IF (SELECT count(*) FROM public.parking_rule r
      JOIN public.parking_area a ON a.area_id = r.area_id
      WHERE a.source_feature_global_id IN (
        '7f6b3fc5-7fd8-493d-b35a-8fc27b385698'::uuid,
        'a71c40c0-b1f3-4003-9ac6-ea3dbf822e0a'::uuid
      )) <> 4 THEN
    RAISE EXCEPTION 'Expected two rules on each managed visitor section';
  END IF;
END $$;
