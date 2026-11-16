-- Provo Parking: database schema + sample data (PostgreSQL / Supabase)
-- Permit rules and parking_rule rows are cited from BYU and Provo sources (see docs/parking-rules-reference.md).
-- Lot locations, capacities, availability, and tow companies are still SAMPLE data.

CREATE TABLE app_user (
  user_id               SERIAL PRIMARY KEY,
  display_name          VARCHAR(80)  NOT NULL,
  email                 VARCHAR(255) UNIQUE,
  location_permission   BOOLEAN      NOT NULL DEFAULT FALSE,
  notifications_enabled BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at            TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE permit (
  permit_id    SERIAL PRIMARY KEY,
  permit_code  VARCHAR(10)  NOT NULL UNIQUE,   -- e.g. 'Y', 'G', 'A'
  permit_name  VARCHAR(80)  NOT NULL,
  issuer       VARCHAR(40)  NOT NULL,          -- 'BYU' or 'City of Provo'
  description  TEXT,
  cost_note    VARCHAR(80),
  source_url   TEXT,
  last_verified_on DATE
);

-- Many-to-many: a user can hold several permits; a permit is held by many users.
CREATE TABLE user_permit (
  user_id   INT NOT NULL REFERENCES app_user(user_id) ON DELETE CASCADE,
  permit_id INT NOT NULL REFERENCES permit(permit_id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, permit_id)
);

CREATE TABLE tow_company (
  tow_company_id SERIAL PRIMARY KEY,
  company_name   VARCHAR(120) NOT NULL,
  phone          VARCHAR(20)  NOT NULL,
  is_sample_data BOOLEAN      NOT NULL DEFAULT TRUE
);

CREATE TABLE parking_area (
  area_id                  SERIAL PRIMARY KEY,
  area_name                VARCHAR(120) NOT NULL,
  lot_code                 VARCHAR(20),          -- lot type/number from the BYU parking map
  operator                 VARCHAR(40)  NOT NULL,   -- 'BYU', 'City of Provo', 'Private'
  latitude                 NUMERIC(9,6) NOT NULL,
  longitude                NUMERIC(9,6) NOT NULL,
  total_spaces             INT          NOT NULL CHECK (total_spaces >= 0),
  est_available_spaces     INT          CHECK (est_available_spaces >= 0),
  availability_updated_at  TIMESTAMPTZ,
  is_free                  BOOLEAN      NOT NULL DEFAULT FALSE,
  tow_company_id           INT REFERENCES tow_company(tow_company_id)
);

-- One area has many rules; one permit appears in many rules (permit_id NULL = open to anyone).
CREATE TABLE parking_rule (
  rule_id           SERIAL PRIMARY KEY,
  area_id           INT NOT NULL REFERENCES parking_area(area_id) ON DELETE CASCADE,
  permit_id         INT REFERENCES permit(permit_id),
  days_of_week      VARCHAR(20) NOT NULL,          -- e.g. 'Mon-Fri', 'Sat', 'All'
  start_time        TIME NOT NULL,
  end_time          TIME NOT NULL,
  max_stay_minutes  INT CHECK (max_stay_minutes > 0),  -- NULL = no limit
  blocked_start     TIME,                          -- e.g. 01:00 (no parking from)
  blocked_end       TIME,                          -- e.g. 05:00 (no parking until)
  vehicle_type      VARCHAR(20) NOT NULL DEFAULT 'car',
  source_url        TEXT NOT NULL,
  last_verified_on  DATE NOT NULL,
  rule_note         TEXT
);

-- Many-to-many: users save many areas; an area is saved by many users.
CREATE TABLE favorite_area (
  user_id     INT NOT NULL REFERENCES app_user(user_id) ON DELETE CASCADE,
  area_id     INT NOT NULL REFERENCES parking_area(area_id) ON DELETE CASCADE,
  saved_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, area_id)
);

