import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync,readdirSync} from 'node:fs';
import {assertDisposableTestTarget,isolatedPostgresEnvironment} from './helpers/database-target.js';
import {evaluate} from '../js/domain/eligibility.js';
const db=process.env.P7_TEST_DATABASE_URL;
function query(sql){const r=spawnSync('psql',['-X','-q','-t','-A','-v','ON_ERROR_STOP=1','-d',db,'-c',sql],{encoding:'utf8',env:isolatedPostgresEnvironment(process.env)}); if(r.error) throw r.error;if(r.status)throw Error(r.stderr);return r.stdout.trim();}
test('section migration preserves old rows and creates separate rule sets',{skip:!db&&'Set disposable local database URL'},()=>{
 assertDisposableTestTarget(db);
 query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
 query(readFileSync('supabase/schema.sql','utf8'));
 query(readFileSync('supabase/migrations/20261104155225_verified_byu_lots.sql','utf8'));
 const hash=()=>query("select md5(json_build_object('favorites',(select json_agg(f order by user_id,area_id) from favorite_area f),'sessions',(select json_agg(s order by session_id) from parking_session s),'areas',(select json_agg(a order by area_id) from parking_area a),'rules',(select json_agg(r order by rule_id) from parking_rule r))::text)");
 const before=hash();
 const originalRows=()=>query("select md5(json_build_object('favorites',(select json_agg(f order by user_id,area_id) from favorite_area f),'sessions',(select json_agg(s order by session_id) from parking_session s),'areas',(select json_agg(to_jsonb(a)-'source_feature_id'-'source_feature_global_id' order by area_id) from parking_area a where area_id<=8),'rules',(select json_agg(r order by rule_id) from parking_rule r where area_id<=8))::text)");
 const original=originalRows();
 const file=readdirSync('supabase/migrations').find(x=>x.endsWith('_verified_byu_sections.sql'));
 assert.ok(file,'migration exists'); const migration=readFileSync('supabase/migrations/'+file,'utf8');
 query(migration);const after=hash();query(migration);assert.equal(hash(),after,'migration is repeatable');
 assert.equal(originalRows(),original,'existing rows and personal references unchanged');
 assert.equal(query("select count(*) from parking_area where is_sample_data"),'4');
 assert.equal(query("select count(*) from parking_area where source_feature_id is not null"),'102');
 assert.equal(query("select count(*) from parking_area where lot_code='23A' and source_feature_id in (3,11)"),'2');
 const data=JSON.parse(query("select json_agg(json_build_object('id',a.source_feature_id,'rules',(select json_agg(r) from parking_rule r where r.area_id=a.area_id))) from parking_area a where a.source_feature_id in (3,11,123,186)"));
 const permit=+query("select permit_id from permit where permit_code='Y'");
 for (const id of [123,186]) {let rules=data.find(x=>x.id===id).rules; assert.equal(evaluate(rules,permit,3,'08:00').kind,'ok');assert.equal(evaluate(rules,permit,3,'03:00').kind,'blocked');assert.equal(evaluate(rules,permit,6,'08:00').kind,'unknown');}
 const all=JSON.parse(query("select json_agg(json_build_object('id',a.source_feature_id,'area',to_jsonb(a),'rules',(select json_agg(r) from parking_rule r where r.area_id=a.area_id))) from parking_area a where a.source_feature_id is not null"));
 const manifest=JSON.parse(readFileSync('data/verified-byu-sections.json','utf8'));
 const permits=JSON.parse(query("select json_object_agg(permit_code,permit_id) from permit"));
 const allowed={A:['A'],G:['A','G'],Y:['A','G','Y','YM','YV'],U:['A','G','Y','U','B','C','D','YM','YV']};
 for(const section of manifest){
  const found=all.find(x=>x.id===section.object_id);assert.ok(found,`missing ${section.object_id}`);
  assert.equal(found.area.total_spaces,null);assert.equal(found.area.est_available_spaces,null);
  for(const code of ['A','G','Y','U','B','C','D','YM','YV','V']) assert.equal(evaluate(found.rules,permits[code],3,'08:00').kind,allowed[section.permit_type].includes(code)?'ok':'no-permit',`${section.object_id} ${code}`);
  assert.equal(evaluate(found.rules,permits.A,3,'03:00').kind,'blocked',`overnight ${section.object_id}`);
  assert.equal(evaluate(found.rules,permits.A,6,'08:00').kind,'unknown',`weekend ${section.object_id}`);
  if(section.end){assert.equal(evaluate(found.rules,permits.V,3,'06:59').kind,'ok');assert.equal(evaluate(found.rules,permits.V,3,'07:00').kind,'no-permit');assert.equal(evaluate(found.rules,permits.V,3,section.end).kind,'ok');}
 }
 const ids=query("select string_agg(area_id::text,',' order by area_id) from parking_area where lot_code in ('59Y','30G','14A','18U')"); assert.equal(ids,'5,6,7,8');
 assert.notEqual(before,after);
 query("update parking_area set source_feature_id=null where lot_code='59Y'");
 assert.throws(()=>query(migration),/Existing feature identity mismatch/,'partially assigned identity must not be silently accepted');
});
