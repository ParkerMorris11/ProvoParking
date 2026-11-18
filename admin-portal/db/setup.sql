-- Provo Parking admin site (IS 403): database setup.
-- Run this once in the Supabase SQL Editor (or psql).
--
-- Everything goes in its own schema called "portal" so that:
--   1. The live Provo Parking app's tables are never changed by the admin site.
--   2. Supabase's public API cannot read these tables (only the "public"
--      schema is exposed to the browser), so passwords stay on the server.

CREATE SCHEMA IF NOT EXISTS portal;

-- Keep browser roles out of this schema completely.
REVOKE ALL ON SCHEMA portal FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON SCHEMA portal FROM anon, authenticated';
  END IF;
END $$;

-- Users who can log in to the admin site.
CREATE TABLE IF NOT EXISTS portal.users (
  user_email    VARCHAR(255) PRIMARY KEY,   -- login name; the primary key, so it is not editable
  user_password VARCHAR(255) NOT NULL,
  first_name    VARCHAR(50)  NOT NULL,
  last_name     VARCHAR(50)  NOT NULL
);

-- Parking lots (a copy of the app's parking_area table, so TAs can safely edit and delete).
CREATE TABLE IF NOT EXISTS portal.lots (
  lot_id       SERIAL PRIMARY KEY,
  lot_name     VARCHAR(120) NOT NULL,
  lot_code     VARCHAR(20),
  operator     VARCHAR(40)  NOT NULL,      -- BYU, City of Provo, or Private
  total_spaces INT,
  is_free      BOOLEAN      NOT NULL DEFAULT FALSE
);

-- Parking permits (a copy of the app's permit table).
CREATE TABLE IF NOT EXISTS portal.permits (
  permit_id   SERIAL PRIMARY KEY,
  permit_code VARCHAR(10)  NOT NULL,
  permit_name VARCHAR(80)  NOT NULL,
  issuer      VARCHAR(40)  NOT NULL,       -- BYU or City of Provo
  description TEXT
);

-- Starting login for the team and the TAs. Change the password before submitting if you like.
INSERT INTO portal.users (user_email, user_password, first_name, last_name)
VALUES ('ta@provoparking.com', 'Parking403!', 'Teaching', 'Assistant')
ON CONFLICT (user_email) DO NOTHING;

-- Fake sample users (example.com addresses) so the Users page has records to show, edit, and delete.
INSERT INTO portal.users (user_email, user_password, first_name, last_name)
VALUES
  ('jane.doe@example.com',     'Sample123!', 'Jane',  'Doe'),
  ('john.smith@example.com',   'Sample123!', 'John',  'Smith'),
  ('maria.garcia@example.com', 'Sample123!', 'Maria', 'Garcia'),
  ('alex.chen@example.com',    'Sample123!', 'Alex',  'Chen'),
  ('sam.taylor@example.com',   'Sample123!', 'Sam',   'Taylor')
ON CONFLICT (user_email) DO NOTHING;

-- Copy the real lots and permits from the live app, only if the copies are empty.
INSERT INTO portal.lots (lot_name, lot_code, operator, total_spaces, is_free)
SELECT area_name, lot_code, operator, total_spaces, is_free
FROM public.parking_area
WHERE is_sample_data = FALSE                 -- only the verified BYU lots, not the old sample rows
  AND NOT EXISTS (SELECT 1 FROM portal.lots)
ORDER BY area_name;

INSERT INTO portal.permits (permit_code, permit_name, issuer, description)
SELECT permit_code, permit_name, issuer, description
FROM public.permit
WHERE NOT EXISTS (SELECT 1 FROM portal.permits)
ORDER BY permit_code;
