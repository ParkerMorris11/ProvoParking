-- Account sign-in (Sprint 2): replaces the shared demo user with real Supabase Auth accounts.
-- Apply only to the Provo Parking project (rikekjksneoymybnehpo). Safe to run more than once.
--
-- What it does
--   1. Links each app_user profile to a Supabase Auth account (app_user.auth_id).
--   2. When someone signs up, a trigger creates their app_user row and their user_permit rows
--      from the sign-up form (name + permit ids sent as user metadata). It works whether or not
--      "Confirm email" is on, and never blocks a sign-up because of bad metadata.
--   3. Signed-in users (role "authenticated") can read the public reference data and read/change
--      only their own profile, permits, favorites and My car sessions.
--   4. Removes the old "demo user 1" browser policies, so visitors can no longer write data.
--      Existing demo rows are kept. Visitors (role "anon") can still read areas, permits, rules
--      and tow companies.
-- User metadata only seeds a new profile; it is never used to decide access.
BEGIN;

-- 1. Link profiles to auth accounts --------------------------------------------------------
ALTER TABLE public.app_user
  ADD COLUMN IF NOT EXISTS auth_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE;

-- 2. Create the profile and permits when an auth account is created ------------------------
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  meta     jsonb := COALESCE(NEW.raw_user_meta_data, '{}'::jsonb);
  v_name   text  := CASE WHEN jsonb_typeof(meta->'display_name') = 'string'
                         THEN NULLIF(left(btrim(meta->>'display_name'), 80), '') END;
  v_email  text  := left(NEW.email, 255);
  v_userid integer;
BEGIN
  IF v_name IS NULL THEN
    v_name := left(COALESCE(NULLIF(split_part(COALESCE(NEW.email, ''), '@', 1), ''), 'Driver'), 80);
  END IF;

  BEGIN
    INSERT INTO public.app_user (auth_id, display_name, email)
    VALUES (NEW.id, v_name, v_email)
    RETURNING user_id INTO v_userid;
  EXCEPTION WHEN unique_violation THEN
    -- The email already belongs to an older demo profile. Keep the new account working without it.
    INSERT INTO public.app_user (auth_id, display_name, email)
    VALUES (NEW.id, v_name, NULL)
    RETURNING user_id INTO v_userid;
  END;

  -- Only ids of permits that exist are saved; anything else in the metadata is ignored.
  INSERT INTO public.user_permit (user_id, permit_id)
  SELECT v_userid, p.permit_id
  FROM public.permit p
  WHERE p.permit_id IN (
    SELECT v::integer
    FROM jsonb_array_elements_text(
      CASE WHEN jsonb_typeof(meta->'permit_ids') = 'array' THEN meta->'permit_ids' ELSE '[]'::jsonb END
    ) AS v
    WHERE v ~ '^[0-9]{1,9}$'
  )
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.handle_new_auth_user() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

-- 3. Privileges: least privilege for both browser roles --------------------------------------
-- Reference data: read-only for everyone.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.parking_area, public.permit, public.parking_rule, public.tow_company FROM anon, authenticated;
GRANT SELECT ON public.parking_area, public.permit, public.parking_rule, public.tow_company TO anon, authenticated;

-- Personal data: visitors keep SELECT (row security still shows them nothing) but cannot write.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.app_user, public.user_permit, public.favorite_area, public.parking_session FROM anon, authenticated;
GRANT SELECT ON public.app_user, public.user_permit, public.favorite_area, public.parking_session TO anon, authenticated;

-- Signed-in users: profiles are created by the trigger; users may rename themselves and change settings.
GRANT UPDATE (display_name, location_permission, notifications_enabled) ON public.app_user TO authenticated;
GRANT INSERT, DELETE ON public.user_permit, public.favorite_area TO authenticated;
GRANT INSERT ON public.parking_session TO authenticated;
GRANT UPDATE (status, ended_at, car_note) ON public.parking_session TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.parking_session_session_id_seq TO authenticated;

-- 4. Row security policies -------------------------------------------------------------------
ALTER TABLE public.app_user        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_permit     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.favorite_area   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parking_session ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parking_area    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permit          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parking_rule    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tow_company     ENABLE ROW LEVEL SECURITY;

-- Retire the shared demo-user policies (from policies.sql and the 2026-10-14 files).
DROP POLICY IF EXISTS "demo user favorites are readable" ON public.favorite_area;
DROP POLICY IF EXISTS "demo user can add favorites"      ON public.favorite_area;
DROP POLICY IF EXISTS "demo user can remove favorites"   ON public.favorite_area;
DROP POLICY IF EXISTS "demo user sessions are readable"  ON public.parking_session;
DROP POLICY IF EXISTS "demo user can start a session"    ON public.parking_session;
DROP POLICY IF EXISTS "demo user can update own session" ON public.parking_session;
DROP POLICY IF EXISTS "demo user permits are readable"   ON public.user_permit;
DROP POLICY IF EXISTS "demo user can add permits"        ON public.user_permit;
DROP POLICY IF EXISTS "demo user can remove permits"     ON public.user_permit;
DROP POLICY IF EXISTS "demo user profile is readable"    ON public.app_user;
DROP POLICY IF EXISTS "demo user can update settings"    ON public.app_user;

