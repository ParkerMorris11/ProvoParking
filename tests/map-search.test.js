import test from 'node:test';
import assert from 'node:assert/strict';
import { searchMapCatalog } from '../js/domain/map-search.js';
const areas = [{ area_id: 5, area_name: 'BYU Lot 59Y', lot_code: '59Y', operator: 'BYU' }, { area_id: 6, area_name: 'BYU Lot 19Y', lot_code: '19Y', operator: 'BYU' }];
const destinations = [{ destination_id: 7, name: 'Harold B. Lee Library', building_code: 'HBLL' }, { destination_id: 8, name: 'Tanner Building', building_code: 'TNRB' }];
test('returns deterministic lot and real destination suggestions for partial codes and names', () => {
  assert.equal(searchMapCatalog('59', { areas, destinations })[0].id, 5);
  assert.equal(searchMapCatalog('hbll', { areas, destinations })[0].id, 7);
  assert.equal(searchMapCatalog('tanner', { areas, destinations })[0].id, 8);
  assert.deepEqual(searchMapCatalog('x', { areas, destinations }), []);
  assert.deepEqual(searchMapCatalog('Y permit tomorrow near the library', { areas, destinations }), []);
});
test('search tolerates punctuation, word order and ranks exact building codes first', () => {
  assert.equal(searchMapCatalog('library harold', { areas, destinations })[0].id, 7);
  assert.equal(searchMapCatalog('harold b lee', { areas, destinations })[0].id, 7);
  assert.equal(searchMapCatalog('lot 59y', { areas, destinations })[0].id, 5);
  const extra = [...destinations, { destination_id: 9, name: 'HBLL Annex', building_code: 'ANNX' }];
  assert.equal(searchMapCatalog('hbll', { areas, destinations: extra })[0].id, 7);
});
