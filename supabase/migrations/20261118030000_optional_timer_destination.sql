-- The parking timer no longer asks for a destination building (simpler My Car sheet, Nov 2026).
-- parking_timer_start keeps the same signature but now accepts NULL for p_destination_id.
-- When the driver picked a building in Find, the app still sends it, so the admin
-- walking-distance metric keeps working for those sessions; sessions without one are
-- already excluded from that metric.
-- Run this on the live project BEFORE merging the app change, or new timers will fail
-- with "Choose a destination building".
BEGIN;
CREATE OR REPLACE FUNCTION public.parking_timer_start(
 p_area_id integer,p_minutes integer,p_reminder integer,p_note text,p_destination_id integer,p_permit_id integer DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE owner_id integer; saved public.parking_session;
BEGIN
 SELECT user_id INTO owner_id FROM public.app_user WHERE auth_id=auth.uid();
 IF owner_id IS NULL THEN RAISE EXCEPTION 'Sign in to use your timer' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.parking_area WHERE area_id=p_area_id AND NOT is_sample_data) THEN
   RAISE EXCEPTION 'Choose a verified parking area' USING ERRCODE='23514';
 END IF;
 INSERT INTO public.parking_session(user_id,area_id,planned_minutes,reminder_minutes_before,car_note,destination_id,permit_id_at_start)
 VALUES(owner_id,p_area_id,p_minutes,p_reminder,nullif(btrim(p_note),''),p_destination_id,p_permit_id)
 RETURNING * INTO saved;
 RETURN jsonb_build_object('session',to_jsonb(saved),'server_now',clock_timestamp());
END $$;
REVOKE ALL ON FUNCTION public.parking_timer_start(integer,integer,integer,text,integer,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.parking_timer_start(integer,integer,integer,text,integer,integer) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
