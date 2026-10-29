-- P2: let the existing browser client read public parking reference data.
-- Row security stays enabled. No user/session policies or write policies are added.
BEGIN;
ALTER TABLE public.permit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parking_rule ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tow_company ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.permit, public.parking_rule, public.tow_company TO anon;

DROP POLICY IF EXISTS "anyone can read permits" ON public.permit;
CREATE POLICY "anyone can read permits" ON public.permit
  FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS "anyone can read parking rules" ON public.parking_rule;
CREATE POLICY "anyone can read parking rules" ON public.parking_rule
  FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS "anyone can read tow companies" ON public.tow_company;
CREATE POLICY "anyone can read tow companies" ON public.tow_company
  FOR SELECT TO anon USING (true);
COMMIT;
