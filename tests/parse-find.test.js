import test from 'node:test';
import assert from 'node:assert/strict';
import { buildParseRequest, normalizeParsed, requestParseFind, applyParsedToForm, ParseFindError } from '../js/data/parse-find.js';

const permits = [
  { permit_id: 1, permit_code: 'Y', permit_name: 'Y Undergraduate' },
  { permit_id: 2, permit_code: 'G', permit_name: 'G Graduate' },
];
const destinations = [
  { destination_id: 10, building_code: 'JKB', name: 'Jesse Knight Building' },
  { destination_id: 11, building_code: 'TNRB', name: 'Tanner Building' },
];
const lists = { permits, destinations };

function form() {
  return {
    permit: { value: '' }, destination: { value: '' },
    now: { checked: true }, day: { value: '3', disabled: true }, time: { value: '', disabled: true },
  };
}
const parsed = (over = {}) => ({ permit_id: null, use_saved_permit: false, destination_id: null, live: true, day: null, time: null, confidence: 0.9, ...over });

test('request body sends only live IDs, labels as a fallback, and audio only when present', () => {
  const body = buildParseRequest({ text: '  class at 3  ', ...lists });
  assert.equal(body.text, 'class at 3');
  assert.deepEqual(body.permit_ids, [1, 2]);
  assert.deepEqual(body.destination_ids, [10, 11]);
  assert.equal(body.destination_labels[0].label, 'Jesse Knight Building (JKB)');
  assert.equal('audio' in body, false);
  const withAudio = buildParseRequest({ audio: { data_base64: 'AAAA', mime_type: 'audio/mp4' }, ...lists });
  assert.deepEqual(withAudio.audio, { data_base64: 'AAAA', mime_type: 'audio/mp4' });
});

test('normalizeParsed drops IDs that are not live and keeps the strict shape', () => {
  const out = normalizeParsed({ permit_id: 99, use_saved_permit: true, destination_id: 10, live: false, day: 4, time: '15:00', confidence: 2, extra: 'x' }, lists);
  assert.deepEqual(out, { permit_id: null, use_saved_permit: true, destination_id: 10, live: false, day: 4, time: '15:00', confidence: 1 });
  assert.deepEqual(Object.keys(out).sort(), ['confidence', 'day', 'destination_id', 'live', 'permit_id', 'time', 'use_saved_permit']);
});

test('normalizeParsed treats bad times, days and garbage as "right now" with zero confidence', () => {
  assert.deepEqual(normalizeParsed({ live: false, day: 9, time: '25:61' }, lists), parsed({ confidence: 0 }));
  assert.deepEqual(normalizeParsed(null, lists), parsed({ confidence: 0 }));
  assert.equal(normalizeParsed({ permit_id: 1, use_saved_permit: true }, lists).use_saved_permit, false);
});

test('"class at 3 pm at the JKB with my current permit" fills permit, building, day and time', () => {
  const els = form();
  let chosen = 0;
  const result = applyParsedToForm(
    parsed({ use_saved_permit: true, destination_id: 10, live: false, day: 2, time: '15:00' }), els,
    { ...lists, choosePermit: () => { chosen++; }, getPermitId: () => 1 });
  assert.equal(chosen, 1, 'resolved through the existing choosePermit()');
  assert.equal(els.permit.value, '1');
  assert.equal(els.destination.value, '10');
  assert.equal(els.now.checked, false);
  assert.equal(els.day.value, '2');
  assert.equal(els.time.value, '15:00');
  assert.equal(els.day.disabled, false);
  assert.equal(els.time.disabled, false);
  assert.match(result.summary, /Y permit/);
  assert.match(result.summary, /Jesse Knight Building/);
  assert.match(result.summary, /3:00 PM/);
  assert.equal(result.needsReview, false);
  assert.deepEqual(result.warnings, []);
});

test('a named permit wins and choosePermit is not called', () => {
  const els = form();
  applyParsedToForm(parsed({ permit_id: 2 }), els, { ...lists, choosePermit: () => assert.fail('should not run'), getPermitId: () => 1 });
  assert.equal(els.permit.value, '2');
  assert.equal(els.now.checked, true);
  assert.equal(els.time.disabled, true);
});

test('"my permit" with no saved permit leaves the select alone and tells the person', () => {
  const els = form();
  els.permit.value = '';
  const result = applyParsedToForm(parsed({ use_saved_permit: true }), els, { ...lists, choosePermit() {}, getPermitId: () => null });
  assert.equal(els.permit.value, '');
  assert.match(result.warnings.join(' '), /choose one/);
});

test('fields the sentence did not mention are left as they were', () => {
  const els = form();
  els.destination.value = '11';
  applyParsedToForm(parsed({ permit_id: 1 }), els, { ...lists });
  assert.equal(els.destination.value, '11');
});

test('low confidence asks the person to check every field', () => {
  const result = applyParsedToForm(parsed({ permit_id: 1, confidence: 0.2 }), form(), lists);
  assert.equal(result.needsReview, true);
  assert.match(result.warnings.join(' '), /check each field/);
});

test('a day without a time warns instead of inventing one', () => {
  const els = form();
  const result = applyParsedToForm(parsed({ live: false, day: 5, time: null }), els, lists);
  assert.equal(els.day.value, '5');
  assert.equal(els.time.value, '');
  assert.match(result.warnings.join(' '), /time/);
});

test('requestParseFind calls the parse-find function and normalizes the answer', async () => {
  let call;
  const db = { functions: { invoke: async (name, options) => { call = { name, options }; return { data: { permit_id: 1, use_saved_permit: false, destination_id: 999, live: true, day: null, time: null, confidence: 0.8 }, error: null }; } } };
  const out = await requestParseFind(db, { text: 'Y permit' }, lists);
  assert.equal(call.name, 'parse-find');
  assert.deepEqual(call.options.body.permit_ids, [1, 2]);
  assert.equal(out.permit_id, 1);
  assert.equal(out.destination_id, null, 'unknown building dropped');
});

test('requestParseFind turns function errors into friendly messages', async () => {
  const error = { context: { json: async () => ({ error: 'not_configured' }) } };
  const db = { functions: { invoke: async () => ({ data: null, error }) } };
  await assert.rejects(requestParseFind(db, { text: 'x' }, lists), (e) => e instanceof ParseFindError && e.code === 'not_configured' && /isn't set up/.test(e.message));
  const generic = { functions: { invoke: async () => ({ data: null, error: new Error('boom') }) } };
  await assert.rejects(requestParseFind(generic, { text: 'x' }, lists), /use the form below/);
  await assert.rejects(requestParseFind(null, { text: 'x' }, lists), /connection/);
});
