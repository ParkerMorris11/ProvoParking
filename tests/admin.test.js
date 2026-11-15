import test from 'node:test';
import assert from 'node:assert/strict';
import { adminIdentity, METRICS, metricPresentation } from '../js/domain/admin.js';
import { state } from '../js/state.js';
import { startSession } from '../js/data/sessions.js';
import { readFile } from 'node:fs/promises';

test('username login normalizes identifiers and rejects email/unsafe input', () => {
  assert.equal(adminIdentity(' Parking-Admin '), 'parking-admin@admin.provoparking.invalid');
  for (const value of ['', 'ab', 'admin@example.com', '<admin>', 'a'.repeat(33), ' space name ', '1admin']) assert.throws(() => adminIdentity(value));
});
test('OKR thresholds use raw values and distinguish no data from zero', () => {
  assert.equal(metricPresentation(METRICS[0], 25).status, 'Target met');
  assert.equal(metricPresentation(METRICS[0], 24).kind, 'pending');
  assert.equal(metricPresentation(METRICS[1], null).status, 'No data yet');
  assert.equal(metricPresentation(METRICS[1], 0).value, '0');
  assert.equal(metricPresentation(METRICS[1], 2).kind, 'met');
  assert.equal(metricPresentation(METRICS[2], 1).kind, 'pending');
  assert.equal(metricPresentation(METRICS[2], .999).kind, 'met');
  assert.equal(metricPresentation(METRICS[2], .999).value, '< 1');
  assert.equal(metricPresentation(METRICS[3], 15).kind, 'met');
  assert.equal(metricPresentation(METRICS[3], 15.001).kind, 'pending');
  assert.equal(metricPresentation(METRICS[3], 15.001).value, '> 15');
});
test('a timer sends only preferences to the account RPC and links only confirmed starts',async()=>{
 const saved={...state},calls=[],linked=[];
 state.user={userId:199};state.authId='owner-a';
 state.visitTracker={captureAccount:()=>({id:'visit'}),accountStarted:row=>{linked.push(row);return Promise.resolve();}};
 state.db={rpc:async(name,args)=>{calls.push({name,args});return {data:{session:{session_id:44},server_now:new Date().toISOString()},error:null};}};
 try{
  await startSession({areaId:5,minutes:120,reminderMinutes:10,destinationId:2,permitId:1});
  assert.equal(calls[0].name,'parking_timer_start');
  assert.equal(calls[0].args.p_destination_id,2);
  assert.equal('started_at' in calls[0].args || 'leave_by' in calls[0].args || 'user_id' in calls[0].args,false);
  assert.deepEqual(linked,[{session_id:44}]);
  await assert.rejects(startSession({areaId:5,minutes:120,reminderMinutes:10,destinationId:null}),/Choose a destination/);
  assert.equal(calls.length,1);
 }finally{Object.assign(state,saved);}
});

test('the removed open_token visit hook is not called by the app', async () => {
  for (const path of ['js/main.js', 'js/data/sessions.js']) {
    const source = await readFile(new URL(`../${path}`, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /recordAppVisit|open_token|from\(["']app_visit/);
  }
});
test('deployment includes the admin page and ten sourced destinations', async () => {
  const workflow = await readFile(new URL('../.github/workflows/pages.yml', import.meta.url), 'utf8');
  assert.match(workflow, /cp index.html admin.html/);
  const data = JSON.parse(await readFile(new URL('../data/byu-destinations.json', import.meta.url), 'utf8'));
  assert.equal(data.buildings.length, 10);
  for (const b of data.buildings) {
    assert.ok(b.latitude > 40.24 && b.latitude < 40.26);
    assert.ok(b.longitude > -111.66 && b.longitude < -111.64);
    assert.match(b.source_url, /^https:\/\/services.arcgis.com\/FvF9MZKp3JWPrSkg\//);
  }
});
