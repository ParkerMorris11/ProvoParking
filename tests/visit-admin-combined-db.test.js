// Applies every migration in production order, seeds data that exists before the admin
// migration, then drives the real visit_metrics RPCs and the admin KR 2b aggregate together.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { assertDisposableTestTarget, isolatedPostgresEnvironment } from './helpers/database-target.js';
import { PRODUCTION_BASE, ADMIN_MIGRATION } from './helpers/migration-order.js';

const db = process.env.P7_TEST_DATABASE_URL;
const file = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
function sql(query) {
  const r = spawnSync(process.env.P7_PSQL || 'psql', ['-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1', '-d', db], { input: query, encoding: 'utf8', env: isolatedPostgresEnvironment(process.env) });
  if (r.error) throw r.error;
  if (r.status !== 0) throw new Error(r.stderr);
  return r.stdout.trim();
}
const as = (sub, q) => sql(`BEGIN; SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claims='{"sub":"${sub}"}'; ${q}; COMMIT;`);
const asAnon = q => sql(`BEGIN; SET LOCAL ROLE anon; ${q}; COMMIT;`);

const ADMIN = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', D = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const SECRET = '5ec5ec5e-c5ec-45ec-85ec-5ec5ec5ec5ec';
const v = n => `20000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const REAL = '(SELECT area_id FROM public.parking_area WHERE NOT is_sample_data ORDER BY area_id LIMIT 1)';
const SAMPLE = '(SELECT area_id FROM public.parking_area WHERE is_sample_data ORDER BY area_id LIMIT 1)';
const DEST = "(SELECT destination_id FROM public.destination WHERE building_code='TEST')";

// Start a main-app timer the way js/data/sessions.js does (direct insert as the user).
const start = (sub, area, dest = 'NULL') => as(sub, `INSERT INTO public.parking_session(user_id,area_id,destination_id,started_at,planned_minutes,leave_by)
  SELECT user_id, ${area}, ${dest}, '2000-01-01', 60, now()+interval '1 hour' FROM public.app_user WHERE auth_id=auth.uid() RETURNING session_id`);
const startLegacy = (sub, area) => as(sub, `INSERT INTO public.parking_session(user_id,area_id,planned_minutes,leave_by)
  SELECT user_id, ${area}, 60, now()+interval '1 hour' FROM public.app_user WHERE auth_id=auth.uid() RETURNING session_id`);
// Open (signed out) then bind on sign-in, as visit-tracker.js open() + bind() do.
function openAndBind(n, sub) { asAnon(`SELECT public.visit_open('${v(n)}','${SECRET}')`); as(sub, `SELECT public.visit_bind('${v(n)}','${SECRET}')`); }
// Trusted test-only clock control: place a bound visit a known number of minutes before a session.
const backdate = (n, session, minutes) => sql(`UPDATE public.app_visit SET opened_at=(SELECT started_at FROM public.parking_session WHERE session_id=${session})-interval '${minutes} minutes' WHERE id='${v(n)}'`);
const link = (n, sub, session) => as(sub, `SELECT public.visit_link_account('${v(n)}','${SECRET}',${session})`);
const linkedVisit = session => sql(`SELECT visit_id FROM visit_metrics_private.visit_link WHERE parking_session_id=${session}`);
const metrics = () => JSON.parse(as(ADMIN, 'SELECT public.get_admin_okr_metrics()'));
const snapshot = () => sql(`SELECT md5(string_agg(t, '|' ORDER BY t)) FROM (
  SELECT 'u'||row(u.*)::text t FROM public.app_user u UNION ALL SELECT 'f'||row(f.*)::text FROM public.favorite_area f
  UNION ALL SELECT 'p'||row(p.user_id,p.permit_id)::text FROM public.user_permit p
  UNION ALL SELECT 's'||row(s.session_id,s.user_id,s.area_id,s.started_at,s.planned_minutes,s.leave_by,s.status,s.car_note)::text FROM public.parking_session s
  UNION ALL SELECT 'v'||row(v.*)::text FROM public.app_visit v UNION ALL SELECT 'l'||row(l.*)::text FROM visit_metrics_private.visit_link l) x`);

test('visit_metrics + admin OKR applied together in production order', { skip: !db && 'Set the disposable local test database URL.' }, () => {
  assertDisposableTestTarget(db);
  sql(file('tests/fixtures/admin-okr-bootstrap.sql'));
  for (const path of PRODUCTION_BASE) sql(file(path));
  sql(`INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES
    ('${ADMIN}','admin@admin.provoparking.invalid','{}'), ('${B}','b@example.com','{}'),
    ('${C}','c@example.com','{}'), ('${D}','d@example.com','{}')`);

  // ---- Production state before the admin migration ----
  as(B, `INSERT INTO public.favorite_area(user_id,area_id) SELECT user_id, ${REAL} FROM public.app_user WHERE auth_id=auth.uid()`);
  as(C, `INSERT INTO public.favorite_area(user_id,area_id) SELECT user_id, ${REAL} FROM public.app_user WHERE auth_id=auth.uid()`);
  openAndBind(1, B);
  const legacy = startLegacy(B, REAL);
  backdate(1, legacy, 6); link(1, B, legacy);
  asAnon(`SELECT public.visit_open('${v(2)}','${SECRET}')`); // unbound visit that never reached sign-in
  const before = snapshot();
  const visitColumns = () => sql(`SELECT string_agg(column_name||':'||data_type, ',' ORDER BY ordinal_position) FROM information_schema.columns WHERE table_schema='public' AND table_name='app_visit'`);
  const visitGrants = () => sql(`SELECT count(*) FROM information_schema.role_table_grants WHERE table_schema='public' AND table_name='app_visit' AND grantee IN ('anon','authenticated','PUBLIC')`);
  const columnsBefore = visitColumns();

  // ---- The admin migration, twice (repeatable) ----
  sql(file(ADMIN_MIGRATION)); sql(file(ADMIN_MIGRATION));
  sql(`INSERT INTO parking_private.admin_account(auth_id) VALUES ('${ADMIN}')`);

  assert.equal(snapshot(), before, 'existing users, permits, favorites, sessions, visits and links are untouched');
  assert.equal(visitColumns(), columnsBefore);
  assert.equal(columnsBefore, 'id:uuid,secret_hash:bytea,owner_id:uuid,opened_at:timestamp with time zone');
  assert.equal(visitGrants(), '0', 'browser roles still have no direct app_visit privileges');
  assert.equal(sql(`SELECT destination_id IS NULL FROM public.parking_session WHERE session_id=${legacy}`), 't', 'no destination is backfilled');

  // ---- Access boundaries ----
  assert.throws(() => asAnon('SELECT public.get_admin_okr_metrics()'), /permission denied/);
  assert.throws(() => as(B, 'SELECT public.get_admin_okr_metrics()'), /Admin access required/);
  assert.throws(() => sql(`BEGIN; SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claims='{"sub":"${B}","app_metadata":{"role":"admin"}}'; SELECT public.get_admin_okr_metrics(); COMMIT;`), /Admin access required/);
  for (const q of ['SELECT * FROM public.app_visit', 'SELECT * FROM visit_metrics_private.visit_link', 'SELECT * FROM parking_private.admin_account',
    `INSERT INTO public.app_visit(id,secret_hash,owner_id) VALUES (gen_random_uuid(),'\\x00',auth.uid())`]) {
    assert.throws(() => as(B, q), /permission denied/, q);
    assert.throws(() => asAnon(q), /permission denied/, q);
  }
  assert.throws(() => as(C, `SELECT public.visit_link_account('${v(1)}','${SECRET}',${legacy})`), /denied/i, 'another user cannot reuse a visit');
  assert.equal(as(C, 'SELECT count(*) FROM public.parking_session'), '0', 'per-user RLS on sessions still holds');

  // ---- Timer behavior with both hooks active ----
  sql(`INSERT INTO public.destination(building_code,name,latitude,longitude,source_url,verified_on)
    SELECT 'TEST','Test building', latitude+1, longitude, 'https://example.com', current_date FROM public.parking_area WHERE area_id=${REAL}`);
  // B: two more visits; the session links to the latest one in the hour before it started
  // (the legacy visit, ~6 minutes back, is older than visit 4).
  openAndBind(3, B); openAndBind(4, B);
  const s1 = start(B, REAL, DEST);
  assert.notEqual(sql(`SELECT started_at FROM public.parking_session WHERE session_id=${s1}`), '2000-01-01 00:00:00+00', 'server stamps the start time');
  backdate(3, s1, 30); backdate(4, s1, 3); link(3, B, s1);
  assert.equal(linkedVisit(s1), v(4));
  link(4, B, s1); assert.equal(sql(`SELECT count(*) FROM visit_metrics_private.visit_link WHERE parking_session_id=${s1}`), '1', 'link is idempotent');
  assert.throws(() => as(B, `UPDATE public.parking_session SET started_at=now() WHERE session_id=${s1}`), /permission denied|cannot be changed/);
  as(B, `UPDATE public.parking_session SET status='ended', ended_at=now() WHERE session_id=${s1}`);
  assert.equal(linkedVisit(s1), v(4), 'ending a timer keeps its link');
  // B: second timer, newer visit, 1 minute.
  openAndBind(5, B); const s2 = start(B, REAL, DEST); backdate(5, s2, 1); link(5, B, s2);
  assert.equal(linkedVisit(s2), v(5));
  // B: sample-lot session is linked but excluded from real-lot metrics.
  openAndBind(6, B); const sSample = start(B, SAMPLE, DEST); backdate(6, sSample, 0.5); link(6, B, sSample);
  // C: opened while signed out, 20 minutes before parking (sign-in screen time counts).
  openAndBind(7, C); const s3 = start(C, REAL, DEST); backdate(7, s3, 20); link(7, C, s3);
  // D: only visit is 61 minutes old -> no link, session stays unmatched.
  openAndBind(8, D); const s4 = start(D, REAL, DEST); backdate(8, s4, 61); link(8, D, s4);
  assert.equal(linkedVisit(s4), '');
  // Admin's own timer is linked but excluded.
  openAndBind(9, ADMIN); const sAdmin = start(ADMIN, REAL, DEST); backdate(9, sAdmin, 2); link(9, ADMIN, sAdmin);
  // Guest timer (client-reported start) is stored separately and not in the admin metric.
  asAnon(`SELECT public.visit_open('${v(10)}','${SECRET}')`);
  asAnon(`SELECT public.visit_complete_guest('${v(10)}','${SECRET}','30000000-0000-4000-8000-000000000001',statement_timestamp())`);

  // ---- Accurate metrics ----
  const m = metrics();
  assert.equal(m.signups, 3);
  assert.equal(m.favorites_count, 2);
  assert.equal(m.total_sessions, 5, 'legacy + s1 + s2 + s3 + s4 (sample lot and admin excluded)');
  assert.equal(m.parking_sessions, 4, 'legacy(6) + s1(3) + s2(1) + s3(20); s4 unmatched; guest excluded');
  assert.ok(Math.abs(m.parking_average_minutes - (6 + 3 + 1 + 20) / 4) < 1e-6, JSON.stringify(m));
  assert.equal(m.distance_sessions, 4, 'legacy session has no destination');
  assert.ok(Math.abs(m.distance_average_miles - 3958.7613 * Math.PI / 180) < 1e-6, JSON.stringify(m));
  for (const key of ['email', 'auth_id', 'user_id', 'visit_id']) assert.equal(key in m, false);

  // The repo's operator KR 2b query still agrees on account-linked sessions (it includes admin/sample too).
  const [accountSessions, , guestSessions] = sql(file('supabase/queries/kr-2b.sql')).split('|');
  assert.equal(accountSessions, '6'); assert.equal(guestSessions, '1');

  // Revocation is immediate.
  sql(`DELETE FROM parking_private.admin_account WHERE auth_id='${ADMIN}'`);
  assert.throws(() => metrics(), /Admin access required/);
});
