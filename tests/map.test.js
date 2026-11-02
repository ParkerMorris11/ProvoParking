import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { initMap } from '../js/pages/map.js';

test('map skips absent and out-of-range coordinates rather than plotting them at zero', async () => {
  const plotted = [];
  const map = { setView() { return this; }, fitBounds() {}, invalidateSize() {} };
  const layer = { addTo() { return this; }, bindPopup() { return this; }, bringToFront() {} };
  globalThis.window = { L: {
    map: () => map, tileLayer: () => layer, geoJSON: () => layer,
    circleMarker: (point) => { plotted.push(point); return layer; },
    latLngBounds: (points) => points,
  } };
  globalThis.L = window.L;
  globalThis.document = { querySelector: () => ({ hidden: false }), getElementById: () => ({ textContent: '' }) };
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ type: 'FeatureCollection', features: [] }) });
  try {
    await initMap({ areas: [
      { area_id: 1, area_name: 'Valid', latitude: '40.25', longitude: '-111.65' },
      { latitude: null, longitude: null }, { latitude: '', longitude: '' },
      { latitude: 100, longitude: -111 }, { latitude: 40, longitude: -190 },
    ] });
    assert.deepEqual(plotted, [[40.25, -111.65]]);
  } finally { globalThis.fetch = oldFetch; delete globalThis.L; delete globalThis.window; delete globalThis.document; }
});

test('Pages deployment includes the map boundary snapshot', async () => {
  const workflow = await readFile(new URL('../.github/workflows/pages.yml', import.meta.url), 'utf8');
  assert.match(workflow, /cp -r css js data site\//);
});

test('missing map library leaves a useful list fallback', async () => {
  const { initMap: init } = await import('../js/pages/map.js?missing-library');
  const container = { hidden: false };
  const status = { textContent: '' };
  globalThis.window = {};
  globalThis.document = { querySelector: () => container, getElementById: () => status };
  try {
    await init({ areas: [] });
    assert.equal(container.hidden, true);
    assert.match(status.textContent, /Use the parking list/);
  } finally { delete globalThis.window; delete globalThis.document; }
});

test('failed boundary download keeps database markers available with a visible warning', async () => {
  const { initMap: init } = await import('../js/pages/map.js?failed-boundaries');
  const plotted = [];
  const status = { textContent: '' };
  const map = { setView() { return this; }, invalidateSize() {} };
  const layer = { addTo() { return this; }, bindPopup() { return this; } };
  globalThis.window = { L: { map: () => map, tileLayer: () => layer,
    circleMarker: (point) => { plotted.push(point); return layer; } } };
  globalThis.document = { querySelector: () => ({}), getElementById: () => status };
  const oldFetch = globalThis.fetch;
  const oldWarn = console.warn;
  globalThis.fetch = async () => ({ ok: false, status: 404 });
  console.warn = () => {};
  try {
    await init({ areas: [{ area_id: 1, area_name: 'Test lot', latitude: 40.25, longitude: -111.65 }] });
    assert.equal(plotted.length, 1);
    assert.match(status.textContent, /boundaries unavailable/);
    assert.match(status.textContent, /markers and the parking list are still available/);
  } finally { globalThis.fetch = oldFetch; console.warn = oldWarn; delete globalThis.window; delete globalThis.document; }
});

test('boundary colors distinguish visitor permits from YV and mark missing or prohibited parking neutrally', async () => {
  const { initMap: init } = await import('../js/pages/map.js?permit-colors');
  let style;
  const map = { setView() { return this; }, invalidateSize() {} };
  const layer = { addTo() { return this; } };
  globalThis.window = { L: { map: () => map, tileLayer: () => layer,
    geoJSON: (_, options) => { style = options.style; return layer; } } };
  globalThis.document = { querySelector: () => ({}), getElementById: () => ({ textContent: '' }) };
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ type: 'FeatureCollection', features: [] }) });
  try {
    await init({ areas: [] });
    const color = (permit) => style({ properties: { permit_typ: permit } }).color;
    assert.notEqual(color('YV'), color('V'));
    assert.notEqual(color('No BYU Parking'), color('Y'));
    assert.notEqual(color(null), color('Y'));
  } finally { globalThis.fetch = oldFetch; delete globalThis.window; delete globalThis.document; }
});
