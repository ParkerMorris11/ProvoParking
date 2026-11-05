BEGIN;
CREATE SCHEMA visit_metrics_private;
REVOKE ALL ON SCHEMA visit_metrics_private FROM PUBLIC;
GRANT USAGE ON SCHEMA visit_metrics_private TO anon, authenticated;
CREATE TABLE public.app_visit (
 id uuid PRIMARY KEY,
 secret_hash bytea NOT NULL,
 owner_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
 opened_at timestamptz NOT NULL DEFAULT statement_timestamp()
);
ALTER TABLE public.app_visit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.app_visit FROM PUBLIC, anon, authenticated;
CREATE INDEX app_visit_age_idx ON public.app_visit(opened_at);
CREATE INDEX app_visit_owner_open_idx ON public.app_visit(owner_id, opened_at DESC);
CREATE TABLE visit_metrics_private.visit_link (
 visit_id uuid NOT NULL REFERENCES public.app_visit(id) ON DELETE CASCADE,
 parking_session_id integer UNIQUE REFERENCES public.parking_session(session_id) ON DELETE CASCADE,
 guest_session_id uuid UNIQUE,
 completed_at timestamptz NOT NULL,
 CHECK (num_nonnulls(parking_session_id,guest_session_id)=1)
);
ALTER TABLE visit_metrics_private.visit_link ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON visit_metrics_private.visit_link FROM PUBLIC,anon,authenticated;
CREATE INDEX visit_link_visit_idx ON visit_metrics_private.visit_link(visit_id);

-- Bounded per-address counters retain only a keyed, bucket-specific digest, never the address.
CREATE TABLE visit_metrics_private.rate_secret (secret uuid NOT NULL DEFAULT gen_random_uuid());
INSERT INTO visit_metrics_private.rate_secret DEFAULT VALUES;
CREATE TABLE visit_metrics_private.rate_counter (bucket timestamptz NOT NULL, digest bytea NOT NULL, uses integer NOT NULL, PRIMARY KEY(bucket,digest));
REVOKE ALL ON ALL TABLES IN SCHEMA visit_metrics_private FROM PUBLIC, anon, authenticated;
CREATE FUNCTION visit_metrics_private.limit_open() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE headers jsonb; address text; bucket_at timestamptz; digest_value bytea; count_value integer;
BEGIN
 headers := coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb;
 address := left(coalesce(nullif(split_part(headers->>'x-forwarded-for',',',1),''),'unattributed'),128);
 bucket_at := to_timestamp(floor(extract(epoch from statement_timestamp())/600)*600);
 SELECT pg_catalog.sha256(pg_catalog.uuid_send(secret) || convert_to(bucket_at::text || ':' || address,'UTF8')) INTO digest_value FROM visit_metrics_private.rate_secret LIMIT 1;
 DELETE FROM visit_metrics_private.rate_counter WHERE bucket < bucket_at - interval '20 minutes';
 INSERT INTO visit_metrics_private.rate_counter(bucket,digest,uses) VALUES(bucket_at,digest_value,1)
 ON CONFLICT(bucket,digest) DO UPDATE SET uses=visit_metrics_private.rate_counter.uses+1
 WHERE visit_metrics_private.rate_counter.uses<40 RETURNING uses INTO count_value;
 IF count_value IS NULL THEN RAISE EXCEPTION 'Visit rate limit exceeded' USING ERRCODE='P0001'; END IF;
END $$;

-- Unexposed helpers are the only privileged interface. The random per-visit capability
-- is never stored in plaintext; public wrappers below are invoker functions.
CREATE FUNCTION visit_metrics_private.visit_open(p_id uuid,p_secret uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF p_id IS NULL OR p_secret IS NULL THEN RAISE EXCEPTION 'Invalid visit' USING ERRCODE='22023'; END IF;
 IF EXISTS(SELECT 1 FROM public.app_visit WHERE id=p_id) THEN
   IF EXISTS(SELECT 1 FROM public.app_visit WHERE id=p_id AND secret_hash=pg_catalog.sha256(pg_catalog.uuid_send(p_secret))) THEN RETURN; END IF;
   RAISE EXCEPTION 'Visit denied' USING ERRCODE='42501';
 END IF;
 PERFORM visit_metrics_private.limit_open();
 DELETE FROM public.app_visit v WHERE NOT EXISTS(SELECT 1 FROM visit_metrics_private.visit_link l WHERE l.visit_id=v.id) AND v.id IN
   (SELECT old.id FROM public.app_visit old WHERE old.opened_at < statement_timestamp()-interval '7 days' AND NOT EXISTS(SELECT 1 FROM visit_metrics_private.visit_link l WHERE l.visit_id=old.id) ORDER BY old.opened_at LIMIT 50);
 INSERT INTO public.app_visit(id,secret_hash,owner_id) VALUES(p_id,pg_catalog.sha256(pg_catalog.uuid_send(p_secret)),auth.uid()) ON CONFLICT(id) DO NOTHING;
 IF NOT EXISTS(SELECT 1 FROM public.app_visit WHERE id=p_id AND secret_hash=pg_catalog.sha256(pg_catalog.uuid_send(p_secret))) THEN RAISE EXCEPTION 'Visit denied' USING ERRCODE='42501'; END IF;
END $$;
CREATE FUNCTION visit_metrics_private.visit_bind(p_id uuid,p_secret uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE visit_opened timestamptz;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Visit denied' USING ERRCODE='42501'; END IF;
 -- Serialize binds and links for an account so a late-binding tab repairs attribution safely.
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text,0));
 UPDATE public.app_visit SET owner_id=auth.uid() WHERE id=p_id AND secret_hash=pg_catalog.sha256(pg_catalog.uuid_send(p_secret)) AND (owner_id=auth.uid() OR (owner_id IS NULL AND NOT EXISTS(SELECT 1 FROM visit_metrics_private.visit_link l WHERE l.visit_id=p_id))) RETURNING opened_at INTO visit_opened;
 IF NOT FOUND THEN RAISE EXCEPTION 'Visit denied' USING ERRCODE='42501'; END IF;
 INSERT INTO visit_metrics_private.visit_link AS existing(visit_id,parking_session_id,completed_at)
 SELECT p_id,s.session_id,s.started_at FROM public.parking_session s JOIN public.app_user u ON u.user_id=s.user_id
 WHERE u.auth_id=auth.uid() AND s.started_at>=visit_opened AND s.started_at<=visit_opened+interval '1 hour'
 ON CONFLICT(parking_session_id) DO UPDATE SET visit_id=EXCLUDED.visit_id
 WHERE EXISTS(SELECT 1 FROM public.app_visit prior WHERE prior.id=existing.visit_id AND (prior.opened_at,prior.id)<(visit_opened,p_id));
