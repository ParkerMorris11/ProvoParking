// Real PostgreSQL + row-level-security tests for supabase/migrations/20261102040636_account_sign_in.sql.
// Uses the same disposable local database as the P7 tests (see docs/parking-session-persistence.md).
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { assertDisposableTestTarget, isolatedPostgresEnvironment } from "./helpers/database-target.js";

const database = process.env.P7_TEST_DATABASE_URL;
const env = isolatedPostgresEnvironment(process.env);
const file = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const MIGRATION = "supabase/migrations/20261102040636_account_sign_in.sql";
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function run(sql) {
  const r = spawnSync(process.env.P7_PSQL || "psql",
    ["-X", "-q", "-t", "-A", "-v", "ON_ERROR_STOP=1", "-d", database, "-c", sql], { encoding: "utf8", env });
  if (r.error) throw r.error;
  if (r.status !== 0) throw new Error(r.stderr.trim());
  return r.stdout.trim();
}
const asUser = (sub, sql) =>
  run(`BEGIN; SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claims = '{"sub":"${sub}","role":"authenticated"}'; ${sql}; COMMIT;`);
const asAnon = (sql) => run(`BEGIN; SET LOCAL ROLE anon; ${sql}; COMMIT;`);
const signUp = (id, email, meta) =>
  run(`INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES ('${id}', ${email ? `'${email}'` : "NULL"}, ${meta === null ? "NULL" : `'${JSON.stringify(meta)}'::jsonb`})`);
const userIdFor = (authId) => Number(run(`SELECT user_id FROM public.app_user WHERE auth_id = '${authId}'`));

