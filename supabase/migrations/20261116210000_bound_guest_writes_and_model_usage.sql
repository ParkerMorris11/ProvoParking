BEGIN;

-- The timer RPC is SECURITY INVOKER. Grant its input columns and leave session_id to the sequence.
REVOKE INSERT, INSERT (session_id) ON public.parking_session FROM PUBLIC, anon, authenticated;
GRANT INSERT (user_id, area_id, planned_minutes, reminder_minutes_before, car_note, destination_id, permit_id_at_start)
  ON public.parking_session TO authenticated;
REVOKE ALL ON SEQUENCE public.parking_session_session_id_seq FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SEQUENCE public.parking_session_session_id_seq TO authenticated;

CREATE TABLE visit_metrics_private.ingress_budget (
  kind text NOT NULL,
  bucket bigint NOT NULL,
  subject bytea NOT NULL,
  uses integer NOT NULL CHECK (uses > 0),
  PRIMARY KEY (kind, bucket, subject)
);
ALTER TABLE visit_metrics_private.ingress_budget ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON visit_metrics_private.ingress_budget FROM PUBLIC, anon, authenticated;

CREATE FUNCTION visit_metrics_private.take_budget(
  p_kind text, p_bucket bigint, p_subject bytea, p_limit integer
) RETURNS boolean LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path='' AS $$
  WITH reserved AS (
    INSERT INTO visit_metrics_private.ingress_budget AS budget (kind, bucket, subject, uses)
      VALUES (p_kind, p_bucket, p_subject, 1)
    ON CONFLICT (kind, bucket, subject) DO UPDATE SET uses = budget.uses + 1
      WHERE budget.uses < p_limit
    RETURNING 1
  )
  SELECT EXISTS (SELECT 1 FROM reserved);
$$;
REVOKE ALL ON FUNCTION visit_metrics_private.take_budget(text,bigint,bytea,integer) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION visit_metrics_private.consume_parse_find_budget(p_address text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  now_epoch bigint := floor(extract(epoch FROM statement_timestamp()));
  day_bucket bigint := now_epoch / 86400;
  short_bucket bigint := now_epoch / 600;
  address inet;
  subject_key bytea;
BEGIN
  BEGIN
    address := left(p_address, 64)::inet;
  EXCEPTION WHEN invalid_text_representation THEN
    address := NULL;
  END;
  IF family(address) = 6 THEN address := network(set_masklen(address, 64))::inet; END IF;
  SELECT sha256(uuid_send(secret) || convert_to('parse-find:' || short_bucket::text || ':' || coalesce(host(address), 'unattributed'), 'UTF8'))
    INTO STRICT subject_key FROM visit_metrics_private.rate_secret LIMIT 1;

  -- The global ceiling remains enforceable even without a trustworthy client address.
  -- Roll back the project reservation if the caller's own budget is full.
  BEGIN
    IF NOT visit_metrics_private.take_budget('find-day', day_bucket, ''::bytea, 500) THEN
      RAISE SQLSTATE 'P5201';
    END IF;
    IF NOT visit_metrics_private.take_budget('find-client', short_bucket, subject_key, 20) THEN
      RAISE SQLSTATE 'P5201';
    END IF;
  EXCEPTION WHEN SQLSTATE 'P5201' THEN
    RETURN false;
  END;
  DELETE FROM visit_metrics_private.ingress_budget
    WHERE (kind = 'find-day' AND bucket < day_bucket - 1)
       OR (kind = 'find-client' AND bucket < short_bucket - 2);
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION visit_metrics_private.consume_parse_find_budget(text) FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA visit_metrics_private TO service_role;
GRANT EXECUTE ON FUNCTION visit_metrics_private.consume_parse_find_budget(text) TO service_role;

CREATE FUNCTION public.consume_parse_find_budget(p_address text)
RETURNS boolean LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
  SELECT visit_metrics_private.consume_parse_find_budget(p_address);
$$;
REVOKE ALL ON FUNCTION public.consume_parse_find_budget(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_parse_find_budget(text) TO service_role;

CREATE INDEX visit_link_guest_retention_idx ON visit_metrics_private.visit_link(completed_at, guest_session_id)
  WHERE guest_session_id IS NOT NULL;

CREATE OR REPLACE FUNCTION visit_metrics_private.visit_complete_guest(p_id uuid,p_secret uuid,p_session uuid,p_started timestamptz)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  opened timestamptz;
  current_time_at timestamptz := statement_timestamp();
  hour_bucket bigint := floor(extract(epoch FROM current_time_at) / 3600);
BEGIN
  IF p_session IS NULL OR p_started IS NULL OR p_started > current_time_at + interval '1 minute' THEN
    RAISE EXCEPTION 'Invalid session' USING ERRCODE='22023';
  END IF;
  -- Serializes count and insert for one visit, including concurrent deliveries.
  SELECT opened_at INTO opened FROM public.app_visit
    WHERE id=p_id AND secret_hash=pg_catalog.sha256(pg_catalog.uuid_send(p_secret)) FOR UPDATE;
  IF opened IS NULL OR p_started<opened OR p_started>opened+interval '1 hour' THEN
    RAISE EXCEPTION 'Visit denied or outside window' USING ERRCODE='42501';
  END IF;
  IF EXISTS (SELECT 1 FROM visit_metrics_private.visit_link WHERE visit_id=p_id AND parking_session_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Visit denied' USING ERRCODE='42501';
  END IF;
  -- An already-saved event can safely be acknowledged without consuming more capacity.
  IF EXISTS (SELECT 1 FROM visit_metrics_private.visit_link WHERE visit_id=p_id AND guest_session_id=p_session) THEN
    RETURN;
  END IF;
  IF current_time_at > opened + interval '24 hours 5 minutes' THEN
    RAISE EXCEPTION 'Guest visit has expired' USING ERRCODE='22023';
  END IF;
  IF EXISTS (SELECT 1 FROM visit_metrics_private.visit_link WHERE visit_id=p_id AND guest_session_id IS NOT NULL OFFSET 15 LIMIT 1) THEN
    RAISE EXCEPTION 'Guest completion limit reached' USING ERRCODE='P0001';
  END IF;
  IF NOT visit_metrics_private.take_budget('guest-hour', hour_bucket, ''::bytea, 1200) THEN
    RAISE EXCEPTION 'Guest completion limit reached' USING ERRCODE='P0001';
  END IF;
  INSERT INTO visit_metrics_private.visit_link(visit_id,guest_session_id,completed_at)
    VALUES (p_id,p_session,p_started) ON CONFLICT(guest_session_id) DO NOTHING;
  IF NOT FOUND THEN RAISE EXCEPTION 'Visit denied' USING ERRCODE='42501'; END IF;
  UPDATE public.app_visit SET owner_id=NULL WHERE id=p_id;

  -- Prune guest records in bounded batches on ingestion; account links are untouched.
  DELETE FROM visit_metrics_private.visit_link WHERE guest_session_id IN (
    SELECT guest_session_id FROM visit_metrics_private.visit_link
    WHERE guest_session_id IS NOT NULL AND completed_at < current_time_at - interval '90 days'
    ORDER BY completed_at,guest_session_id LIMIT 50
  );
  DELETE FROM visit_metrics_private.ingress_budget WHERE kind = 'guest-hour' AND bucket < hour_bucket - 1;
END $$;

NOTIFY pgrst, 'reload schema';
COMMIT;
