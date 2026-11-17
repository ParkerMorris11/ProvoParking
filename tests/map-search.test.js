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

test('nicknames, misspellings and city facilities all find their place', () => {
  const destinations = [
    { destination_id: 1, building_code: 'JRCB', name: 'J. Reuben Clark Law Building' },
    { destination_id: 2, building_code: 'MCA', name: 'MARRIOTT CENTER ANNEX' },
    { destination_id: 3, building_code: 'MC', name: 'MARRIOTT (J WILLARD) CENTER' },
    { destination_id: 4, building_code: 'HBLL', name: 'Harold B. Lee Library' },
  ];
  const facilities = [{ index: 7, name: 'Freedom Commons', kind: 'Parking garage' }];
  const first = query => searchMapCatalog(query, { destinations, facilities })[0];
  assert.equal(first('law school').id, 1, 'a student nickname finds the building');
  assert.equal(first('marriott center').id, 3, 'the main arena outranks the annex');
  assert.equal(first('librery').id, 4, 'one wrong letter still finds it');
  assert.equal(first('libary').id, 4, 'one missing letter still finds it');
  assert.deepEqual(first('freedom commons'), { type: 'city', id: 7, title: 'Freedom Commons', subtitle: 'Provo · Parking garage' });
  assert.deepEqual(searchMapCatalog('zzzz qqqq', { destinations, facilities }), [], 'unrelated text finds nothing');
  assert.deepEqual(searchMapCatalog('where can i park', { destinations, facilities }), [], 'a sentence still goes to the AI trip search');
});

test('misspelling matches never rank above exact ones', () => {
  const destinations = [
    { destination_id: 1, building_code: 'TNRB', name: 'Tanner Building' },
    { destination_id: 2, building_code: 'TBX', name: 'Tanger Hall' },
  ];
  const results = searchMapCatalog('tanner', { destinations });
  assert.equal(results[0].id, 1);
});

import { QUICK_FILTERS, isNaturalLanguageTripQuery } from '../js/domain/map-search.js';

test('exposes quick filters and detects natural-language trip statements cleanly', () => {
  assert.deepEqual(QUICK_FILTERS.map(f => f.id), ['near-me', 'visitor', 'free-now']);
  assert.equal(isNaturalLanguageTripQuery('tanner building'), false);
  assert.equal(isNaturalLanguageTripQuery('law school'), false);
  assert.equal(isNaturalLanguageTripQuery('park near library tomorrow 3pm'), true);
  assert.equal(isNaturalLanguageTripQuery('Y permit until 5pm'), true);
  assert.equal(isNaturalLanguageTripQuery('where can I park for class'), true);
});
