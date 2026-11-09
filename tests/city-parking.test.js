import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validFacilities, facilitySummary, facilityCenter, cityLayerBounds } from '../js/domain/city-parking.js';
import { cityPopupHtml } from '../js/pages/city-layer.js';
import { eligibleMapFeatures } from '../js/domain/parking-results.js';

const snapshot = JSON.parse(await readFile(new URL('../data/provo-city-parking.json', import.meta.url), 'utf8'));
const facilities = validFacilities(snapshot);
const cityGis = facilities.filter(f => f.properties.record_source === 'provo_city');
const osm = facilities.filter(f => f.properties.record_source === 'osm');

test('city snapshot is sourced Provo GIS public lots plus OSM coverage inside Provo', () => {
  assert.match(snapshot.source.url, /Provo_Parking_Facilities\/FeatureServer\/0$/);
  assert.equal(snapshot.source.checked_on, '2026-11-06');
  assert.match(snapshot.source.osm_url, /openstreetmap\.org/);
  assert.equal(facilities.length, snapshot.features.length);
  assert.equal(cityGis.length, 28);
  assert.ok(osm.length >= 300, `expected citywide OSM lots, got ${osm.length}`);
  assert.equal(snapshot.source.city_gis_public_count, 28);
});

test('mapped facilities stay inside Provo-scale bounds and are not BYU campus lots', () => {
  for (const f of facilities) {
    const c = facilityCenter(f);
    assert.ok(c.latitude > 40.19 && c.latitude < 40.34 && c.longitude > -111.74 && c.longitude < -111.55, f.properties.name);
    const blob = `${f.properties.name} ${f.properties.notes || ''}`;
    assert.doesNotMatch(blob, /\bBYU\b/i);
    assert.doesNotMatch(blob, /Brigham Young/i);
  }
  const lats = facilities.map(f => facilityCenter(f).latitude);
  const lngs = facilities.map(f => facilityCenter(f).longitude);
  assert.ok(Math.min(...lngs) < -111.70, 'west Provo / airport coverage');
  assert.ok(Math.max(...lngs) > -111.63, 'east / canyon coverage');
  assert.ok(Math.min(...lats) < 40.22, 'south Provo coverage');
  assert.ok(Math.max(...lats) > 40.26, 'north Provo coverage');
  const bounds = cityLayerBounds(facilities);
  assert.ok(bounds[0][0] < 40.22 && bounds[1][0] > 40.26);
});

test('city GIS records keep edit dates; OSM records keep osm ids', () => {
  for (const f of cityGis) {
    assert.match(f.properties.city_edited_on, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(f.properties.record_source, 'provo_city');
  }
  for (const f of osm) {
    assert.ok(f.properties.osm_id);
    assert.match(f.properties.osm_type, /^(node|way|relation)$/);
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

test('OSM points and on-street kinds summarize without guessing rules', () => {
  const feature = {
    type: 'Feature',
    properties: { name: 'Trailhead', kind: 'on_street', spaces: 12, recorded_hours: null, record_source: 'osm', osm_type: 'node', osm_id: 1 },
    geometry: { type: 'Point', coordinates: [-111.71, 40.21] },
  };
  const s = facilitySummary(feature, { checked_on: '2026-11-06' });
  assert.equal(s.kind, 'On-street parking');
  assert.match(s.spaces, /OpenStreetMap/);
  assert.match(s.provenance, /OpenStreetMap node\/1/);
  assert.equal(s.sourceLabel, 'OpenStreetMap');
  assert.match(s.sourceUrl, /openstreetmap\.org\/node\/1/);
  assert.equal(s.center.latitude, 40.21);
});

test('malformed features are dropped', () => {
  assert.deepEqual(validFacilities(null), []);
  assert.deepEqual(validFacilities({ type: 'FeatureCollection', features: [
    { properties: { name: '' }, geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1]]] } },
    { properties: { name: 'No shape' }, geometry: null },
    { properties: { name: 'Bad coords' }, geometry: { type: 'Polygon', coordinates: [[[500, 0], [1, 0]]] } },
  ] }), []);
});

test('city and OSM records never join BYU permit eligibility', () => {
  const pretend = facilities.map((f, i) => ({
    operator: 'BYU',
    source_feature_id: f.properties.object_id || f.properties.osm_id,
    area_id: i + 1,
  }));
  assert.deepEqual(eligibleMapFeatures(facilities, pretend), []);
});

test('city popups never include Park here and stay unverified', () => {
  const html = cityPopupHtml(facilitySummary(snapshot.features[0], snapshot.source));
  assert.doesNotMatch(html, /data-park-area/);
  assert.doesNotMatch(html, /Park here/i);
  assert.match(html, /not verified/i);
});

test('Areas chrome keeps citywide controls without Bootstrap', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /id="map-provo"/);
  assert.match(html, /Show Provo lots/);
  assert.doesNotMatch(html, /cdn\.jsdelivr\.net\/npm\/bootstrap/);
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

test('published snapshot omits permit-only school lots and labels unknown access in popups', () => {
  assert.ok(!snapshot.features.some(f => [670291495, 670294597].includes(f.properties.osm_id)));
  const unknown = snapshot.features.find(f => f.properties.osm_id === 670294598);
  assert.ok(unknown);
  assert.match(cityPopupHtml(facilitySummary(unknown, snapshot.source)), /Public access unknown/);
  assert.doesNotMatch(cityPopupHtml(facilitySummary(cityGis[0], snapshot.source)), /Public access unknown/);
});
