-- Run after the P2 migration, with the Supabase SQL Editor or a database client.
-- Uses the browser's role, not an administrator's RLS bypass. No rows are written.
BEGIN;
SET LOCAL ROLE anon;
DO $$
BEGIN
  ASSERT NOT has_table_privilege('anon', 'public.permit', 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'),
    'Permit reference data must be read-only for visitors';
  ASSERT NOT has_table_privilege('anon', 'public.parking_rule', 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'),
    'Parking rule reference data must be read-only for visitors';
  ASSERT NOT has_table_privilege('anon', 'public.tow_company', 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'),
    'Tow reference data must be read-only for visitors';
  ASSERT (SELECT count(*) FROM public.permit) > 0,
    'Browser role cannot read permits';
  ASSERT (SELECT count(*) FROM public.parking_rule) > 0,
    'Browser role cannot read parking rules';
  ASSERT (SELECT count(*) FROM public.tow_company) > 0,
    'Browser role cannot read tow reference data';
  ASSERT (SELECT count(*) FROM public.app_user) = 0,
    'P2 must not expose profiles';
  ASSERT (SELECT count(*) FROM public.user_permit) = 0,
    'P2 must not expose user permit selections';
  ASSERT (SELECT count(*) FROM public.parking_session) = 0,
    'P2 must not expose parking sessions';
END $$;
ROLLBACK;
