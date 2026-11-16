import test from 'node:test';
import assert from 'node:assert/strict';
import { findExactLot } from '../js/domain/lot-search.js';

const lots = [
  { area_id: 5, area_name: 'BYU Lot 59Y', lot_code: '59Y', operator: 'BYU', is_sample_data: false },
  { area_id: 8, area_name: 'BYU Lot 19Y (section 1)', lot_code: '19Y', operator: 'BYU', is_sample_data: false },
  { area_id: 9, area_name: 'BYU Lot 19Y (section 2)', lot_code: '19Y', operator: 'BYU', is_sample_data: false },
  { area_id: 10, area_name: 'Sample', lot_code: '5A', operator: 'BYU', is_sample_data: true },
];
test('direct lot search recognizes a lot code but does not hijack natural language', () => {
  assert.deepEqual(findExactLot('BYU Lot 59Y', lots).map(x => x.area_id), [5]);
  assert.deepEqual(findExactLot('19y', lots).map(x => x.area_id), [8, 9]);
  assert.deepEqual(findExactLot('5A', lots), []);
  assert.deepEqual(findExactLot('Y permit near 59Y on Tuesday', lots), []);
  assert.deepEqual(findExactLot('99Z', lots), []);
});
