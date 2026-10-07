-- One-time update for the existing Supabase project (already applied: new columns + new permits A, U, YM, YV, B, C, D, V).
-- Paste into Supabase > SQL Editor and click Run. Safe to run once. Fresh installs use schema.sql instead.
BEGIN;

UPDATE permit SET permit_name='Y Undergraduate', description='Undergrads except Helaman, Heritage, Riviera residents. Valid in Y and U lots. No parking 1-5 a.m.', cost_note='$60/semester; free spring/summer', source_url='https://security.byu.edu/parking-regulations', last_verified_on='2026-10-07' WHERE permit_code='Y';
UPDATE permit SET permit_name='G Graduate', description='Graduate students. Valid in G, Y, and U lots. No parking 1-5 a.m.', cost_note='$60/semester; free spring/summer', source_url='https://security.byu.edu/parking-regulations', last_verified_on='2026-10-07' WHERE permit_code='G';
UPDATE permit SET permit_name='Provo Residential Permit', description='Homeowners or renters with a valid rental dwelling license in a permit area. Arlington, Belmont, Highland Park, King Henry residents not eligible.', source_url='https://www.provo.gov/213/Pay-Parking-Citations', last_verified_on='2026-10-07' WHERE permit_code='PP';

UPDATE parking_area SET area_name='Sample Y lot (north campus)', lot_code='Y-SAMPLE' WHERE area_name='Sample Lot A (north campus)';
UPDATE parking_area SET area_name='Sample U lot (stadium)', lot_code='U-SAMPLE' WHERE area_name='Sample Lot B (stadium)';
UPDATE parking_area SET area_name='Sample residential permit street (900 E)', lot_code='PP-SAMPLE' WHERE area_name='Sample 900 E street parking';
UPDATE parking_area SET area_name='Sample downtown garage', lot_code='DT-SAMPLE', operator='Downtown Provo (sample)' WHERE area_name='Sample paid garage';

-- Replace the 5 made-up sample rules with cited ones.
DELETE FROM parking_rule;
INSERT INTO parking_rule (area_id, permit_id, days_of_week, start_time, end_time, max_stay_minutes, blocked_start, blocked_end, vehicle_type, source_url, last_verified_on, rule_note)
SELECT a.area_id, p.permit_id, 'All', '00:00', '23:59', NULL, '01:00', '05:00', 'car', 'https://security.byu.edu/parking-regulations', '2026-10-07', 'Y lot: valid for ' || p.permit_code || ' permit. No parking 1-5 a.m. in any campus lot.'
FROM permit p, parking_area a WHERE a.lot_code='Y-SAMPLE' AND p.permit_code IN ('Y','G','A','YM','YV');
INSERT INTO parking_rule (area_id, permit_id, days_of_week, start_time, end_time, max_stay_minutes, blocked_start, blocked_end, vehicle_type, source_url, last_verified_on, rule_note)
SELECT a.area_id, p.permit_id, 'All', '00:00', '23:59', NULL, '01:00', '05:00', 'car', 'https://security.byu.edu/parking-regulations', '2026-10-07', 'U lot: valid for ' || p.permit_code || ' permit. No parking 1-5 a.m. in any campus lot.'
FROM permit p, parking_area a WHERE a.lot_code='U-SAMPLE' AND p.permit_code IN ('U','Y','G','A','YM','YV','B','C','D');
INSERT INTO parking_rule (area_id, permit_id, days_of_week, start_time, end_time, max_stay_minutes, blocked_start, blocked_end, vehicle_type, source_url, last_verified_on, rule_note)
SELECT a.area_id, p.permit_id, 'All', '00:00', '23:59', 4320, NULL, NULL, 'car', 'https://www.provo.gov/273/Parking', '2026-10-07', 'Residential permit area: mostly limited to permit holders. City streets: move 400 ft every 72 hours (not yet re-verified).'
FROM permit p, parking_area a WHERE a.lot_code='PP-SAMPLE' AND p.permit_code='PP';
INSERT INTO parking_rule (area_id, permit_id, days_of_week, start_time, end_time, max_stay_minutes, blocked_start, blocked_end, vehicle_type, source_url, last_verified_on, rule_note)
SELECT a.area_id, NULL, 'All', '00:00', '23:59', NULL, NULL, NULL, 'car', 'https://www.provo.gov/273/Parking', '2026-10-07', 'Downtown: use garages for stays longer than two hours. Enforcement works around the clock.'
FROM parking_area a WHERE a.lot_code='DT-SAMPLE';

ALTER TABLE parking_rule ALTER COLUMN source_url SET NOT NULL, ALTER COLUMN last_verified_on SET NOT NULL;

COMMIT;

-- Check: expect 11 permits, 16 rules.
SELECT (SELECT count(*) FROM permit) AS permits, (SELECT count(*) FROM parking_rule) AS rules;
