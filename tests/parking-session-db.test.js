import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync, spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { sessionFromRow, getSessionTiming } from "../js/domain/session-contract.js";

const database = process.env.P7_TEST_DATABASE_URL;
const ownerA = "11111111-1111-4111-8111-111111111111";
const ownerB = "22222222-2222-4222-8222-222222222222";
const migration = new URL("../supabase/migrations/20261029224555_parking_session_persistence.sql", import.meta.url);
function query(sql) {
  const result = spawnSync(process.env.P7_PSQL || "psql", ["-X", "-q", "-t", "-A", "-v", "ON_ERROR_STOP=1", "-d", database, "-c", sql], { encoding: "utf8" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr.trim());
  return result.stdout.trim();
}
const asUser = (owner, sql) => query(`BEGIN; SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claims = '{"sub":"${owner}"}'; ${sql}; COMMIT;`);
const createSql = "select row_to_json(s) from public.p7_create_parking_session('Library garage',120,10,'lot-42',40,-111,'Row C',false) s";
function concurrentQuery(owner, sql) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.env.P7_PSQL || "psql", ["-X", "-q", "-t", "-A", "-v", "ON_ERROR_STOP=1", "-d", database,
      "-c", `BEGIN; SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claims = '{"sub":"${owner}"}'; ${sql}; COMMIT;`]);
    let output = "", error = "";
    child.stdout.on("data", data => output += data);
    child.stderr.on("data", data => error += data);
    child.on("error", reject);
    child.on("close", status => resolve({ status, output: output.trim(), error }));
  });
}

