-- Row Level Security for the browser (anon key) client.
-- Run AFTER schema.sql. Class-demo setup: there is no login yet, so the app
-- acts as demo user 1 and the anon role may only read areas and manage user 1's favorites.

ALTER TABLE parking_area  ENABLE ROW LEVEL SECURITY;
ALTER TABLE favorite_area ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_user      ENABLE ROW LEVEL SECURITY;
ALTER TABLE permit        ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_permit   ENABLE ROW LEVEL SECURITY;
ALTER TABLE parking_rule  ENABLE ROW LEVEL SECURITY;
ALTER TABLE parking_session ENABLE ROW LEVEL SECURITY;
ALTER TABLE tow_company   ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone can read parking areas" ON parking_area
  FOR SELECT TO anon USING (true);

CREATE POLICY "demo user favorites are readable" ON favorite_area
  FOR SELECT TO anon USING (user_id = 1);

CREATE POLICY "demo user can add favorites" ON favorite_area
  FOR INSERT TO anon WITH CHECK (user_id = 1);

CREATE POLICY "demo user can remove favorites" ON favorite_area
  FOR DELETE TO anon USING (user_id = 1);

-- ---------- Added for the Find, Area details, and My Car screens ----------
-- Reference data the app only reads.
CREATE POLICY "anyone can read permits" ON permit
  FOR SELECT TO anon USING (true);

CREATE POLICY "anyone can read parking rules" ON parking_rule
  FOR SELECT TO anon USING (true);

CREATE POLICY "anyone can read tow companies" ON tow_company
  FOR SELECT TO anon USING (true);

-- Demo user's parking timer sessions (user 1 only).
CREATE POLICY "demo user sessions are readable" ON parking_session
  FOR SELECT TO anon USING (user_id = 1);

CREATE POLICY "demo user can start a session" ON parking_session
  FOR INSERT TO anon WITH CHECK (user_id = 1);

CREATE POLICY "demo user can update own session" ON parking_session
  FOR UPDATE TO anon USING (user_id = 1) WITH CHECK (user_id = 1);
