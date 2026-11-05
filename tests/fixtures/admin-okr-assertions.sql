-- Disposable test data ONLY. Executed by the local-only guarded integration test.
INSERT INTO auth.users (id,email,raw_user_meta_data) VALUES
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','admin@admin.provoparking.invalid','{}'),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','a@example.com','{"role":"admin","is_admin":true}'),
 ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','b@example.com','{}'),
 ('dddddddd-dddd-4ddd-8ddd-dddddddddddd','c@example.com','{}');
INSERT INTO parking_private.admin_account(auth_id) VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');

DO $$ BEGIN
  IF (SELECT count(*) FROM public.destination) <> 10 THEN RAISE EXCEPTION 'Expected ten destination seeds'; END IF;
END $$;
INSERT INTO public.destination(building_code,name,latitude,longitude,source_url,verified_on)
 VALUES ('TEST','Test origin',0,0,'https://example.com',current_date);
UPDATE public.parking_area SET latitude=0, longitude=CASE WHEN area_id=2 THEN 1 ELSE 0 END, is_sample_data=false WHERE area_id IN (1,2);
INSERT INTO public.favorite_area(user_id,area_id)
 SELECT u.user_id, a.area_id FROM public.app_user u CROSS JOIN public.parking_area a
 WHERE (u.auth_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' AND a.area_id IN (1,2,3))
    OR (u.auth_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc' AND a.area_id=1);
-- Fixture history deliberately predates this migration: it may lack a destination.
ALTER TABLE public.parking_session DISABLE TRIGGER stamp_okr_session;
INSERT INTO public.parking_session(user_id,area_id,destination_id,started_at,planned_minutes,leave_by,status)
 SELECT u.user_id, x.area_id, CASE WHEN x.auth_id LIKE 'dddd%' THEN NULL ELSE d.destination_id END,
   x.started_at::timestamptz,60,x.started_at::timestamptz+interval '1 hour','ended'
 FROM (VALUES
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',1,'2026-11-04 10:00:00+00'),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',2,'2026-11-04 11:00:00+00'),
 ('cccccccc-cccc-4ccc-8ccc-cccccccccccc',1,'2026-11-04 12:00:00+00'),
 ('dddddddd-dddd-4ddd-8ddd-dddddddddddd',1,'2026-11-04 13:00:00+00'),
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',1,'2026-11-04 13:00:00+00'),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',3,'2026-11-04 13:00:00+00')
 ) x(auth_id,area_id,started_at) JOIN public.app_user u ON u.auth_id=x.auth_id::uuid
 CROSS JOIN public.destination d WHERE d.building_code='TEST';
ALTER TABLE public.parking_session ENABLE TRIGGER stamp_okr_session;
-- Visits use the production visit_metrics shape. Links mirror what visit_bind /
-- visit_link_account produce: the owner's latest visit opened in the hour before a start.
-- B 09:40 (superseded), B 11:01 (after its session) and the 11:00 session (no visit within
-- an hour) stay unlinked. Expected KR 2b gaps: 10, 60 and 15 minutes.
INSERT INTO public.app_visit(id,secret_hash,owner_id,opened_at)
 SELECT x.id::uuid, sha256(uuid_send(gen_random_uuid())), x.auth_id::uuid, x.opened_at::timestamptz
 FROM (VALUES
 ('10000000-0000-4000-8000-000000000001','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','2026-11-04 09:40:00+00'),
 ('10000000-0000-4000-8000-000000000002','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','2026-11-04 09:50:00+00'),
 ('10000000-0000-4000-8000-000000000003','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','2026-11-04 11:01:00+00'),
 ('10000000-0000-4000-8000-000000000004','cccccccc-cccc-4ccc-8ccc-cccccccccccc','2026-11-04 11:00:00+00'),
 ('10000000-0000-4000-8000-000000000005','dddddddd-dddd-4ddd-8ddd-dddddddddddd','2026-11-04 12:45:00+00')
 ) x(id,auth_id,opened_at);
INSERT INTO visit_metrics_private.visit_link(visit_id,parking_session_id,completed_at)
 SELECT x.visit_id::uuid, s.session_id, s.started_at
 FROM (VALUES
 ('10000000-0000-4000-8000-000000000002','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','2026-11-04 10:00:00+00'),
 ('10000000-0000-4000-8000-000000000004','cccccccc-cccc-4ccc-8ccc-cccccccccccc','2026-11-04 12:00:00+00'),
 ('10000000-0000-4000-8000-000000000005','dddddddd-dddd-4ddd-8ddd-dddddddddddd','2026-11-04 13:00:00+00')
 ) x(visit_id,auth_id,started_at)
 JOIN public.app_user u ON u.auth_id=x.auth_id::uuid
 JOIN public.parking_session s ON s.user_id=u.user_id AND s.started_at=x.started_at::timestamptz AND s.area_id=1;

