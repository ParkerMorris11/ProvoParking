-- Run after the P2 migration, with the Supabase SQL Editor or a database client.
-- Uses the browser's role, not an administrator's RLS bypass. No rows are written.
BEGIN;
SET LOCAL ROLE anon;
DO $$
BEGIN
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