END $$;
CREATE FUNCTION visit_metrics_private.visit_link_account(p_id uuid,p_secret uuid,p_session integer) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE t timestamptz; target uuid;
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.app_visit WHERE id=p_id AND secret_hash=pg_catalog.sha256(pg_catalog.uuid_send(p_secret)) AND owner_id=auth.uid()) THEN RAISE EXCEPTION 'Visit denied' USING ERRCODE='42501'; END IF;
 SELECT s.started_at INTO t FROM public.parking_session s JOIN public.app_user u ON u.user_id=s.user_id WHERE s.session_id=p_session AND u.auth_id=auth.uid();
 IF t IS NULL THEN RAISE EXCEPTION 'Session not found or denied' USING ERRCODE='42501'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text,0));
 IF EXISTS(SELECT 1 FROM visit_metrics_private.visit_link WHERE parking_session_id=p_session) THEN RETURN; END IF;
 SELECT id INTO target FROM public.app_visit WHERE owner_id=auth.uid() AND opened_at<=t AND opened_at>=t-interval '1 hour' ORDER BY opened_at DESC,id DESC FOR UPDATE LIMIT 1;
 IF target IS NOT NULL THEN INSERT INTO visit_metrics_private.visit_link(visit_id,parking_session_id,completed_at) VALUES(target,p_session,t) ON CONFLICT(parking_session_id) DO NOTHING; END IF;
END $$;
CREATE FUNCTION visit_metrics_private.visit_complete_guest(p_id uuid,p_secret uuid,p_session uuid,p_started timestamptz) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE opened timestamptz;
BEGIN
 IF p_session IS NULL OR p_started IS NULL OR p_started > statement_timestamp()+interval '1 minute' THEN RAISE EXCEPTION 'Invalid session' USING ERRCODE='22023'; END IF;
 SELECT opened_at INTO opened FROM public.app_visit WHERE id=p_id AND secret_hash=pg_catalog.sha256(pg_catalog.uuid_send(p_secret)) FOR UPDATE;
 IF opened IS NULL OR p_started<opened OR p_started>opened+interval '1 hour' THEN RAISE EXCEPTION 'Visit denied or outside window' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM visit_metrics_private.visit_link WHERE visit_id=p_id AND parking_session_id IS NOT NULL) THEN RAISE EXCEPTION 'Visit denied' USING ERRCODE='42501'; END IF;
 UPDATE public.app_visit SET owner_id=NULL WHERE id=p_id;
 INSERT INTO visit_metrics_private.visit_link(visit_id,guest_session_id,completed_at) VALUES(p_id,p_session,p_started) ON CONFLICT(guest_session_id) DO NOTHING;
 IF NOT EXISTS(SELECT 1 FROM visit_metrics_private.visit_link WHERE visit_id=p_id AND guest_session_id=p_session) THEN RAISE EXCEPTION 'Visit denied' USING ERRCODE='42501'; END IF;
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA visit_metrics_private FROM PUBLIC;
GRANT EXECUTE ON FUNCTION visit_metrics_private.visit_open(uuid,uuid), visit_metrics_private.visit_complete_guest(uuid,uuid,uuid,timestamptz) TO anon,authenticated;
GRANT EXECUTE ON FUNCTION visit_metrics_private.visit_bind(uuid,uuid), visit_metrics_private.visit_link_account(uuid,uuid,integer) TO authenticated;
CREATE FUNCTION public.visit_open(p_id uuid,p_secret uuid) RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT visit_metrics_private.visit_open($1,$2)$$;
CREATE FUNCTION public.visit_bind(p_id uuid,p_secret uuid) RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT visit_metrics_private.visit_bind($1,$2)$$;
CREATE FUNCTION public.visit_link_account(p_id uuid,p_secret uuid,p_session integer) RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT visit_metrics_private.visit_link_account($1,$2,$3)$$;
CREATE FUNCTION public.visit_complete_guest(p_id uuid,p_secret uuid,p_session uuid,p_started timestamptz) RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT visit_metrics_private.visit_complete_guest($1,$2,$3,$4)$$;
REVOKE ALL ON FUNCTION public.visit_open(uuid,uuid),public.visit_bind(uuid,uuid),public.visit_link_account(uuid,uuid,integer),public.visit_complete_guest(uuid,uuid,uuid,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.visit_open(uuid,uuid),public.visit_complete_guest(uuid,uuid,uuid,timestamptz) TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public.visit_bind(uuid,uuid),public.visit_link_account(uuid,uuid,integer) TO authenticated;
COMMIT;
