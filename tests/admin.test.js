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
test('a timer saves its destination, writes only parking_session, and never supplies metric timestamps', async () => {
  const saved = { ...state };
  const writes = [], linked = [];
  state.user = { userId: 199 }; state.authId = 'owner-a';
  // The existing visit_metrics tracker is the only KR 2b hook.
  state.visitTracker = { captureAccount: owner => ({ id: 'visit', ownerId: owner }), accountStarted: (row, owner, visit) => { linked.push({ row, owner, visit }); return Promise.resolve(); } };
  state.db = { from(table) { return { insert(row) {
    writes.push({ table, row });
    return { select: () => ({ single: async () => ({ data: { ...row, session_id: writes.length }, error: null }) }) };
  } }; } };
  try {
    const input = { areaId: 5, minutes: 120, reminderMinutes: 10, destinationId: 2 };
    await startSession(input); await startSession(input);
    assert.deepEqual(writes.map(w => w.table), ['parking_session', 'parking_session']);
    for (const write of writes) {
      assert.equal(write.row.user_id, 199);
      assert.equal(write.row.destination_id, 2);
      assert.equal('started_at' in write.row || 'opened_at' in write.row, false);
    }
    assert.deepEqual(linked.map(l => [l.row.session_id, l.owner, l.visit.id]), [[1, 'owner-a', 'visit'], [2, 'owner-a', 'visit']]);
    const count = writes.length;
    await assert.rejects(startSession({ ...input, destinationId: null }), /Choose a destination/);
    assert.equal(writes.length, count); assert.equal(linked.length, 2);
  } finally { Object.assign(state, saved); }
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