test("Account sign-in migration: profiles, permits and per-user row security", { skip: !database && "Set P7_TEST_DATABASE_URL to the disposable local test database." }, async (t) => {
  assertDisposableTestTarget(database);
  run(`
    DROP SCHEMA IF EXISTS visit_metrics_private CASCADE;
    DROP SCHEMA IF EXISTS auth CASCADE;
    DROP SCHEMA public CASCADE;
    CREATE SCHEMA public;
    CREATE SCHEMA auth;
    DO $$ BEGIN
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
    END $$;
    CREATE TABLE auth.users (id uuid PRIMARY KEY, email text, raw_user_meta_data jsonb);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid $$;
    GRANT USAGE ON SCHEMA public, auth TO anon, authenticated;
    GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated;
    -- Supabase grants table privileges to both browser roles by default; mirror that.
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated;
  `);
  // Same history as the live project: schema, original policies, later policy files, P2, P7.
  run(file("supabase/schema.sql"));
  run(file("supabase/policies.sql"));
  run(file("supabase/2026-10-14-permit-settings-policies.sql").replace(/CREATE POLICY "anyone can read (permits|parking rules)"[^;]*;/g, ""));
  run(file("supabase/migrations/20261029143325_enable_parking_reference_reads.sql"));
  run(file("supabase/migrations/20261029224555_parking_session_persistence.sql"));
  const demoBefore = run("SELECT md5(string_agg(row_to_json(f)::text, ',' ORDER BY user_id, area_id)) FROM public.favorite_area f");
  run(file(MIGRATION));
  run(file(MIGRATION)); // repeatable
  run(file("supabase/migrations/20261105032816_visit_metrics.sql"));

  await t.test("migration is repeatable and keeps demo rows", () => {
    assert.equal(run("SELECT md5(string_agg(row_to_json(f)::text, ',' ORDER BY user_id, area_id)) FROM public.favorite_area f"), demoBefore);
    assert.equal(run("SELECT count(*) FROM pg_trigger WHERE tgname = 'on_auth_user_created'"), "1");
    assert.equal(run("SELECT count(*) FROM pg_policies WHERE policyname LIKE 'demo user%'"), "0");
  });

  await t.test("sign-up creates the profile and only real, de-duplicated permits", () => {
    signUp(A, "liam@example.com", { display_name: "  Liam Tanaka  ", permit_ids: [1, 3, 3, 999, "x", "12345678901"] });
    assert.equal(run(`SELECT display_name || '|' || email FROM public.app_user WHERE auth_id = '${A}'`), "Liam Tanaka|liam@example.com");
    const codes = run(`SELECT string_agg(p.permit_code, ',' ORDER BY p.permit_code) FROM public.user_permit up
      JOIN public.permit p USING (permit_id) JOIN public.app_user u USING (user_id) WHERE u.auth_id = '${A}'`);
    assert.equal(codes, "PP,Y");
    assert.equal(run(`SELECT notifications_enabled::text || location_permission::text FROM public.app_user WHERE auth_id = '${A}'`), "truefalse");
  });

  await t.test("bad or missing metadata never blocks a sign-up", () => {
    signUp(B, "sam@example.com", { display_name: { nested: true }, permit_ids: "1,2" });
    assert.equal(run(`SELECT display_name FROM public.app_user WHERE auth_id = '${B}'`), "sam");
    assert.equal(run(`SELECT count(*) FROM public.user_permit WHERE user_id = ${userIdFor(B)}`), "0");
    const C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    signUp(C, null, null);
    assert.equal(run(`SELECT display_name FROM public.app_user WHERE auth_id = '${C}'`), "Driver");
  });

  await t.test("an email already used by a demo profile still gets an account", () => {
    const D = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
    signUp(D, "emma.demo@example.com", { display_name: "Real Emma", permit_ids: [2] });
    assert.equal(run(`SELECT display_name || '|' || coalesce(email, 'none') FROM public.app_user WHERE auth_id = '${D}'`), "Real Emma|none");
  });

  await t.test("signed-in users read reference data and only their own profile and permits", () => {
    assert.equal(asUser(A, "SELECT count(*) FROM public.parking_area"), "4");
    assert.equal(asUser(A, "SELECT count(*) > 0 FROM public.permit"), "t");
    assert.equal(asUser(A, "SELECT count(*) > 0 FROM public.parking_rule"), "t");
    assert.equal(asUser(A, "SELECT count(*) > 0 FROM public.tow_company"), "t");
    assert.equal(asUser(A, "SELECT string_agg(display_name, ',') FROM public.app_user"), "Liam Tanaka");
    assert.equal(asUser(A, "SELECT count(*) FROM public.user_permit"), "2");
    assert.equal(asUser(B, "SELECT count(*) FROM public.user_permit"), "0");
    assert.equal(asUser(A, "SELECT count(*) FROM public.favorite_area"), "0", "demo user's favorites are hidden");
  });

  await t.test("favorites: add and remove your own, never someone else's", () => {
    const a = userIdFor(A), b = userIdFor(B);
    assert.equal(asUser(A, `INSERT INTO public.favorite_area (user_id, area_id) VALUES (${a}, 4) RETURNING area_id`), "4");
    assert.equal(asUser(B, "SELECT count(*) FROM public.favorite_area"), "0");
    assert.throws(() => asUser(A, `INSERT INTO public.favorite_area (user_id, area_id) VALUES (${b}, 1)`), /row-level security/);
    assert.throws(() => asUser(A, "INSERT INTO public.favorite_area (user_id, area_id) VALUES (1, 2)"), /row-level security/);
    assert.equal(asUser(B, `DELETE FROM public.favorite_area WHERE user_id = ${a} RETURNING area_id`), "", "B cannot delete A's favorite");
    assert.equal(asUser(A, `DELETE FROM public.favorite_area WHERE user_id = ${a} AND area_id = 4 RETURNING area_id`), "4");
  });

  await t.test("My car sessions: start, note and end your own only", () => {
    const a = userIdFor(A), b = userIdFor(B);
    const id = asUser(A, `INSERT INTO public.parking_session (user_id, area_id, planned_minutes, leave_by, reminder_minutes_before, car_note)
      VALUES (${a}, 1, 60, now() + interval '60 minutes', 10, 'Row C') RETURNING session_id`);
    assert.ok(Number(id) > 0);
    assert.equal(asUser(A, `UPDATE public.parking_session SET car_note = 'Row D' WHERE session_id = ${id} RETURNING car_note`), "Row D");
    assert.equal(asUser(B, `UPDATE public.parking_session SET status = 'ended' WHERE session_id = ${id} RETURNING session_id`), "");
    assert.throws(() => asUser(A, `UPDATE public.parking_session SET user_id = ${b} WHERE session_id = ${id}`), /permission denied/);
    assert.throws(() => asUser(A, `INSERT INTO public.parking_session (user_id, area_id, planned_minutes, leave_by) VALUES (${b}, 1, 30, now())`), /row-level security/);
    assert.equal(asUser(A, `UPDATE public.parking_session SET status = 'ended', ended_at = now() WHERE session_id = ${id} RETURNING status`), "ended");
  });

  await t.test("profiles: rename yourself, but never change the link, email, or create profiles", () => {
    assert.equal(asUser(A, "UPDATE public.app_user SET display_name = 'Liam T' RETURNING display_name"), "Liam T");
    assert.throws(() => asUser(A, `UPDATE public.app_user SET auth_id = '${B}'`), /permission denied/);
    assert.throws(() => asUser(A, "UPDATE public.app_user SET email = 'x@example.com'"), /permission denied/);
    assert.throws(() => asUser(A, "INSERT INTO public.app_user (display_name) VALUES ('Fake')"), /permission denied/);
    assert.equal(asUser(B, "UPDATE public.app_user SET display_name = 'hacked' WHERE display_name = 'Liam T' RETURNING 1"), "");
  });

  await t.test("visitors read reference data but see and write no personal data", () => {
    assert.equal(asAnon("SELECT count(*) FROM public.parking_area"), "4");
    assert.equal(asAnon("SELECT count(*) > 0 FROM public.permit"), "t");
    assert.equal(asAnon("SELECT count(*) FROM public.app_user"), "0");
    assert.equal(asAnon("SELECT count(*) FROM public.user_permit"), "0");
    assert.equal(asAnon("SELECT count(*) FROM public.favorite_area"), "0");
    assert.equal(asAnon("SELECT count(*) FROM public.parking_session"), "0");
    assert.throws(() => asAnon("INSERT INTO public.favorite_area (user_id, area_id) VALUES (1, 4)"), /permission denied/);
    assert.throws(() => asAnon("INSERT INTO public.parking_session (user_id, area_id, planned_minutes, leave_by) VALUES (1, 1, 30, now())"), /permission denied/);
    assert.throws(() => asAnon("UPDATE public.parking_area SET total_spaces = 0"), /permission denied/);
  });

  await t.test("the team's existing browser-role check still passes", () => {
    run(file("supabase/tests-reference-reads.sql"));
  });

  await t.test("visit tracking links a real RLS-protected parking start without exposing visits", () => {
    const visit="11111111-1111-4111-8111-111111111111", secret="22222222-2222-4222-8222-222222222222";
    asUser(A, `select public.visit_open('${visit}','${secret}')`);
    const session = asUser(A, `insert into public.parking_session(user_id,area_id,planned_minutes,leave_by) values(${userIdFor(A)},1,30,now()+interval '30 minutes') returning session_id`);
    asUser(A, `select public.visit_bind('${visit}','${secret}')`);
    asUser(A, `select public.visit_link_account('${visit}','${secret}',${session})`);
    assert.equal(run(`select count(*) from visit_metrics_private.visit_link where parking_session_id=${session}`),"1");
    assert.throws(()=>asUser(B,"select * from public.app_visit"),/permission denied/);
    assert.throws(()=>asUser(B,`select public.visit_link_account('${visit}','${secret}',${session})`),/denied/);
  });

  await t.test("deleting an auth account removes its profile, permits and favorites", () => {
    const a = userIdFor(A);
    asUser(A, `INSERT INTO public.favorite_area (user_id, area_id) VALUES (${a}, 2)`);
    run(`DELETE FROM public.parking_session WHERE user_id = ${a}`); // sessions keep history; remove the test one first
    run(`DELETE FROM auth.users WHERE id = '${A}'`);
    assert.equal(run(`SELECT count(*) FROM public.app_user WHERE user_id = ${a}`), "0");
    assert.equal(run(`SELECT count(*) FROM public.favorite_area WHERE user_id = ${a}`), "0");
    assert.equal(run(`SELECT count(*) FROM public.user_permit WHERE user_id = ${a}`), "0");
  });
});