-- Powers the Parking timer and My Car screens.
CREATE TABLE parking_session (
  session_id               SERIAL PRIMARY KEY,
  user_id                  INT NOT NULL REFERENCES app_user(user_id) ON DELETE CASCADE,
  area_id                  INT NOT NULL REFERENCES parking_area(area_id),
  started_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  planned_minutes          INT NOT NULL CHECK (planned_minutes > 0),
  leave_by                 TIMESTAMPTZ NOT NULL,
  reminder_minutes_before  INT NOT NULL DEFAULT 10,
  car_note                 VARCHAR(200),             -- e.g. 'Row C near the stairs'
  ended_at                 TIMESTAMPTZ,
  status                   VARCHAR(10) NOT NULL DEFAULT 'active'
                           CHECK (status IN ('active','ended','expired'))
);

-- ---------- SAMPLE DATA ----------
INSERT INTO app_user (display_name, email, location_permission, notifications_enabled) VALUES
  ('Emma Carter (demo)', 'emma.demo@example.com', TRUE,  TRUE),
  ('Rick Toma (demo)',   'rick.demo@example.com', FALSE, TRUE),
  ('Guest',              NULL,                    FALSE, FALSE);

INSERT INTO permit (permit_code, permit_name, issuer, description, cost_note, source_url, last_verified_on) VALUES
  ('Y',  'Y Undergraduate',            'BYU', 'Undergrads except Helaman, Heritage, Riviera residents. Valid in Y and U lots. No parking 1-5 a.m.', '$60/semester; free spring/summer', 'https://security.byu.edu/parking-regulations', '2026-10-07'),
  ('G',  'G Graduate',                 'BYU', 'Graduate students. Valid in G, Y, and U lots. No parking 1-5 a.m.', '$60/semester; free spring/summer', 'https://security.byu.edu/parking-regulations', '2026-10-07'),
  ('PP', 'Provo Residential Permit',   'City of Provo', 'Homeowners or renters with a valid rental dwelling license in a permit area. Arlington, Belmont, Highland Park, King Henry residents not eligible.', NULL, 'https://www.provo.gov/213/Pay-Parking-Citations', '2026-10-07'),
  ('A',  'A Employee',                 'BYU', 'Faculty, staff, administrators (not student employees). Valid in A, C, G, Y, and U lots. No parking 1-5 a.m.', 'Free', 'https://security.byu.edu/parking-regulations', '2026-10-07'),
  ('U',  'U Affiliated Personnel',     'BYU', 'Affiliated university personnel. Valid in U lots. No parking 1-5 a.m.', 'Free', 'https://security.byu.edu/parking-regulations', '2026-10-07'),
  ('YM', 'YM Wymount / Foreign Language', 'BYU', 'Wymount Terrace and Foreign Language residents. Valid in YM, Y, and U lots.', 'In housing contract', 'https://security.byu.edu/parking-regulations', '2026-10-07'),
  ('YV', 'YV Wyview Park',             'BYU', 'Wyview Park residents. Valid in YV, Y, and U lots.', 'In housing contract', 'https://security.byu.edu/parking-regulations', '2026-10-07'),
  ('B',  'B Heritage Halls',           'BYU', 'Heritage Halls residents. Valid in B and U lots. Overnight only in B and lot 45BCD.', '$25/month; free spring/summer', 'https://security.byu.edu/parking-regulations', '2026-10-07'),
  ('C',  'C Helaman Halls',            'BYU', 'Helaman Halls residents. Valid in C and U lots. Overnight only in C and lot 45BCD.', '$25/month; free spring/summer', 'https://security.byu.edu/parking-regulations', '2026-10-07'),
  ('D',  'D Riviera',                  'BYU', 'Riviera residents. Valid in D and U lots. Overnight only in D and lot 45BCD.', '$25/month; free spring/summer', 'https://security.byu.edu/parking-regulations', '2026-10-07'),
  ('V',  'V Visitor',                  'BYU', 'Visitors. Lots 2V, 26V, and visitor time stalls. Current students and employees may not use. No parking 1-5 a.m.', NULL, 'https://security.byu.edu/parking-regulations', '2026-10-07');

