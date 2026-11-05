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
test('a timer records one visit, saves its destination, and never supplies metric timestamps', async () => {
  const saved = { ...state };
  const writes = [];
  state.user = { userId: 199 };
  state.db = { from(table) { return { insert(row) {
    writes.push({ table, row });
    if (table === 'app_visit') return Promise.resolve({ error: null });
    return { select: () => ({ single: async () => ({ data: { ...row, session_id: 1 }, error: null }) }) };
  } }; } };
  try {
    const input = { areaId: 5, minutes: 120, reminderMinutes: 10, destinationId: 2 };
    await startSession(input); await startSession(input);
    assert.equal(writes.filter(w => w.table === 'app_visit').length, 1);
    for (const write of writes) {
      assert.equal(write.row.user_id, 199);
      assert.equal('started_at' in write.row || 'opened_at' in write.row, false);
      if (write.table === 'parking_session') assert.equal(write.row.destination_id, 2);
    }
    const count = writes.length;
    await assert.rejects(startSession({ ...input, destinationId: null }), /Choose a destination/);
    assert.equal(writes.length, count);
  } finally { Object.assign(state, saved); }
});
test('a visit failure retries and an account change cannot create a session for the replacement user', async () => {
  const saved = { ...state };
  let visits = 0, sessions = 0;
  const tokens = [];
  state.user = { userId: 200 };
  state.db = { from(table) { return { insert(row) {
    if (table === 'parking_session') { sessions++; throw Error('must not write'); }
    visits++;
    tokens.push(row.open_token);
    if (visits === 1) return Promise.resolve({ error: new Error('offline') });
    state.authVersion++;
    return Promise.resolve({ error: null });
  } }; } };
  const input = { areaId: 5, minutes: 120, reminderMinutes: 10, destinationId: 2 };
  try {
    await assert.rejects(startSession(input), /offline/);
    await assert.rejects(startSession(input), /account changed/);
    assert.equal(visits, 2); assert.equal(sessions, 0);
    assert.equal(tokens[0], tokens[1]);
  } finally { Object.assign(state, saved); }
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