test("P7 PostgreSQL persistence and real RLS", { skip: !database && "Set P7_TEST_DATABASE_URL to the disposable local test database." }, async (t) => {
  // Fixtures may never run against a Supabase project, remote host, or another local DB.
  const url = new URL(database);
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname), "Database tests are local-only.");
  assert.equal(url.pathname, "/provo_parking_p7_test", "Use the exact disposable test database name.");
  query(`
    DROP SCHEMA IF EXISTS auth CASCADE;
    DROP SCHEMA public CASCADE;
    CREATE SCHEMA public;
    CREATE SCHEMA auth;
    DO $$ BEGIN
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
    END $$;
    CREATE TABLE auth.users(id uuid PRIMARY KEY);
    INSERT INTO auth.users VALUES ('${ownerA}'), ('${ownerB}');
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT (current_setting('request.jwt.claims',true)::jsonb ->> 'sub')::uuid $$;
    GRANT USAGE ON SCHEMA public, auth TO anon, authenticated;
    GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated;
  `);
  query(readFileSync(new URL("../supabase/schema.sql", import.meta.url), "utf8"));
  query(readFileSync(new URL("../supabase/policies.sql", import.meta.url), "utf8"));
  const legacyBefore = query("select md5(string_agg(row_to_json(s)::text,',' order by session_id)) from public.parking_session s");
  query(readFileSync(migration, "utf8"));
  query(readFileSync(migration, "utf8"));

  let first;
  await t.test("additive migration is repeatable and preserves legacy session rows", () => {
    assert.equal(query("select md5(string_agg(row_to_json(s)::text,',' order by session_id)) from public.parking_session s"), legacyBefore);
    assert.equal(query("select count(*) from public.owned_parking_session"), "0");
  });
  await t.test("creates with server ownership, UTC times, and location snapshot", () => {
    first = JSON.parse(asUser(ownerA, createSql));
    assert.equal(first.owner_id, ownerA);
    assert.equal(first.location_name, "Library garage");
    assert.equal(Date.parse(first.expires_at) - Date.parse(first.started_at), 120 * 60000);
    assert.equal(first.created_at, first.started_at);
  });
  await t.test("fresh process/connection retrieves the same durable session and reconstructs time", () => {
    const restored = JSON.parse(asUser(ownerA, "select row_to_json(s) from public.p7_get_active_parking_session() s"));
    assert.equal(restored.id, first.id);
    assert.equal(restored.started_at, first.started_at);
    const timing = getSessionTiming(sessionFromRow(restored), Date.parse(restored.started_at) + 90 * 60000);
    assert.equal(timing.remainingMs, 30 * 60000);
    assert.equal(timing.elapsedMs, 90 * 60000);
    assert.equal(getSessionTiming(sessionFromRow(restored), Date.parse(restored.expires_at) + 1).phase, "expired");
  });
  await t.test("another owner cannot read or end the first owner's session", () => {
    assert.equal(asUser(ownerB, "select count(*) from public.p7_get_active_parking_session()"), "0");
    assert.equal(asUser(ownerB, `select count(*) from public.owned_parking_session where id='${first.id}'`), "0");
    assert.throws(() => asUser(ownerB, `select * from public.p7_end_parking_session('${first.id}')`), /Session not found/);
    assert.equal(asUser(ownerB, `update public.owned_parking_session set status='completed' where id='${first.id}' returning id`), "");
  });
  await t.test("anonymous access and forged ownership/timestamps are denied at the database", () => {
    assert.throws(() => query("set role anon; select * from public.p7_get_active_parking_session()"), /permission denied/);
    assert.throws(() => query("set role anon; select * from public.owned_parking_session"), /permission denied/);
    assert.throws(() => asUser(ownerB, `insert into public.owned_parking_session(owner_id,location_name,duration_minutes) values('${ownerA}','Spoof',120)`), /permission denied/);
    assert.throws(() => asUser(ownerA, `update public.owned_parking_session set owner_id='${ownerB}' where id='${first.id}'`), /permission denied/);
    assert.throws(() => asUser(ownerA, `update public.owned_parking_session set started_at=now() where id='${first.id}'`), /permission denied/);
    assert.throws(() => query("set role authenticated; select * from public.p7_get_active_parking_session()"), /Sign in/);
  });
  await t.test("database enforces input validation even when JavaScript is bypassed", () => {
    for (const call of [
      "public.p7_create_parking_session('Garage',45)",
      "public.p7_create_parking_session('Garage',30,30)",
      "public.p7_create_parking_session('Garage',120,7)",
      "public.p7_create_parking_session('',120)",
      "public.p7_create_parking_session('Garage',120,10,null,91,0)",
      "public.p7_create_parking_session('Garage',120,10,null,40,null)",
      "public.p7_create_parking_session('Garage',120,10,null,'NaN'::float8,0)",
      "public.p7_create_parking_session('Garage',120,10,null,null,null,repeat('x',201))",
    ]) assert.throws(() => asUser(ownerB, `select * from ${call}`), /constraint|too long/);
  });
  await t.test("duplicate starts are rejected by the unique active-owner index", () => {
    assert.throws(() => asUser(ownerA, createSql), /unique constraint/);
  });
  await t.test("ending is idempotent and completed sessions are no longer active", () => {
    const ended = JSON.parse(asUser(ownerA, `select row_to_json(s) from public.p7_end_parking_session('${first.id}') s`));
    const again = JSON.parse(asUser(ownerA, `select row_to_json(s) from public.p7_end_parking_session('${first.id}') s`));
    assert.equal(ended.status, "completed");
    assert.ok(ended.completed_at);
    assert.equal(ended.completed_at, again.completed_at);
    assert.equal(asUser(ownerA, "select count(*) from public.p7_get_active_parking_session()"), "0");
    assert.throws(() => asUser(ownerA, `update public.owned_parking_session set status='active' where id='${first.id}'`), /never reopened/);
  });
  await t.test("can create a later session with no map coordinates or location ID", () => {
    const next = JSON.parse(asUser(ownerA, "select row_to_json(s) from public.p7_create_parking_session('Street parking',30,0) s"));
    assert.notEqual(next.id, first.id);
    assert.equal(next.latitude, null);
    assert.equal(next.longitude, null);
    assert.equal(next.location_id, null);
  });
  await t.test("racing creates leave exactly one active session; racing ends preserve one completion time", async () => {
    const creates = await Promise.all([concurrentQuery(ownerB, createSql), concurrentQuery(ownerB, createSql)]);
    assert.equal(creates.filter(result => result.status === 0).length, 1);
    assert.match(creates.find(result => result.status !== 0).error, /unique constraint/);
    const created = JSON.parse(creates.find(result => result.status === 0).output);
    const endSql = `select row_to_json(s) from public.p7_end_parking_session('${created.id}') s`;
    const ends = await Promise.all([concurrentQuery(ownerB, endSql), concurrentQuery(ownerB, endSql)]);
    assert.ok(ends.every(result => result.status === 0));
    assert.equal(JSON.parse(ends[0].output).completed_at, JSON.parse(ends[1].output).completed_at);
    assert.equal(asUser(ownerB, "select count(*) from public.p7_get_active_parking_session()"), "0");
  });
});
