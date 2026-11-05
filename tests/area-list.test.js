import test from 'node:test';
import assert from 'node:assert/strict';
import { arrangeAreas, byName, matchesQuery, formatDistance, walkMinutes, groupByLot, lotTitle } from '../js/domain/area-list.js';

const area = (id, name, lat = 40.25, lng = -111.65) => ({ area_id: id, area_name: name, lot_code: name.split(' ').pop(), operator: 'BYU', latitude: lat, longitude: lng });
const names = (r) => r.items.map((a) => a.area_name);

test('lot names sort by number, not as plain text', () => {
  const list = ['BYU Lot 19Y', 'BYU Lot 1A', 'BYU Lot 20A', 'BYU Lot 2A'].map((n, i) => area(i, n));
  assert.deepEqual(list.sort(byName).map((a) => a.area_name), ['BYU Lot 1A', 'BYU Lot 2A', 'BYU Lot 19Y', 'BYU Lot 20A']);
});

test('search matches every word against name, lot code and operator', () => {
  assert.equal(matchesQuery(area(1, 'BYU Lot 24Y'), '24y'), true);
  assert.equal(matchesQuery(area(1, 'BYU Lot 24Y'), 'byu 24'), true);
  assert.equal(matchesQuery(area(1, 'BYU Lot 24Y'), '30'), false);
  assert.equal(matchesQuery(area(1, 'BYU Lot 24Y'), '  '), true);
  assert.deepEqual(names(arrangeAreas([area(1, 'BYU Lot 24Y'), area(2, 'BYU Lot 30G')], { query: '30' })), ['BYU Lot 30G']);
});

test('distance sort uses the position, and falls back to name order without one', () => {
  const near = area(1, 'BYU Lot 9A', 40.2500, -111.6500), far = area(2, 'BYU Lot 1A', 40.2600, -111.6500), noPoint = area(3, 'BYU Lot 5A', null, null);
  const here = { latitude: 40.2500, longitude: -111.6500 };
  const sorted = arrangeAreas([far, noPoint, near], { sort: 'distance', position: here });
  assert.equal(sorted.sortedBy, 'distance');
  assert.deepEqual(names(sorted), ['BYU Lot 9A', 'BYU Lot 1A', 'BYU Lot 5A']);
  assert.ok(sorted.items[0].distanceMeters < 1);
  const fallback = arrangeAreas([far, noPoint, near], { sort: 'distance', position: null });
  assert.equal(fallback.sortedBy, 'name');
  assert.deepEqual(names(fallback), ['BYU Lot 1A', 'BYU Lot 5A', 'BYU Lot 9A']);
});

test('distances read in feet when close and miles otherwise', () => {
  assert.equal(formatDistance(30), '100 ft');
  assert.equal(formatDistance(1609.344 * 0.42), '0.4 mi');
  assert.equal(formatDistance(Infinity), '');
});

test('walk sort ranks sections by distance to the destination building', () => {
  const building = { latitude: 40.2500, longitude: -111.6500 };
  const close = area(1, 'BYU Lot 30G', 40.2505, -111.6500), farther = area(2, 'BYU Lot 2A', 40.2550, -111.6500), noPoint = area(3, 'BYU Lot 5A', null, null);
  const r = arrangeAreas([farther, noPoint, close], { sort: 'walk', destination: building });
  assert.equal(r.sortedBy, 'walk');
  assert.deepEqual(names(r), ['BYU Lot 30G', 'BYU Lot 2A', 'BYU Lot 5A']);
  assert.equal(r.items[0].walkMinutes, 1);           // ~56 m
  assert.equal(r.items[1].walkMinutes, 9);           // ~556 m * 1.3 / 80
  assert.equal(r.items[2].walkMinutes, null);
  assert.equal(arrangeAreas([farther, close], { sort: 'walk', destination: null }).sortedBy, 'name');
});

test('walk minutes: at least 1, null when unknown', () => {
  assert.equal(walkMinutes(0), 1);
  assert.equal(walkMinutes(800), 13);
  assert.equal(walkMinutes(Infinity), null);
});

test('groupByLot keeps the first section of each lot and counts the rest', () => {
  const s = (id, code, op = 'BYU') => ({ area_id: id, area_name: `BYU Lot ${code} (section ${id})`, lot_code: code, operator: op });
  const g = groupByLot([s(1, '19Y'), s(2, '20Y'), s(3, '19y'), s(4, '19Y'), { area_id: 5, area_name: 'Street parking', lot_code: null }]);
  assert.deepEqual(g.map((a) => [a.area_id, a.sectionCount]), [[1, 3], [2, 1], [5, 1]]);
  assert.equal(lotTitle(g[0]), 'Lot 19Y');
  assert.equal(lotTitle(g[2]), 'Street parking');
});
