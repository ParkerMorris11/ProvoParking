-- Shared goals; metric definitions and aggregation stay unchanged.
-- Apply after admin_okr_tracking. No changes to live data are made by the PR.
BEGIN;
CREATE TABLE IF NOT EXISTS parking_private.okr_goals (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  goals jsonb NOT NULL,
  revision bigint NOT NULL DEFAULT 1
);
ALTER TABLE parking_private.okr_goals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON parking_private.okr_goals FROM PUBLIC, anon, authenticated;
INSERT INTO parking_private.okr_goals (goals) VALUES
  ('{"objectives":["Get people to use the app and find their favorite spots.","Reduce user friction in parking."],"metrics":[{"key":"signups","title":"User sign-ups","target":25},{"key":"favorites_average","title":"Favorite spots per user","target":2},{"key":"distance_average_miles","title":"Parking-to-destination distance","target":1},{"key":"parking_average_minutes","title":"Time from app open to parking","target":15}]}'::jsonb)
ON CONFLICT (singleton) DO NOTHING;

CREATE OR REPLACE FUNCTION parking_private.read_okr_goals()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (SELECT 1 FROM parking_private.admin_account WHERE auth_id = auth.uid()) THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501';
  END IF;
  RETURN (SELECT jsonb_build_object('goals', g.goals, 'revision', g.revision) FROM parking_private.okr_goals g);
END;
$$;
REVOKE ALL ON FUNCTION parking_private.read_okr_goals() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION parking_private.read_okr_goals() TO authenticated;

CREATE OR REPLACE FUNCTION parking_private.write_okr_goals(goals jsonb, expected_revision bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  item jsonb;
  i integer;
  target numeric;
  result jsonb;
  keys text[] := ARRAY['signups','favorites_average','distance_average_miles','parking_average_minutes'];
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (SELECT 1 FROM parking_private.admin_account WHERE auth_id = auth.uid()) THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501';
  END IF;
  IF goals IS NULL OR octet_length(goals::text) > 10000
    OR jsonb_typeof(goals) IS DISTINCT FROM 'object'
    OR jsonb_typeof(goals->'objectives') IS DISTINCT FROM 'array'
    OR jsonb_typeof(goals->'metrics') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Invalid goals' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(goals->'objectives') <> 2 OR jsonb_array_length(goals->'metrics') <> 4 THEN
    RAISE EXCEPTION 'Expected two objectives and four metrics' USING ERRCODE = '22023';
  END IF;
  FOR i IN 0..1 LOOP
    item := goals->'objectives'->i;
    IF jsonb_typeof(item) IS DISTINCT FROM 'string' OR length(btrim(item #>> '{}')) NOT BETWEEN 1 AND 160 THEN
      RAISE EXCEPTION 'Invalid objective title' USING ERRCODE = '22023';
    END IF;
  END LOOP;
  FOR i IN 0..3 LOOP
    item := goals->'metrics'->i;
    IF (item->>'key') IS DISTINCT FROM keys[i+1]
      OR jsonb_typeof(item->'title') IS DISTINCT FROM 'string'
      OR length(btrim(item->>'title')) NOT BETWEEN 1 AND 160
      OR jsonb_typeof(item->'target') IS DISTINCT FROM 'number' THEN
      RAISE EXCEPTION 'Invalid metric' USING ERRCODE = '22023';
    END IF;
    target := (item->>'target')::numeric;
    IF target < 0 OR target > 1000000000 OR (i = 0 AND target <> trunc(target)) OR (i = 2 AND target = 0) THEN
      RAISE EXCEPTION 'Invalid target' USING ERRCODE = '22023';
    END IF;
  END LOOP;
  UPDATE parking_private.okr_goals g SET goals = write_okr_goals.goals, revision = g.revision + 1
    WHERE singleton AND g.revision = expected_revision
    RETURNING jsonb_build_object('goals', g.goals, 'revision', g.revision) INTO result;
  IF result IS NULL THEN
    RAISE EXCEPTION 'Goals changed; reload before saving' USING ERRCODE = '40001';
  END IF;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION parking_private.write_okr_goals(jsonb, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION parking_private.write_okr_goals(jsonb, bigint) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_admin_okr_goals()
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT parking_private.read_okr_goals();
$$;
CREATE OR REPLACE FUNCTION public.save_admin_okr_goals(goals jsonb, expected_revision bigint)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT parking_private.write_okr_goals(goals, expected_revision);
$$;
REVOKE ALL ON FUNCTION public.get_admin_okr_goals() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.save_admin_okr_goals(jsonb, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_okr_goals() TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_admin_okr_goals(jsonb, bigint) TO authenticated;
COMMIT;
