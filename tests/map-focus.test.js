import test from 'node:test';
import assert from 'node:assert/strict';
import { mapPadding, unionBounds, selectionKey, fitDecision, paddedCamera } from '../js/domain/map-focus.js';

test('phone padding keeps a tapped lot above the half-height sheet and below the permit chip', () => {
  const half = mapPadding({ phone: true, sheetState: 'half', width: 390, height: 844 });
  assert.equal(half.top, 96);
  assert.ok(half.bottom >= 844 * 0.55, 'sheet covers the bottom 55%');
  assert.ok(844 - half.top - half.bottom >= 200, 'room left for the lot');
  assert.equal(mapPadding({ phone: true, sheetState: 'peek', height: 844 }).bottom, 150);
  const desk = mapPadding({ phone: false, width: 1440, height: 900, sidebarRight: 380 });
  assert.equal(desk.left, 404, 'laptop: clear of the sidebar');
});

test('the map re-frames on a new permit or planned time, not on every clock tick', () => {
  assert.equal(selectionKey({ permitId: 1, live: true, day: 2, time: '10:01' }), selectionKey({ permitId: 1, live: true, day: 2, time: '10:02' }));
  assert.notEqual(selectionKey({ permitId: 1, live: true }), selectionKey({ permitId: 2, live: true }), 'permit change');
  assert.notEqual(selectionKey({ permitId: 1, live: false, day: 2, time: '15:00' }), selectionKey({ permitId: 1, live: false, day: 2, time: '16:00' }), 'planned time change');
});

test('union of lot boxes, and 3D camera shifted into the uncovered part of the map', () => {
  assert.equal(unionBounds([]), null);
  const b = unionBounds([{ south: 40.24, west: -111.66, north: 40.25, east: -111.65 }, { south: 40.245, west: -111.655, north: 40.26, east: -111.64 }, null]);
  assert.deepEqual(b, { south: 40.24, west: -111.66, north: 40.26, east: -111.64 });
  const plain = paddedCamera(b, {}, { width: 390, height: 844 });
  const padded = paddedCamera(b, { top: 96, bottom: 480, left: 16, right: 64 }, { width: 390, height: 844 });
  assert.ok(padded.center.lat < plain.center.lat, 'camera moves south so the lots sit above the sheet');
  assert.ok(padded.range > plain.range, 'and backs off so they still fit');
});

test('a permit change frames its sections from every view, including Find (Parker: C showed nothing)', () => {
  for (const view of ['find', 'areas', 'favorites', 'help']) {
    const d = fitDecision({ key: '3|now', lastKey: '1|now', view, count: 3 });
    assert.equal(d.fit, true, view);
    assert.equal(d.key, '3|now');
  }
  // Same permit again (clock tick, re-render): no jump.
  assert.equal(fitDecision({ key: '3|now', lastKey: '3|now', view: 'find', count: 3 }).fit, false);
});

test('framing waits on a lot page or All Lots, then happens when you go back', () => {
  const onLot = fitDecision({ key: '3|now', lastKey: '1|now', view: 'area', count: 3 });
  assert.equal(onLot.fit, false);
  assert.equal(onLot.key, '1|now', 'the change is not used up');
  assert.equal(fitDecision({ key: '3|now', lastKey: onLot.key, view: 'areas', count: 3 }).fit, true);
  assert.equal(fitDecision({ key: '3|now', lastKey: '1|now', view: 'lots', count: 3 }).key, '1|now');
});

test('no permit, no matches, or a new building search keep the camera', () => {
  assert.equal(fitDecision({ key: 'none|now', lastKey: null, view: 'find', count: 12, hasPermit: false }).fit, false);
  const empty = fitDecision({ key: '9|now', lastKey: '1|now', view: 'areas', count: 0 });
  assert.equal(empty.fit, false); assert.equal(empty.key, '9|now');
  assert.equal(fitDecision({ key: '1|2|15:00', lastKey: null, dest: 7, lastDest: null, view: 'areas', count: 33 }).fit, false, 'AI/Find search with a building: building camera wins');
  assert.equal(fitDecision({ key: '2|2|15:00', lastKey: '1|2|15:00', dest: 7, lastDest: 7, view: 'areas', count: 45 }).fit, true, 'then a chip change still frames');
});
