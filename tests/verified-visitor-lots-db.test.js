import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync,readdirSync} from 'node:fs';
import {assertDisposableTestTarget,isolatedPostgresEnvironment} from './helpers/database-target.js';
import {evaluate} from '../js/domain/eligibility.js';
import {eligibleAreas} from '../js/domain/parking-results.js';

const db = process.env.P7_TEST_DATABASE_URL;
function query(sql) {
  const r = spawnSync('psql', ['-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1', '-d', db, '-c', sql], {encoding: 'utf8', env: isolatedPostgresEnvironment(process.env)});
  if (r.error) throw r.error;
  if (r.status) throw Error(r.stderr);
  return r.stdout.trim();
}

test('visitor lot migration adds only 2V and 26V and is repeatable', {skip: !db && 'Set disposable local database URL'}, () => {
  assertDisposableTestTarget(db);
  query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  query(readFileSync('supabase/schema.sql', 'utf8'));
  query(readFileSync('supabase/migrations/20261104155225_verified_byu_lots.sql', 'utf8'));
  const sections = readdirSync('supabase/migrations').find((x) => x.endsWith('_verified_byu_sections.sql'));
  const visitors = readdirSync('supabase/migrations').find((x) => x.endsWith('_verified_byu_visitor_lots.sql'));
  assert.ok(sections && visitors, 'section and visitor migrations exist');
  query(readFileSync('supabase/migrations/' + sections, 'utf8'));

  const hash = () => query("select md5(json_build_object('favorites',(select json_agg(f order by user_id,area_id) from favorite_area f),'sessions',(select json_agg(s order by session_id) from parking_session s),'areas',(select json_agg(a order by area_id) from parking_area a),'rules',(select json_agg(r order by rule_id) from parking_rule r))::text)");
  const prior = () => query("select md5(json_build_object('areas',(select json_agg(a order by area_id) from parking_area a where source_feature_global_id is distinct from '7f6b3fc5-7fd8-493d-b35a-8fc27b385698'::uuid and source_feature_global_id is distinct from 'a71c40c0-b1f3-4003-9ac6-ea3dbf822e0a'::uuid),'rules',(select json_agg(r order by rule_id) from parking_rule r where area_id not in (select area_id from parking_area where lot_code in ('2V','26V'))))::text)");
  const beforeExisting = prior();
  const beforeAll = hash();

  const migration = readFileSync('supabase/migrations/' + visitors, 'utf8');
  query(migration);
  const after = hash();
  query(migration);
  assert.equal(hash(), after, 'migration is repeatable');
  assert.equal(prior(), beforeExisting, 'existing areas, rules, and personal references unchanged');
  assert.notEqual(beforeAll, after);

  assert.equal(query("select count(*) from parking_area where source_feature_id is not null"), '104');
  assert.equal(query("select count(*) from parking_area where lot_code in ('2V','26V') and not is_sample_data"), '2');
  assert.equal(query("select count(*) from parking_rule r join parking_area a on a.area_id=r.area_id where a.lot_code in ('2V','26V')"), '4');

  const permits = JSON.parse(query("select json_object_agg(permit_code,permit_id) from permit"));
  const rows = JSON.parse(query("select json_agg(json_build_object('lot',a.lot_code,'area',to_jsonb(a),'rules',(select json_agg(r) from parking_rule r where r.area_id=a.area_id))) from parking_area a where a.lot_code in ('2V','26V')"));
  const manifest = JSON.parse(readFileSync('data/verified-byu-visitor-lots.json', 'utf8')).sections;
  for (const section of manifest) {
    const found = rows.find((x) => x.lot === section.lot_code);
    assert.ok(found, `missing ${section.lot_code}`);
    assert.equal(found.area.source_feature_id, section.object_id);
    assert.equal(found.area.source_feature_global_id, section.global_id);
    assert.equal(Number(found.area.latitude), section.latitude);
    assert.equal(Number(found.area.longitude), section.longitude);
    assert.equal(found.area.is_free, true);
    assert.equal(found.area.total_spaces, null);
    const rules = found.rules;
    const end = section.lot_code === '2V' ? '17:59' : '15:59';
    assert.equal(evaluate(rules, permits.V, 3, '15:00').kind, 'ok', `${section.lot_code} visitor mid-day`);
    assert.equal(evaluate(rules, permits.V, 3, '07:00').kind, 'ok');
    assert.equal(evaluate(rules, permits.V, 3, end).kind, 'ok');
    assert.equal(evaluate(rules, permits.Y, 3, '15:00').kind, 'no-permit', `${section.lot_code} student mid-day`);
    assert.equal(evaluate(rules, permits.G, 3, '15:00').kind, 'no-permit');
    assert.equal(evaluate(rules, permits.A, 3, '15:00').kind, 'no-permit');
    assert.equal(evaluate(rules, permits.V, 3, '03:00').kind, 'blocked');
    assert.equal(evaluate(rules, permits.V, 3, '06:59').kind, 'unknown');
    assert.equal(evaluate(rules, permits.V, 3, section.end).kind, 'unknown');
    assert.equal(evaluate(rules, permits.Y, 3, '19:00').kind, 'unknown');
    assert.equal(evaluate(rules, permits.V, 6, '15:00').kind, 'unknown');
  }

  const all = JSON.parse(query("select json_build_object('areas',(select json_agg(a) from parking_area a),'rules',(select json_agg(r) from parking_rule r))"));
  const rulesByArea = new Map();
  for (const rule of all.rules) {
    if (!rulesByArea.has(rule.area_id)) rulesByArea.set(rule.area_id, []);
    rulesByArea.get(rule.area_id).push(rule);
  }
  const y = eligibleAreas(all.areas, rulesByArea, {permitId: permits.Y, day: 3, time: '15:00'});
  const g = eligibleAreas(all.areas, rulesByArea, {permitId: permits.G, day: 3, time: '15:00'});
  const v = eligibleAreas(all.areas, rulesByArea, {permitId: permits.V, day: 3, time: '15:00'});
  assert.equal(y.length, 33);
  assert.equal(g.length, 45);
  assert.deepEqual(v.map((area) => area.lot_code).sort(), ['26V', '2V']);

  query("update parking_area set source_feature_id=null where lot_code='2V'");
  assert.throws(() => query(migration), /Existing visitor feature identity mismatch/, 'partially assigned identity must not be silently accepted');
});
