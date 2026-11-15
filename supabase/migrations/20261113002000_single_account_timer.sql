-- One authoritative account timer. Apply after the existing account/verified-lot/admin migrations.
-- CLI scaffold unavailable locally because its telemetry directory is outside the writable workspace.
BEGIN;
LOCK TABLE public.parking_session IN SHARE ROW EXCLUSIVE MODE;
ALTER TABLE public.parking_session ADD COLUMN IF NOT EXISTS permit_id_at_start integer REFERENCES public.permit(permit_id);

-- Preserve history; keep only the newest previously active session for each account.
WITH ranked AS (
 SELECT session_id,row_number() OVER(PARTITION BY user_id ORDER BY started_at DESC,session_id DESC) AS position
 FROM public.parking_session WHERE status='active'
)
UPDATE public.parking_session s SET status='ended',ended_at=greatest(statement_timestamp(),s.started_at)
FROM ranked r WHERE r.session_id=s.session_id AND r.position>1;
CREATE UNIQUE INDEX IF NOT EXISTS parking_session_one_active_per_user
 ON public.parking_session(user_id) WHERE status='active';

CREATE OR REPLACE FUNCTION public.stamp_account_timer()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF TG_OP='INSERT' THEN
   IF NEW.planned_minutes NOT BETWEEN 1 AND 1440 OR NEW.reminder_minutes_before NOT BETWEEN 0 AND NEW.planned_minutes THEN
     RAISE EXCEPTION 'Invalid timer duration or reminder' USING ERRCODE='23514';
   END IF;
   NEW.started_at:=statement_timestamp();
   NEW.leave_by:=NEW.started_at+NEW.planned_minutes*interval '1 minute';
   NEW.status:='active';
   NEW.ended_at:=NULL;
 ELSE
   IF NEW.planned_minutes IS DISTINCT FROM OLD.planned_minutes OR NEW.leave_by IS DISTINCT FROM OLD.leave_by
      OR NEW.permit_id_at_start IS DISTINCT FROM OLD.permit_id_at_start THEN
     RAISE EXCEPTION 'Timer preferences cannot be changed after starting' USING ERRCODE='42501';
   END IF;
   IF OLD.status<>'active' AND NEW.status IS DISTINCT FROM OLD.status THEN
     RAISE EXCEPTION 'A completed timer cannot be restarted' USING ERRCODE='23514';
   END IF;
   IF OLD.status<>'active' THEN NEW.ended_at:=OLD.ended_at;
   ELSIF NEW.status<>'active' THEN NEW.ended_at:=greatest(statement_timestamp(),OLD.started_at);
   ELSE NEW.ended_at:=NULL; END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.stamp_account_timer() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS stamp_account_timer ON public.parking_session;
CREATE TRIGGER stamp_account_timer BEFORE INSERT OR UPDATE ON public.parking_session
 FOR EACH ROW EXECUTE FUNCTION public.stamp_account_timer();

CREATE OR REPLACE FUNCTION public.parking_timer_snapshot()
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in to use your timer' USING ERRCODE='42501'; END IF;
 SELECT to_jsonb(s) INTO result FROM public.parking_session s
 JOIN public.app_user u ON u.user_id=s.user_id
 WHERE u.auth_id=auth.uid() AND s.status='active' LIMIT 1;
 RETURN jsonb_build_object('session',result,'server_now',clock_timestamp());
END $$;

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
 IF p_destination_id IS NULL THEN RAISE EXCEPTION 'Choose a destination building' USING ERRCODE='23514'; END IF;
 INSERT INTO public.parking_session(user_id,area_id,planned_minutes,reminder_minutes_before,car_note,destination_id,permit_id_at_start)
 VALUES(owner_id,p_area_id,p_minutes,p_reminder,nullif(btrim(p_note),''),p_destination_id,p_permit_id)
 RETURNING * INTO saved;
 RETURN jsonb_build_object('session',to_jsonb(saved),'server_now',clock_timestamp());
END $$;

CREATE OR REPLACE FUNCTION public.parking_timer_end(p_session_id integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in to use your timer' USING ERRCODE='42501'; END IF;
 UPDATE public.parking_session s SET status=CASE WHEN s.leave_by<=statement_timestamp() THEN 'expired' ELSE 'ended' END
 WHERE s.session_id=p_session_id AND s.status='active'
 AND s.user_id IN(SELECT user_id FROM public.app_user WHERE auth_id=auth.uid());
 -- Ending a stale session never clears a newer timer or touches another account.
 RETURN public.parking_timer_snapshot();
END $$;
REVOKE ALL ON FUNCTION public.parking_timer_snapshot(),public.parking_timer_start(integer,integer,integer,text,integer,integer),public.parking_timer_end(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.parking_timer_snapshot(),public.parking_timer_start(integer,integer,integer,text,integer,integer),public.parking_timer_end(integer) TO authenticated;
-- Existing per-user RLS and column update grants continue to protect the same session table.
NOTIFY pgrst, 'reload schema';
COMMIT;
