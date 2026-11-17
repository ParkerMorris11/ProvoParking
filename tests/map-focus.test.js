import test from 'node:test';
import assert from 'node:assert/strict';
import { mapPadding, unionBounds, selectionKey, paddedCamera } from '../js/domain/map-focus.js';

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
