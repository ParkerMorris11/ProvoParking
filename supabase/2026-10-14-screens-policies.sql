-- One-time update for a Supabase project that already ran policies.sql before the new screens.
-- Paste into Supabase > SQL Editor and click Run. Fresh installs just run policies.sql (it already includes these).
-- Safe to run more than once: each policy is dropped first.
BEGIN;

DROP POLICY IF EXISTS "anyone can read permits" ON permit;
CREATE POLICY "anyone can read permits" ON permit FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "anyone can read parking rules" ON parking_rule;
CREATE POLICY "anyone can read parking rules" ON parking_rule FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "anyone can read tow companies" ON tow_company;
CREATE POLICY "anyone can read tow companies" ON tow_company FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "demo user sessions are readable" ON parking_session;
CREATE POLICY "demo user sessions are readable" ON parking_session FOR SELECT TO anon USING (user_id = 1);

DROP POLICY IF EXISTS "demo user can start a session" ON parking_session;
CREATE POLICY "demo user can start a session" ON parking_session FOR INSERT TO anon WITH CHECK (user_id = 1);

DROP POLICY IF EXISTS "demo user can update own session" ON parking_session;
CREATE POLICY "demo user can update own session" ON parking_session FOR UPDATE TO anon USING (user_id = 1) WITH CHECK (user_id = 1);

COMMIT;
