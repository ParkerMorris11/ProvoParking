-- P7. Apply only to Provo Parking project rikekjksneoymybnehpo.
-- Additive: no legacy parking_session, app_user, reference data, or auth settings change.
BEGIN;

CREATE TABLE IF NOT EXISTS public.owned_parking_session (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  location_id text,
  location_name text NOT NULL CHECK (length(btrim(location_name)) BETWEEN 1 AND 160),
  latitude double precision,
  longitude double precision,
  is_sample boolean NOT NULL DEFAULT false,
  started_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  duration_minutes integer NOT NULL CHECK (duration_minutes BETWEEN 30 AND 720 AND duration_minutes % 30 = 0),
  reminder_minutes_before integer NOT NULL DEFAULT 10
    CHECK (reminder_minutes_before IN (0,5,10,15,30) AND reminder_minutes_before < duration_minutes),
  notes varchar(200) NOT NULL DEFAULT '',
  expires_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed')),
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  completed_at timestamptz,
  CONSTRAINT p7_location_id CHECK (location_id IS NULL OR length(btrim(location_id)) BETWEEN 1 AND 200),
  CONSTRAINT p7_coordinates CHECK (
    (latitude IS NULL AND longitude IS NULL) OR
    (latitude IS NOT NULL AND longitude IS NOT NULL AND latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180)
  ),
  CONSTRAINT p7_expiration CHECK (expires_at = started_at + duration_minutes * interval '1 minute'),
  CONSTRAINT p7_completion CHECK (
    (status = 'active' AND completed_at IS NULL) OR
    (status = 'completed' AND completed_at IS NOT NULL AND completed_at >= started_at)
  )
);

-- Expiration is a calculated timer state. An expired, unended session remains recoverable.
CREATE UNIQUE INDEX IF NOT EXISTS p7_one_active_session_per_owner
  ON public.owned_parking_session(owner_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS p7_sessions_owner_created
  ON public.owned_parking_session(owner_id, created_at DESC);

ALTER TABLE public.owned_parking_session ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.owned_parking_session FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.owned_parking_session TO authenticated;
GRANT INSERT (location_id, location_name, latitude, longitude, is_sample,
  duration_minutes, reminder_minutes_before, notes) ON public.owned_parking_session TO authenticated;
GRANT UPDATE (status) ON public.owned_parking_session TO authenticated;

DROP POLICY IF EXISTS p7_select_own ON public.owned_parking_session;
CREATE POLICY p7_select_own ON public.owned_parking_session FOR SELECT TO authenticated
  USING (owner_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS p7_insert_own ON public.owned_parking_session;
CREATE POLICY p7_insert_own ON public.owned_parking_session FOR INSERT TO authenticated
  WITH CHECK (owner_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS p7_complete_own ON public.owned_parking_session;
CREATE POLICY p7_complete_own ON public.owned_parking_session FOR UPDATE TO authenticated
  USING (owner_id = (SELECT auth.uid())) WITH CHECK (owner_id = (SELECT auth.uid()));

-- Invoker trigger stamps immutable ownership/times even for direct Data API inserts.
-- Column grants prevent clients from changing fields other than completion status.
CREATE OR REPLACE FUNCTION public.p7_stamp_parking_session()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE actor uuid := auth.uid();
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Sign in to use parking sessions' USING ERRCODE = '42501'; END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.id := gen_random_uuid();
    NEW.owner_id := actor;
    NEW.started_at := statement_timestamp();
    NEW.created_at := NEW.started_at;
    NEW.expires_at := NEW.started_at + NEW.duration_minutes * interval '1 minute';
    NEW.status := 'active';
    NEW.completed_at := NULL;
    NEW.location_name := btrim(NEW.location_name);
    NEW.location_id := btrim(NEW.location_id);
    NEW.notes := btrim(NEW.notes);
  ELSE
    IF OLD.owner_id <> actor THEN RAISE EXCEPTION 'Session not found' USING ERRCODE = '42501'; END IF;
    IF NEW.status <> 'completed' THEN
      RAISE EXCEPTION 'A session can only be completed, never reopened' USING ERRCODE = '23514';
    END IF;
    NEW.completed_at := COALESCE(OLD.completed_at, greatest(statement_timestamp(), OLD.started_at));
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS p7_stamp_parking_session ON public.owned_parking_session;
CREATE TRIGGER p7_stamp_parking_session BEFORE INSERT OR UPDATE ON public.owned_parking_session
  FOR EACH ROW EXECUTE FUNCTION public.p7_stamp_parking_session();
REVOKE ALL ON FUNCTION public.p7_stamp_parking_session() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.p7_create_parking_session(
  p_location_name text, p_duration_minutes integer,
  p_reminder_minutes_before integer DEFAULT 10, p_location_id text DEFAULT NULL,
  p_latitude double precision DEFAULT NULL, p_longitude double precision DEFAULT NULL,
  p_notes text DEFAULT '', p_is_sample boolean DEFAULT false
)
RETURNS SETOF public.owned_parking_session LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in to use parking sessions' USING ERRCODE = '42501'; END IF;
  RETURN QUERY INSERT INTO public.owned_parking_session
    (location_name, duration_minutes, reminder_minutes_before, location_id, latitude, longitude, notes, is_sample)
    VALUES (p_location_name, p_duration_minutes, p_reminder_minutes_before, p_location_id,
      p_latitude, p_longitude, p_notes, p_is_sample)
    RETURNING *;
END;
$$;

CREATE OR REPLACE FUNCTION public.p7_get_active_parking_session()
RETURNS SETOF public.owned_parking_session LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in to use parking sessions' USING ERRCODE = '42501'; END IF;
  RETURN QUERY SELECT * FROM public.owned_parking_session
    WHERE owner_id = (SELECT auth.uid()) AND status = 'active' LIMIT 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.p7_end_parking_session(p_session_id uuid)
RETURNS SETOF public.owned_parking_session LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in to use parking sessions' USING ERRCODE = '42501'; END IF;
  RETURN QUERY UPDATE public.owned_parking_session SET status = 'completed'
    WHERE id = p_session_id AND owner_id = (SELECT auth.uid()) AND status = 'active' RETURNING *;
  IF FOUND THEN RETURN; END IF;
  -- Repeating an end request returns the original completion timestamp unchanged.
  RETURN QUERY SELECT * FROM public.owned_parking_session
    WHERE id = p_session_id AND owner_id = (SELECT auth.uid()) AND status = 'completed';
  IF NOT FOUND THEN RAISE EXCEPTION 'Session not found' USING ERRCODE = 'P0002'; END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.p7_create_parking_session(text,integer,integer,text,double precision,double precision,text,boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.p7_get_active_parking_session() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.p7_end_parking_session(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.p7_create_parking_session(text,integer,integer,text,double precision,double precision,text,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.p7_get_active_parking_session() TO authenticated;
GRANT EXECUTE ON FUNCTION public.p7_end_parking_session(uuid) TO authenticated;
COMMIT;