SET ROLE anon;
DO $$ BEGIN
  BEGIN PERFORM public.get_admin_okr_metrics(); RAISE EXCEPTION 'Anonymous metrics access allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN INSERT INTO public.app_visit(id,secret_hash) VALUES (gen_random_uuid(),'\x00'); RAISE EXCEPTION 'Anonymous direct visit insert allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","app_metadata":{"role":"admin"},"user_metadata":{"is_admin":true}}';
DO $$ DECLARE own_id integer; other_id integer; BEGIN
  SELECT user_id INTO own_id FROM public.app_user WHERE auth_id=auth.uid();
  BEGIN PERFORM public.get_admin_okr_metrics(); RAISE EXCEPTION 'User became admin from JWT metadata'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM * FROM parking_private.admin_account; RAISE EXCEPTION 'Allowlist readable'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN INSERT INTO parking_private.admin_account(auth_id) VALUES(auth.uid()); RAISE EXCEPTION 'Self promotion allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN INSERT INTO public.app_visit(id,secret_hash,owner_id,opened_at) VALUES(gen_random_uuid(),'\x00',auth.uid(),'2000-01-01'); RAISE EXCEPTION 'Client visit clock allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM * FROM public.app_visit; RAISE EXCEPTION 'Visit history readable'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM * FROM visit_metrics_private.visit_link; RAISE EXCEPTION 'Visit links readable'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  IF (SELECT count(*) FROM public.app_user) <> 1 THEN RAISE EXCEPTION 'Cross-user profiles exposed'; END IF;
END $$;
RESET ROLE;
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}';
DO $$ DECLARE m jsonb; BEGIN
  m:=public.get_admin_okr_metrics();
  IF (m->>'signups')::int<>3 OR (m->>'favorites_count')::int<>4 OR abs((m->>'favorites_average')::numeric-4.0/3)>0.000001 THEN RAISE EXCEPTION 'Signup/favorites math failed: %',m; END IF;
  IF (m->>'total_sessions')::int<>4 OR (m->>'distance_sessions')::int<>3 OR (m->>'parking_sessions')::int<>3 THEN RAISE EXCEPTION 'Coverage/exclusions failed: %',m; END IF;
  IF abs((m->>'distance_average_miles')::numeric - (3958.7613*pi()/180/3)) > 0.000001 THEN RAISE EXCEPTION 'Distance math failed: %',m; END IF;
  IF abs((m->>'parking_average_minutes')::numeric-85.0/3)>0.000001 THEN RAISE EXCEPTION 'Latest/one-hour/future visit matching failed: %',m; END IF;
  IF m ? 'email' OR m ? 'auth_id' OR m ? 'user_id' THEN RAISE EXCEPTION 'Identity data exposed'; END IF;
END $$;
RESET ROLE;
-- Role revocation takes effect on the next query even with the same token.
DELETE FROM parking_private.admin_account;
SET ROLE authenticated;
DO $$ BEGIN
  BEGIN PERFORM public.get_admin_okr_metrics(); RAISE EXCEPTION 'Revoked admin still has access'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
INSERT INTO parking_private.admin_account(auth_id) VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');

-- Test real client inserts, timestamp protection and immutable metric fields.
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"cccccccc-cccc-4ccc-8ccc-cccccccccccc"}';
INSERT INTO public.parking_session(user_id,area_id,destination_id,started_at,planned_minutes,leave_by)
 SELECT u.user_id,1,d.destination_id,'2000-01-01',60,now()+interval '1 hour' FROM public.app_user u CROSS JOIN public.destination d WHERE u.auth_id=auth.uid() AND d.building_code='TEST';
DO $$ BEGIN
  IF EXISTS (SELECT FROM public.parking_session WHERE started_at='2000-01-01') THEN RAISE EXCEPTION 'Client session clock accepted'; END IF;
  BEGIN UPDATE public.parking_session SET destination_id=NULL; RAISE EXCEPTION 'Destination mutable'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN UPDATE public.app_visit SET opened_at=now(); RAISE EXCEPTION 'Visit clock mutable'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
-- No users/sessions: averages must be null, while signups and counts are true zeros.
-- Existing deployed clients keep working during rollout without a destination.
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"cccccccc-cccc-4ccc-8ccc-cccccccccccc"}';
INSERT INTO public.parking_session(user_id,area_id,planned_minutes,leave_by)
 SELECT user_id,1,60,now()+interval '1 hour' FROM public.app_user WHERE auth_id=auth.uid();
RESET ROLE;
DELETE FROM public.app_user WHERE auth_id IS NOT NULL AND auth_id<>'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}';
DO $$ DECLARE m jsonb; BEGIN
  m:=public.get_admin_okr_metrics();
  IF m->>'signups'<>'0' OR m->>'favorites_average' IS NOT NULL OR m->>'distance_average_miles' IS NOT NULL OR m->>'parking_average_minutes' IS NOT NULL THEN RAISE EXCEPTION 'Empty data misrepresented: %',m; END IF;
END $$;
RESET ROLE;
