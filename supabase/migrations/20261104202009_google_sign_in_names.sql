-- Google sign-in: give new Google accounts their real name.
-- Supabase stores a Google user's name as "full_name" / "name" in the account metadata. The sign-up
-- trigger from 20261102040636_account_sign_in.sql only read "display_name", so Google users would
-- get the start of their email instead. Same function otherwise; safe to run more than once.
-- Apply only to the Provo Parking project (rikekjksneoymybnehpo).
BEGIN;

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  meta     jsonb := COALESCE(NEW.raw_user_meta_data, '{}'::jsonb);
  v_name   text;
  v_email  text  := left(NEW.email, 255);
  v_userid integer;
  k        text;
BEGIN
  -- First text value among: our sign-up form, then Google's names.
  FOREACH k IN ARRAY ARRAY['display_name', 'full_name', 'name'] LOOP
    IF jsonb_typeof(meta->k) = 'string' THEN
      v_name := NULLIF(left(btrim(meta->>k), 80), '');
      EXIT WHEN v_name IS NOT NULL;
    END IF;
  END LOOP;
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

COMMIT;
