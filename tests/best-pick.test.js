import test from 'node:test';
import assert from 'node:assert/strict';
import { bestPickReason } from '../js/domain/best-pick.js';
import { afterFill } from '../js/data/parse-find.js';

const jkb = { name: 'Jesse Knight Building', building_code: 'JKB' };

test('best pick explains the top row of a destination-ranked list in one line', () => {
  const area = { area_name: 'BYU Lot 37Y', section_note: 'Part 1 of 4 · near Student Athlete Building', distanceMeters: 480 };
  assert.equal(bestPickReason(area, { sortedBy: 'destination', permitCode: 'Y', place: jkb }), 'Closest Y section to the JKB · ~0.3 mi');
  assert.equal(bestPickReason({ ...area, section_note: '' }, { sortedBy: 'destination', permitCode: 'Y', place: jkb }), 'Closest Y lot to the JKB · ~0.3 mi');
  assert.equal(bestPickReason(area, { sortedBy: 'distance', permitCode: 'A' }), 'Closest A section to you · ~0.3 mi');
  assert.equal(bestPickReason(area, { sortedBy: 'destination', permitCode: 'G', place: { name: 'Provo Library' } }), 'Closest G section to Provo Library · ~0.3 mi');
  assert.equal(bestPickReason(area, { sortedBy: 'destination', permitCode: 'Y', place: jkb, kind: 'limit' }), 'Closest Y section to the JKB · ~0.3 mi · time limit');
});

test('no best pick without a distance ranking or a row', () => {
  assert.equal(bestPickReason(undefined, { sortedBy: 'destination' }), null);
  assert.equal(bestPickReason({ area_name: 'Lot 1' }, { sortedBy: 'destination' }), null, 'no distance');
  assert.equal(bestPickReason({ area_name: 'Lot 1', distanceMeters: 100 }, { sortedBy: 'name' }), null, 'lot-number order has no best');
});

test('after the AI fill: search runs by itself only with a permit and a destination and nothing to review', () => {
  assert.deepEqual(afterFill({ permit: '1', destination: '12', needsReview: false, warnings: [] }), { autoSearch: true, missing: [] });
  assert.deepEqual(afterFill({ permit: '', destination: '12' }), { autoSearch: false, missing: ['permit'] });
  assert.deepEqual(afterFill({ permit: '1', destination: '' }), { autoSearch: false, missing: ['destination'] });
  assert.deepEqual(afterFill({ permit: '', destination: '' }), { autoSearch: false, missing: ['permit', 'destination'] });
  assert.equal(afterFill({ permit: '1', destination: '12', needsReview: true }).autoSearch, false, 'unsure reads wait for review');
  assert.equal(afterFill({ permit: '1', destination: '12', warnings: ["I couldn't tell the time, so check it."] }).autoSearch, false);
});
