import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validFacilities, facilitySummary, facilityCenter } from '../js/domain/city-parking.js';
import { cityPopupHtml } from '../js/pages/city-layer.js';

const snapshot = JSON.parse(await readFile(new URL('../data/provo-city-parking.json', import.meta.url), 'utf8'));

test('city snapshot is a sourced set of public Provo facilities inside Provo', () => {
  assert.match(snapshot.source.url, /Provo_Parking_Facilities\/FeatureServer\/0$/);
  assert.equal(snapshot.source.checked_on, '2026-11-05');
  const facilities = validFacilities(snapshot);
  assert.equal(facilities.length, snapshot.features.length);
  assert.ok(facilities.length >= 20);
  for (const f of facilities) {
    const c = facilityCenter(f);
    assert.ok(c.latitude > 40.20 && c.latitude < 40.30 && c.longitude > -111.72 && c.longitude < -111.60, f.properties.name);
    assert.match(f.properties.city_edited_on, /^\d{4}-\d{2}-\d{2}$/);
  }
});

test('missing city facts read as unknown and always carry a sign warning', () => {
  const feature = { type: 'Feature', properties: { name: 'Test lot', kind: 'lot', spaces: null, recorded_hours: null, notes: null },
    geometry: { type: 'Polygon', coordinates: [[[-111.66, 40.23], [-111.65, 40.23], [-111.65, 40.24], [-111.66, 40.23]]] } };
  const s = facilitySummary(feature, {});
  assert.equal(s.hours, 'Hours unknown');
  assert.equal(s.spaces, 'Space count unknown');
  assert.match(s.caution, /not verified/);
  assert.match(s.provenance, /date unknown/);
});

test('malformed features are dropped', () => {
  assert.deepEqual(validFacilities(null), []);
  assert.deepEqual(validFacilities({ type: 'FeatureCollection', features: [
    { properties: { name: '' }, geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1]]] } },
    { properties: { name: 'No shape' }, geometry: null },
    { properties: { name: 'Bad coords' }, geometry: { type: 'Polygon', coordinates: [[[500, 0], [1, 0]]] } },
  ] }), []);
});

test('popup escapes city text and links directions and the source', () => {
  const feature = { ...snapshot.features[0], properties: { ...snapshot.features[0].properties, name: '<b>Lot</b>', notes: 'a "quote"' } };
  const html = cityPopupHtml(facilitySummary(feature, snapshot.source));
  assert.ok(!html.includes('<b>Lot</b>'));
  assert.match(html, /&lt;b&gt;Lot/);
  assert.match(html, /Check posted signs/);
  assert.match(html, /google\.com\/maps\/dir/);
  assert.match(html, /provo\.gov\/273\/Parking/);
});

test('city list Show on map labels keep the visible text in the accessible name', async () => {
  const { initCityLayer } = await import('../js/pages/city-layer.js?city-list-labels');
  const fields = {
    'city-lot-list': { innerHTML: '', onclick: null },
    'city-lot-count': { textContent: '' },
    'city-status': { textContent: '' },
    'city-toggle': { checked: true, disabled: true, addEventListener() {} },
    'map-downtown': { disabled: true, addEventListener() {} },
    'parking-map': { scrollIntoView() {}, focus() {} },
  };
  const previous = { document: globalThis.document, window: globalThis.window, fetch: globalThis.fetch };
  const map = { setView() {}, removeLayer() {} };
  const featureLayer = { bindPopup() {}, openPopup() {} };
  globalThis.document = { getElementById: id => fields[id] };
  globalThis.window = { matchMedia: () => ({ matches: true }) };
  globalThis.fetch = async () => ({ ok: true, json: async () => snapshot });
  try {
    await initCityLayer(map, {
      geoJSON: (_collection, options) => {
        snapshot.features.forEach((feature) => options.onEachFeature(feature, featureLayer));
        return { addTo() { return this; } };
      },
    });
    assert.match(fields['city-lot-list'].innerHTML, /aria-label="Show on map: /);
    assert.match(fields['city-lot-list'].innerHTML, />Show on map <span aria-hidden="true">↗<\/span></);
    assert.equal(fields['city-lot-count'].textContent, String(snapshot.features.length));
  } finally {
    if (previous.document === undefined) delete globalThis.document; else globalThis.document = previous.document;
    if (previous.window === undefined) delete globalThis.window; else globalThis.window = previous.window;
    if (previous.fetch === undefined) delete globalThis.fetch; else globalThis.fetch = previous.fetch;
  }
});
