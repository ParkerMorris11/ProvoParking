-- Adds what the Getting started, BYU permit, and Settings screens need.
-- Run in the Supabase SQL Editor AFTER schema.sql and policies.sql.
-- Same class-demo rule as before: no login yet, so the anon role only touches demo user 1.

CREATE POLICY "anyone can read permits" ON permit
  FOR SELECT TO anon USING (true);

CREATE POLICY "anyone can read parking rules" ON parking_rule
  FOR SELECT TO anon USING (true);

CREATE POLICY "demo user permits are readable" ON user_permit
  FOR SELECT TO anon USING (user_id = 1);

CREATE POLICY "demo user can add permits" ON user_permit
  FOR INSERT TO anon WITH CHECK (user_id = 1);

CREATE POLICY "demo user can remove permits" ON user_permit
  FOR DELETE TO anon USING (user_id = 1);

CREATE POLICY "demo user profile is readable" ON app_user
  FOR SELECT TO anon USING (user_id = 1);

CREATE POLICY "demo user can update settings" ON app_user
  FOR UPDATE TO anon USING (user_id = 1) WITH CHECK (user_id = 1);
