-- Provo Parking: database schema + sample data (PostgreSQL / Supabase)
-- All parking rules, capacities, availability, and tow details below are SAMPLE data, not verified.

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
  description  TEXT
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

INSERT INTO permit (permit_code, permit_name, issuer, description) VALUES
  ('Y', 'Y Student Permit',         'BYU',           'Sample: general student lots'),
  ('G', 'G Graduate/Employee',      'BYU',           'Sample: graduate and staff lots'),
  ('PP','Provo Residential Permit', 'City of Provo', 'Sample: neighborhood street parking');

INSERT INTO user_permit (user_id, permit_id) VALUES (1,1), (2,1), (2,3);

INSERT INTO tow_company (company_name, phone) VALUES
  ('Sample Campus Towing', '801-555-0101'),
  ('Sample Provo Towing',  '801-555-0102');

INSERT INTO parking_area (area_name, operator, latitude, longitude, total_spaces, est_available_spaces, availability_updated_at, is_free, tow_company_id) VALUES
  ('Sample Lot A (north campus)', 'BYU',           40.2530, -111.6490, 400, 35,  now(), FALSE, 1),
  ('Sample Lot B (stadium)',      'BYU',           40.2575, -111.6545, 900, 210, now(), FALSE, 1),
  ('Sample 900 E street parking', 'City of Provo', 40.2480, -111.6470, 60,  5,   now(), TRUE,  2),
  ('Sample paid garage',          'Private',       40.2340, -111.6580, 250, 80,  now(), FALSE, 2);

INSERT INTO parking_rule (area_id, permit_id, days_of_week, start_time, end_time, max_stay_minutes, rule_note) VALUES
  (1, 1,    'Mon-Fri', '07:00', '17:00', NULL, 'Sample: Y permit required weekdays'),
  (1, NULL, 'Mon-Fri', '17:00', '23:59', NULL, 'Sample: open to all after 5 pm'),
  (2, 1,    'Mon-Fri', '07:00', '17:00', NULL, 'Sample: Y permit required'),
  (3, 3,    'All',     '00:00', '23:59', 120,  'Sample: 2-hour limit without residential permit'),
  (4, NULL, 'All',     '06:00', '23:00', 240,  'Sample: paid, 4-hour max');

INSERT INTO favorite_area (user_id, area_id) VALUES (1,1), (1,3), (2,2);

INSERT INTO parking_session (user_id, area_id, started_at, planned_minutes, leave_by, car_note, ended_at, status) VALUES
  (1, 1, now() - interval '30 min', 240, now() + interval '210 min', 'Row C near stairs', NULL, 'active'),
  (2, 3, now() - interval '1 day',  90,  now() - interval '1 day' + interval '90 min', NULL, now() - interval '1 day' + interval '80 min', 'ended');
