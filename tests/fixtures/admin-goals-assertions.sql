
-- Minimal isolated fixture: goal permissions use the same private allowlist as metrics.
INSERT INTO auth.users(id) VALUES ('10000000-0000-0000-0000-000000000001'), ('10000000-0000-0000-0000-000000000002');
INSERT INTO parking_private.admin_account(auth_id) VALUES ('10000000-0000-0000-0000-000000000001');
SET ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000002"}', false);
DO $$ BEGIN
  BEGIN PERFORM public.get_admin_okr_goals(); RAISE EXCEPTION 'non-admin read allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public.save_admin_okr_goals('{}',1); RAISE EXCEPTION 'non-admin write allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000001"}', false);
DO $$
DECLARE original jsonb; changed jsonb; saved jsonb;
BEGIN
  original := public.get_admin_okr_goals();
  IF original->>'revision' <> '1' THEN RAISE EXCEPTION 'wrong initial revision'; END IF;
  changed := jsonb_set(original->'goals', '{metrics,0,target}', '50');
  changed := jsonb_set(changed, '{objectives,0}', '"Reach more drivers"');
  saved := public.save_admin_okr_goals(changed,1);
  IF saved->>'revision' <> '2' OR saved->'goals' <> changed OR public.get_admin_okr_goals() <> saved THEN RAISE EXCEPTION 'save did not persist'; END IF;
  BEGIN PERFORM public.save_admin_okr_goals(changed,1); RAISE EXCEPTION 'stale revision allowed'; EXCEPTION WHEN serialization_failure THEN NULL; END;
  BEGIN PERFORM public.save_admin_okr_goals(jsonb_set(changed,'{metrics,0,target}','-1'),2); RAISE EXCEPTION 'negative target allowed'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  BEGIN PERFORM public.save_admin_okr_goals(jsonb_set(changed,'{metrics,0,target}','1.5'),2); RAISE EXCEPTION 'fractional users allowed'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  BEGIN PERFORM public.save_admin_okr_goals(jsonb_set(changed,'{metrics,2,target}','0'),2); RAISE EXCEPTION 'zero distance allowed'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  BEGIN PERFORM public.save_admin_okr_goals(jsonb_set(changed,'{metrics,1,key}','"fake"'),2); RAISE EXCEPTION 'unknown measure allowed'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  BEGIN PERFORM public.save_admin_okr_goals('{}',2); RAISE EXCEPTION 'empty goals allowed'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  BEGIN PERFORM public.save_admin_okr_goals(NULL,2); RAISE EXCEPTION 'null goals allowed'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  BEGIN PERFORM public.save_admin_okr_goals(jsonb_set(changed,'{objectives,0}','"  "'),2); RAISE EXCEPTION 'blank title allowed'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  BEGIN PERFORM * FROM parking_private.okr_goals; RAISE EXCEPTION 'direct read allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN UPDATE parking_private.okr_goals SET revision=999; RAISE EXCEPTION 'direct write allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
DELETE FROM parking_private.admin_account;
SET ROLE authenticated;
DO $$ BEGIN
  BEGIN PERFORM public.get_admin_okr_goals(); RAISE EXCEPTION 'revoked admin read allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public.save_admin_okr_goals('{}',2); RAISE EXCEPTION 'revoked admin write allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SET ROLE anon;
DO $$ BEGIN
  BEGIN PERFORM public.get_admin_okr_goals(); RAISE EXCEPTION 'anonymous read allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public.save_admin_okr_goals('{}',2); RAISE EXCEPTION 'anonymous write allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