INSERT INTO user_permit (user_id, permit_id) VALUES (1,1), (2,1), (2,3);

INSERT INTO tow_company (company_name, phone) VALUES
  ('Sample Campus Towing', '801-555-0101'),
  ('Sample Provo Towing',  '801-555-0102');

-- Lot LOCATIONS and capacities are samples until checked against the BYU Campus Parking Map.
INSERT INTO parking_area (area_name, lot_code, operator, latitude, longitude, total_spaces, est_available_spaces, availability_updated_at, is_free, tow_company_id) VALUES
  ('Sample Y lot (north campus)',              'Y-SAMPLE',  'BYU',           40.2530, -111.6490, 400, 35,  now(), FALSE, 1),
  ('Sample U lot (stadium)',                   'U-SAMPLE',  'BYU',           40.2575, -111.6545, 900, 210, now(), FALSE, 1),
  ('Sample residential permit street (900 E)', 'PP-SAMPLE', 'City of Provo', 40.2480, -111.6470, 60,  5,   now(), TRUE,  2),
  ('Sample downtown garage',                   'DT-SAMPLE', 'Downtown Provo (sample)', 40.2340, -111.6580, 250, 80,  now(), FALSE, 2);

-- Cited rules. BYU: "Parking on campus is prohibited between 1:00 am and 5:00 am in all lots."
INSERT INTO parking_rule (area_id, permit_id, days_of_week, start_time, end_time, max_stay_minutes, blocked_start, blocked_end, vehicle_type, source_url, last_verified_on, rule_note)
SELECT 1, p.permit_id, 'All', '00:00', '23:59', NULL, '01:00', '05:00', 'car', 'https://security.byu.edu/parking-regulations', '2026-10-07', 'Y lot: valid for ' || p.permit_code || ' permit. No parking 1-5 a.m. in any campus lot.'
FROM permit p WHERE p.permit_code IN ('Y','G','A','YM','YV');

INSERT INTO parking_rule (area_id, permit_id, days_of_week, start_time, end_time, max_stay_minutes, blocked_start, blocked_end, vehicle_type, source_url, last_verified_on, rule_note)
SELECT 2, p.permit_id, 'All', '00:00', '23:59', NULL, '01:00', '05:00', 'car', 'https://security.byu.edu/parking-regulations', '2026-10-07', 'U lot: valid for ' || p.permit_code || ' permit. No parking 1-5 a.m. in any campus lot.'
FROM permit p WHERE p.permit_code IN ('U','Y','G','A','YM','YV','B','C','D');

INSERT INTO parking_rule (area_id, permit_id, days_of_week, start_time, end_time, max_stay_minutes, blocked_start, blocked_end, vehicle_type, source_url, last_verified_on, rule_note)
SELECT 3, p.permit_id, 'All', '00:00', '23:59', 4320, NULL, NULL, 'car', 'https://www.provo.gov/273/Parking', '2026-10-07', 'Residential permit area: mostly limited to permit holders. City streets: move 400 ft every 72 hours (not yet re-verified).'
FROM permit p WHERE p.permit_code = 'PP';

INSERT INTO parking_rule (area_id, permit_id, days_of_week, start_time, end_time, max_stay_minutes, blocked_start, blocked_end, vehicle_type, source_url, last_verified_on, rule_note) VALUES
  (4, NULL, 'All', '00:00', '23:59', NULL, NULL, NULL, 'car', 'https://www.provo.gov/273/Parking', '2026-10-07', 'Downtown: use garages for stays longer than two hours. Enforcement works around the clock.');

INSERT INTO favorite_area (user_id, area_id) VALUES (1,1), (1,3), (2,2);

INSERT INTO parking_session (user_id, area_id, started_at, planned_minutes, leave_by, car_note, ended_at, status) VALUES
  (1, 1, now() - interval '30 min', 240, now() + interval '210 min', 'Row C near stairs', NULL, 'active'),
  (2, 3, now() - interval '1 day',  90,  now() - interval '1 day' + interval '90 min', NULL, now() - interval '1 day' + interval '80 min', 'ended');
