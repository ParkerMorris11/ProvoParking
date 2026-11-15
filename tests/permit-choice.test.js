import test from 'node:test';
import assert from 'node:assert/strict';
import { state } from '../js/state.js';
import { applyPermitChoice } from '../js/pages/find.js';
import { eligibleAreas } from '../js/domain/parking-results.js';

test('choosing a permit applies it at once and refreshes the lists and map', () => {
  const saved = { permits: state.permits, find: { ...state.find } };
  state.permits = [{ permit_id: 1, permit_code: 'Y' }, { permit_id: 2, permit_code: 'G' }];
  state.find = { ...state.find, permitId: null };
  let refreshed = 0;
  try {
    assert.equal(applyPermitChoice('2', () => refreshed++), true);
    assert.equal(state.find.permitId, 2);
    assert.equal(refreshed, 1);
    assert.equal(applyPermitChoice('', () => refreshed++), false, 'the empty option changes nothing');
    assert.equal(applyPermitChoice('99', () => refreshed++), false, 'unknown permits are ignored');
    assert.equal(state.find.permitId, 2);
    assert.equal(refreshed, 1);
    assert.equal(typeof eligibleAreas, 'function');
  } finally {
    state.permits = saved.permits;
    state.find = saved.find;
  }
});