-- Reference data for signed-in users (the anon read policies already exist and stay).
DROP POLICY IF EXISTS "signed-in users read parking areas" ON public.parking_area;
CREATE POLICY "signed-in users read parking areas" ON public.parking_area
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "signed-in users read permits" ON public.permit;
CREATE POLICY "signed-in users read permits" ON public.permit
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "signed-in users read parking rules" ON public.parking_rule;
CREATE POLICY "signed-in users read parking rules" ON public.parking_rule
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "signed-in users read tow companies" ON public.tow_company;
CREATE POLICY "signed-in users read tow companies" ON public.tow_company
  FOR SELECT TO authenticated USING (true);

-- Own profile.
DROP POLICY IF EXISTS "users read own profile" ON public.app_user;
CREATE POLICY "users read own profile" ON public.app_user
  FOR SELECT TO authenticated USING (auth_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS "users update own profile" ON public.app_user;
CREATE POLICY "users update own profile" ON public.app_user
  FOR UPDATE TO authenticated
  USING (auth_id = (SELECT auth.uid())) WITH CHECK (auth_id = (SELECT auth.uid()));

-- "Own" rows are rows whose user_id is the signed-in user's profile. The subquery is itself
-- limited by the profile policy above, so it can only ever return the caller's user_id.
DROP POLICY IF EXISTS "users read own permits" ON public.user_permit;
CREATE POLICY "users read own permits" ON public.user_permit
  FOR SELECT TO authenticated
  USING (user_id IN (SELECT u.user_id FROM public.app_user u WHERE u.auth_id = (SELECT auth.uid())));
DROP POLICY IF EXISTS "users add own permits" ON public.user_permit;
CREATE POLICY "users add own permits" ON public.user_permit
  FOR INSERT TO authenticated
  WITH CHECK (user_id IN (SELECT u.user_id FROM public.app_user u WHERE u.auth_id = (SELECT auth.uid())));
DROP POLICY IF EXISTS "users remove own permits" ON public.user_permit;
CREATE POLICY "users remove own permits" ON public.user_permit
  FOR DELETE TO authenticated
  USING (user_id IN (SELECT u.user_id FROM public.app_user u WHERE u.auth_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS "users read own favorites" ON public.favorite_area;
CREATE POLICY "users read own favorites" ON public.favorite_area
  FOR SELECT TO authenticated
  USING (user_id IN (SELECT u.user_id FROM public.app_user u WHERE u.auth_id = (SELECT auth.uid())));
DROP POLICY IF EXISTS "users add own favorites" ON public.favorite_area;
CREATE POLICY "users add own favorites" ON public.favorite_area
  FOR INSERT TO authenticated
  WITH CHECK (user_id IN (SELECT u.user_id FROM public.app_user u WHERE u.auth_id = (SELECT auth.uid())));
DROP POLICY IF EXISTS "users remove own favorites" ON public.favorite_area;
CREATE POLICY "users remove own favorites" ON public.favorite_area
  FOR DELETE TO authenticated
  USING (user_id IN (SELECT u.user_id FROM public.app_user u WHERE u.auth_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS "users read own sessions" ON public.parking_session;
CREATE POLICY "users read own sessions" ON public.parking_session
  FOR SELECT TO authenticated
  USING (user_id IN (SELECT u.user_id FROM public.app_user u WHERE u.auth_id = (SELECT auth.uid())));
DROP POLICY IF EXISTS "users start own sessions" ON public.parking_session;
CREATE POLICY "users start own sessions" ON public.parking_session
  FOR INSERT TO authenticated
  WITH CHECK (user_id IN (SELECT u.user_id FROM public.app_user u WHERE u.auth_id = (SELECT auth.uid())));
DROP POLICY IF EXISTS "users update own sessions" ON public.parking_session;
CREATE POLICY "users update own sessions" ON public.parking_session
  FOR UPDATE TO authenticated
  USING (user_id IN (SELECT u.user_id FROM public.app_user u WHERE u.auth_id = (SELECT auth.uid())))
  WITH CHECK (user_id IN (SELECT u.user_id FROM public.app_user u WHERE u.auth_id = (SELECT auth.uid())));

CREATE INDEX IF NOT EXISTS favorite_area_user_id_idx ON public.favorite_area (user_id);
CREATE INDEX IF NOT EXISTS parking_session_user_id_idx ON public.parking_session (user_id);

COMMIT;
