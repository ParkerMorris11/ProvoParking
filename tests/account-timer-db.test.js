import test from "node:test";
import assert from "node:assert/strict";
import {spawn,spawnSync} from "node:child_process";
import {readFileSync} from "node:fs";
import {assertDisposableTestTarget,isolatedPostgresEnvironment} from "./helpers/database-target.js";
import {PRODUCTION_BASE,ADMIN_MIGRATION} from "./helpers/migration-order.js";
const db=process.env.P7_TEST_DATABASE_URL,env=isolatedPostgresEnvironment(process.env);
const file=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
const args=["-X","-q","-t","-A","-v","ON_ERROR_STOP=1","-d",db||""];
function sql(q){const r=spawnSync(process.env.P7_PSQL||"psql",args,{input:q,encoding:"utf8",env});if(r.error)throw r.error;if(r.status)throw new Error(r.stderr);return r.stdout.trim();}
const A="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",B="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const auth=(who,q)=>`BEGIN; SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claims='{"sub":"${who}"}'; ${q}; COMMIT;`;
const as=(who,q)=>sql(auth(who,q));
const area="(SELECT area_id FROM public.parking_area WHERE NOT is_sample_data ORDER BY area_id LIMIT 1)";
const dest="(SELECT destination_id FROM public.destination ORDER BY destination_id LIMIT 1)";
const start=`SELECT public.parking_timer_start(${area},60,10,'Private note',${dest},NULL)`;
function concurrent(q){return new Promise(resolve=>{const p=spawn(process.env.P7_PSQL||"psql",args,{env});let out="",err="";p.stdout.on("data",d=>out+=d);p.stderr.on("data",d=>err+=d);p.on("error",e=>resolve({status:1,err:e.message}));p.on("close",status=>resolve({status,out,err}));p.stdin.end(q);});}
test("account timer migration: RLS, server timestamps, one active session and concurrent starts",{skip:!db&&"Requires disposable PostgreSQL"},async(t)=>{
 assertDisposableTestTarget(db);
 sql(file("tests/fixtures/admin-okr-bootstrap.sql"));
 for(const p of PRODUCTION_BASE)sql(file(p));
 sql(file(ADMIN_MIGRATION));
 sql("DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN; END IF; END $$; GRANT USAGE ON SCHEMA public TO service_role");
 sql(`INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES ('${A}','a@test.invalid','{}'),('${B}','b@test.invalid','{}')`);
 for(let i=0;i<2;i++)as(A,`INSERT INTO public.parking_session(user_id,area_id,planned_minutes,leave_by) SELECT user_id,${area},60,now()+interval '1 hour' FROM public.app_user WHERE auth_id=auth.uid()`);
 as(B,`INSERT INTO public.parking_session(user_id,area_id,planned_minutes,leave_by) SELECT user_id,${area},60,now()-interval '1 minute' FROM public.app_user WHERE auth_id=auth.uid()`);
 const count=sql("SELECT count(*) FROM public.parking_session");
 const migration=file("supabase/migrations/20261113002000_single_account_timer.sql");
 sql(migration);sql(migration);
 sql(file("supabase/migrations/20261116210000_bound_guest_writes_and_model_usage.sql"));
 const oldLibrary = sql("SELECT destination_id || ':' || name FROM public.destination WHERE building_code='HBLL'");
 const buildingMigration = file("supabase/migrations/20261116230000_byu_campus_destinations.sql");
 sql(buildingMigration);
 sql(buildingMigration);
 const demoBudget = file("supabase/migrations/20261117160000_raise_parse_find_demo_budget.sql");
 sql(demoBudget);
 sql(demoBudget);
 assert.equal(sql("SELECT destination_id || ':' || name FROM public.destination WHERE building_code='HBLL'"), oldLibrary);
 assert.ok(Number(sql("SELECT count(*) FROM public.destination")) > 200);
 assert.ok(Number(sql("SELECT count(*) FROM public.destination")) <= 300);
 assert.equal(sql("SELECT count(*) FROM public.destination WHERE building_code='CTB'"), "1");
 assert.equal(as(A,"SELECT has_column_privilege(current_user, 'public.parking_session', 'session_id', 'INSERT')"),"f");
 assert.equal(as(A,"SELECT has_sequence_privilege(current_user, 'public.parking_session_session_id_seq', 'UPDATE')"),"f");
 assert.equal(sql("SELECT count(*) FROM public.parking_session"),count);
 assert.equal(as(A,"SELECT count(*) FROM public.parking_session WHERE status='active'"),"1");
 assert.equal(as(A,"SELECT count(*) FROM public.parking_session WHERE status='ended'"),"1");
 assert.throws(()=>as(A,start),/parking_session_one_active_per_user/);
 const first=JSON.parse(as(A,"SELECT public.parking_timer_snapshot()"));
 const other=JSON.parse(as(B,"SELECT public.parking_timer_snapshot()"));
 assert.notEqual(first.session.user_id,other.session.user_id);
 assert.equal(JSON.parse(as(A,`SELECT public.parking_timer_end(${other.session.session_id})`)).session.session_id,first.session.session_id);
 assert.equal(JSON.parse(as(A,`SELECT public.parking_timer_end(${first.session.session_id})`)).session,null);
 assert.equal(JSON.parse(as(A,`SELECT public.parking_timer_end(${first.session.session_id})`)).session,null);
 const next=JSON.parse(as(A,start));
 assert.equal(Date.parse(next.session.leave_by)-Date.parse(next.session.started_at),3600000);
 assert.ok(Math.abs(Date.parse(next.server_now)-Date.parse(next.session.started_at))<2000);
 assert.throws(()=>sql("BEGIN; SET LOCAL ROLE anon; SELECT public.parking_timer_snapshot(); COMMIT;"),/permission denied/);
 assert.equal(as(B,`SELECT count(*) FROM public.parking_session WHERE session_id=${next.session.session_id}`),"0");
 as(B,`SELECT public.parking_timer_end(${other.session.session_id})`);
 assert.equal(as(B,`SELECT status FROM public.parking_session WHERE session_id=${other.session.session_id}`),"expired");
 as(A,`SELECT public.parking_timer_end(${next.session.session_id})`);
 const races=await Promise.all([concurrent(auth(A,start+"; SELECT pg_sleep(0.2)")),concurrent(auth(A,start+"; SELECT pg_sleep(0.2)"))]);
 assert.equal(races.filter(r=>r.status===0).length,1);
 assert.match(races.find(r=>r.status!==0).err,/parking_session_one_active_per_user/);
 assert.equal(as(A,"SELECT count(*) FROM public.parking_session WHERE status='active'"),"1");
 const current=JSON.parse(as(A,"SELECT public.parking_timer_snapshot()")).session;
 assert.throws(()=>as(A,`UPDATE public.parking_session SET leave_by=now()+interval '9 hours' WHERE session_id=${current.session_id}`),/permission denied|cannot be changed/);

 await t.test("model budget permits only the server role and enforces caller and project limits", async () => {
  const call = "SELECT public.consume_parse_find_budget('192.0.2.1')";
  const server = stmt => `BEGIN; SET LOCAL ROLE service_role; ${stmt}; COMMIT;`;
  assert.equal(sql("SELECT has_function_privilege('anon','public.consume_parse_find_budget(text)','EXECUTE')"),"f");
  assert.equal(sql("SELECT has_function_privilege('authenticated','public.consume_parse_find_budget(text)','EXECUTE')"),"f");
  assert.equal(sql(server(call)),"t");
  // 199 earlier calls from this address still leave room (the old limit was 20); the 200th is refused.
  sql("UPDATE visit_metrics_private.ingress_budget SET uses=199 WHERE kind='find-client'");
  assert.equal(sql(server(call)),"t");
  assert.equal(sql(server(call)),"f");
  assert.equal(sql(server(call)),"f");
  assert.equal(sql("SELECT uses FROM visit_metrics_private.ingress_budget WHERE kind='find-day'"),"2");
  sql("UPDATE visit_metrics_private.ingress_budget SET uses=1499 WHERE kind='find-day'");
  const results = await Promise.all([
   concurrent(server("SELECT public.consume_parse_find_budget('192.0.2.2')")),
   concurrent(server("SELECT public.consume_parse_find_budget(NULL)")),
  ]);
  assert.deepEqual(results.map(result => [result.status,result.out.trim()]).sort((a,b)=>a[1].localeCompare(b[1])),[[0,"f"],[0,"t"]]);
 });

 await t.test("guest budget preserves retries, rejects expired intake, and prunes only old guest data", async () => {
  const visit = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
  const expired = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
  const capability = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  const event = "99999999-9999-4999-8999-999999999999";
  const anonymous = stmt => `BEGIN; SET LOCAL ROLE anon; ${stmt}; COMMIT;`;
  const open = id => `SELECT public.visit_open('${id}','${capability}')`;
  const complete = (id, session, started = "statement_timestamp()") => `SELECT public.visit_complete_guest('${id}','${capability}',${session},${started})`;
  sql(anonymous(open(visit)));
  sql(anonymous(open(expired)));
  sql(`UPDATE public.app_visit SET opened_at=statement_timestamp()-interval '100 days' WHERE id='${expired}';
    INSERT INTO visit_metrics_private.visit_link(visit_id,guest_session_id,completed_at)
      VALUES('${expired}',gen_random_uuid(),statement_timestamp()-interval '100 days');`);
  assert.throws(()=>sql(anonymous(complete(expired,"gen_random_uuid()","statement_timestamp()-interval '100 days'+interval '1 minute'"))),/guest visit has expired/i);
  // Start one below capacity so two simultaneous legitimate deliveries compete for the last slot.
  sql(`INSERT INTO visit_metrics_private.visit_link(visit_id,guest_session_id,completed_at)
    SELECT '${visit}',gen_random_uuid(),statement_timestamp() FROM generate_series(1,15);`);
  const results=await Promise.all([
   concurrent(anonymous(complete(visit,`'${event}'`))),
   concurrent(anonymous(complete(visit,"'88888888-8888-4888-8888-888888888888'"))),
  ]);
  assert.equal(results.filter(r=>r.status===0).length,1);
  assert.match(results.find(r=>r.status!==0).err,/guest completion limit reached/i);
  const saved=results[0].status===0?event:"88888888-8888-4888-8888-888888888888";
  sql(anonymous(complete(visit,`'${saved}'`)));
  assert.equal(sql(`SELECT count(*) FROM visit_metrics_private.visit_link WHERE visit_id='${visit}'`),"16");
  assert.equal(sql(`SELECT count(*) FROM visit_metrics_private.visit_link WHERE visit_id='${expired}'`),"0");
  assert.equal(sql("SELECT uses FROM visit_metrics_private.ingress_budget WHERE kind='guest-hour'"),"1");
 });
});
