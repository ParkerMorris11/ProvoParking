-- Demo-safe AI search budget (Nov 18 class demo on one shared Wi-Fi network).
-- A whole class shares one public IP, so 20 model calls per address every 10 minutes ran out after a few
-- searches. Raise the per-address window to 200 per 10 minutes and the project-wide ceiling to 1500 per day.
-- Same function body as 20261116210000 otherwise; grants are unchanged because CREATE OR REPLACE keeps them.
-- When the limit is still hit, the page answers with its backup (rule-based) reader instead of an error.
BEGIN;

CREATE OR REPLACE FUNCTION visit_metrics_private.consume_parse_find_budget(p_address text)
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
    IF NOT visit_metrics_private.take_budget('find-day', day_bucket, ''::bytea, 1500) THEN
      RAISE SQLSTATE 'P5201';
    END IF;
    IF NOT visit_metrics_private.take_budget('find-client', short_bucket, subject_key, 200) THEN
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

NOTIFY pgrst, 'reload schema';
COMMIT;
