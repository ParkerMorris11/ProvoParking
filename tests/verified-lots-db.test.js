import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {assertDisposableTestTarget,isolatedPostgresEnvironment} from './helpers/database-target.js';
import {evaluate} from '../js/domain/eligibility.js';
import {eligibleAreas,eligibleMapFeatures} from '../js/domain/parking-results.js';
const db=process.env.P7_TEST_DATABASE_URL;
const sqlFile=new URL('../supabase/migrations/20261104155225_verified_byu_lots.sql',import.meta.url);
function query(sql){const r=spawnSync(process.env.P7_PSQL||'psql',['-X','-q','-t','-A','-v','ON_ERROR_STOP=1','-d',db,'-c',sql],{encoding:'utf8',env:isolatedPostgresEnvironment(process.env)});if(r.error)throw r.error;if(r.status)throw Error(r.stderr);return r.stdout.trim();}
test('verified BYU lot migration and real rule evaluation',{skip:!db&&'Set the disposable local database URL.'},async t=>{
 assertDisposableTestTarget(db);
 query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
 query(readFileSync(new URL('../supabase/schema.sql',import.meta.url),'utf8'));
 const personalHash=()=>query("select md5(json_build_object('users',(select json_agg(u order by user_id) from app_user u),'permits',(select json_agg(p order by user_id,permit_id) from user_permit p),'favorites',(select json_agg(f order by user_id,area_id) from favorite_area f),'sessions',(select json_agg(s order by session_id) from parking_session s))::text)");
 const before=personalHash();
 query(readFileSync(sqlFile,'utf8'));
 query(readFileSync(sqlFile,'utf8'));
 assert.equal(personalHash(),before,'personal rows must be byte-for-byte unchanged');
 const lots=JSON.parse(query("select coalesce(json_agg(a),'[]') from parking_area a where lot_code in ('59Y','30G','14A','18U')"));
 await t.test('four real lots are repeatable without relabeling samples or inventing occupancy',()=>{
  assert.equal(lots.length,4);
  assert.equal(query("select count(*) from parking_area where area_name like 'Sample%'"),'4');
  for(const a of lots){assert.equal(a.is_sample_data,false);assert.equal(a.total_spaces,null);assert.equal(a.est_available_spaces,null);assert.equal(a.tow_company_id,null);}
 });
 const permits=JSON.parse(query('select json_object_agg(permit_code,permit_id) from permit'));
 const rules=JSON.parse(query('select json_agg(r) from parking_rule r'));
 await t.test('Areas and map filters use the real stored permit matrix and hour boundaries',()=>{
  const byArea=new Map(lots.map(a=>[a.area_id,rules.filter(r=>r.area_id===a.area_id)]));
  const features=JSON.parse(readFileSync(new URL('../data/byu-campus-parking.json',import.meta.url),'utf8')).features;
  for(const [permit,day,time,expected] of [
   ['G',3,'08:00',['18U','30G','59Y']], ['U',3,'08:00',['18U']],
   ['U',3,'16:00',['18U','30G','59Y']], ['U',3,'18:59',['18U','30G','59Y']],
   ['U',3,'19:00',['14A','18U','30G','59Y']], ['U',3,'01:00',[]],
   ['V',6,'08:00',['14A','18U','30G','59Y']],
  ]){
   const visible=eligibleAreas(lots,byArea,{permitId:permits[permit],day,time});
   assert.deepEqual(visible.map(a=>a.lot_code).sort(),expected);
   assert.deepEqual(eligibleMapFeatures(features,visible).map(f=>f.properties.Lot_Type).sort(),expected);
  }
 });
 const check=(code,permit,day,time,kind)=>{
  const area=lots.find(a=>a.lot_code===code);assert.ok(area,'missing '+code);
  assert.equal(evaluate(rules.filter(r=>r.area_id===area.area_id),permit==null?null:permits[permit],day,time).kind,kind,[code,permit,day,time].join(' '));
 };
 await t.test('verified daytime permit matrix rejects other permit categories',()=>{
  for(const [lot,yes,no] of [['59Y',['Y','G','A','YM','YV'],['U','V','B','PP']],['30G',['G','A'],['Y','U','V','PP']],['14A',['A'],['G','Y','U','V','PP']],['18U',['U','Y','G','A','B','C','D','YM','YV'],['V','PP']]]){
   for(const p of yes)check(lot,p,3,'08:00','ok');for(const p of no)check(lot,p,3,'08:00','no-permit');
  }
 });
 await t.test('weekday enforcement starts at 07:00 and ends at recorded 16:00 or 19:00',()=>{
  for(const [lot,end,last] of [['59Y','16:00','15:59'],['30G','16:00','15:59'],['14A','19:00','18:59']]){
   check(lot,'V',3,'06:59','ok');check(lot,'V',3,'07:00','no-permit');check(lot,'V',3,last,'no-permit');check(lot,'V',3,end,'ok');
   check(lot,'V',6,'08:00','ok');check(lot,'V',0,'08:00','ok');
  }
  check('18U','V',3,'16:00','no-permit');check('18U','U',6,'08:00','ok');
  check('18U','V',6,'08:00','ok');check('18U','V',0,'08:00','ok');
 });
 await t.test('overnight ban blocks all choices exactly from 01:00 until 05:00',()=>{
  for(const lot of ['59Y','30G','14A','18U'])for(const day of [0,3,6]){
   const valid=lot==='14A'?'A':lot==='30G'?'G':'Y';
   check(lot,valid,day,'00:59','ok');check(lot,valid,day,'01:00','blocked');check(lot,'PP',day,'03:00','blocked');check(lot,null,day,'04:59','blocked');check(lot,valid,day,'05:00','ok');
  }
 });
 await t.test('every real rule retains current official provenance and verification date',()=>{
  const ids=new Set(lots.map(a=>a.area_id));const actual=rules.filter(r=>ids.has(r.area_id));assert.ok(actual.length>10);
  for(const r of actual){assert.match(r.source_url,/^https:\/\/(security\.byu\.edu|services\.arcgis\.com)\//);assert.equal(r.last_verified_on,'2026-11-04');assert.match(r.rule_note,/ordinary|overnight|registered/i);}
 });
});
