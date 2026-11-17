import test from 'node:test';
import assert from 'node:assert/strict';
import { localParseFind, mergeParsed } from '../js/domain/local-parse.js';
import { parseFindWithFallback } from '../js/data/parse-find.js';

const permits = [
  { permit_id: 1, permit_code: 'Y', permit_name: 'Y Undergraduate' },
  { permit_id: 2, permit_code: 'G', permit_name: 'Graduate' },
  { permit_id: 3, permit_code: 'PP', permit_name: 'Preferred Parking' },
];
const destinations = [
  { destination_id: 10, building_code: 'JKB', name: 'Jesse Knight Building' },
  { destination_id: 11, building_code: 'TNRB', name: 'Tanner Building' },
  { destination_id: 12, building_code: 'HBLL', name: 'Harold B. Lee Library' },
  { destination_id: 13, building_code: 'MC', name: 'Marriott Center' },
];
const lists = { permits, destinations };
// Monday 2026-11-16 12:00 in Provo
const monday = new Date('2026-11-16T19:00:00Z');
const read = (text) => localParseFind(text, lists, monday);

test('"tnrb 9" is the Tanner Building at 9 am', () => {
  const r = read('tnrb 9');
  assert.equal(r.destination_id, 11);
  assert.equal(r.live, false);
  assert.equal(r.time, '09:00');
});

test('"jkb at 3" is 3 pm, and "class at 8 at the jkb" is 8 am', () => {
  assert.equal(read('jkb at 3').time, '15:00');
  assert.equal(read('class at 8 at the jkb').time, '08:00');
});

test('explicit am/pm and 24-hour times win', () => {
  assert.equal(read('library 2:30 pm').time, '14:30');
  assert.equal(read('library at 7 am').time, '07:00');
  assert.equal(read('library at 12 pm').time, '12:00');
  assert.equal(read('library at 12 am').time, '00:00');
  assert.equal(read('library 15:45').time, '15:45');
  assert.equal(read('library at noon').time, '12:00');
});

test('nicknames and names find the building', () => {
  assert.equal(read('the library at 4pm').destination_id, 12);
  assert.equal(read('business school tomorrow 10am').destination_id, 11);
  assert.equal(read('knight building friday 1 pm').destination_id, 10);
  assert.equal(read('marriott center now').destination_id, 13);
});

test('days: names, tomorrow, today', () => {
  assert.equal(read('jkb friday 2pm').day, 5);
  assert.equal(read('jkb on thurs at 9 am').day, 4);
  assert.equal(read('jkb tomorrow 9am').day, 2);
  assert.equal(read('jkb today at 4pm').day, 1);
  assert.equal(read('jkb saturday').day, 6);
  assert.equal(read('jkb saturday').time, null);
});

test('permits by code, by "permit X", and by name', () => {
  assert.equal(read('my Y permit at the jkb').permit_id, 1);
  assert.equal(read('permit G near library').permit_id, 2);
  assert.equal(read('graduate permit tnrb 10am').permit_id, 2);
  assert.equal(read('pp permit').permit_id, 3);
});

test('"where can i park" and "my permit" use the saved permit; a named permit does not', () => {
  assert.equal(read('where can i park').use_saved_permit, true);
  assert.equal(read('class at 3 with my current permit').use_saved_permit, true);
  assert.equal(read('Y permit jkb').use_saved_permit, false);
});

test('no time or day means live; "right now" overrides a stray number', () => {
  assert.equal(read('tanner building').live, true);
  assert.equal(read('library right now').live, true);
});

test('unrelated text and 2-letter words are not read as buildings', () => {
  const r = read('free parking downtown for 2 hours');
  assert.equal(r.found, 0);
  assert.equal(r.destination_id, null);
  assert.equal(read('mc').destination_id, null);
  assert.equal(read('stay for 2 hours at the jkb').time, null);
});

test('only returns IDs that exist in the lists', () => {
  const r = localParseFind('tnrb 9', { permits, destinations: [] }, monday);
  assert.equal(r.destination_id, null);
});

test('merge: the model wins, the local reader fills gaps', () => {
  const ai = { permit_id: null, use_saved_permit: false, destination_id: null, live: true, day: null, time: null, confidence: 0.3 };
  const merged = mergeParsed(ai, read('tnrb 9'));
  assert.equal(merged.destination_id, 11);
  assert.equal(merged.time, '09:00');
  assert.equal(merged.live, false);
  assert.ok(merged.confidence >= 0.5);
  const sure = { ...ai, destination_id: 10, live: false, day: 3, time: '14:00', confidence: 0.9 };
  assert.deepEqual(mergeParsed(sure, read('tnrb 9')), sure);
});

test('when the model is unreachable the local reader answers alone, and nonsense still errors', async () => {
  const failing = { functions: { invoke: async () => ({ data: null, error: { context: { json: async () => ({ error: 'quota_exhausted' }) } } }) } };
  const ok = await parseFindWithFallback(failing, { text: 'tnrb 9' }, lists, {}, monday);
  assert.equal(ok.fallback, true);
  assert.equal(ok.parsed.destination_id, 11);
  assert.equal('found' in ok.parsed, false);
  await assert.rejects(parseFindWithFallback(failing, { text: 'free parking downtown for 2 hours' }, lists, {}, monday), (e) => e.code === 'quota_exhausted');
});
