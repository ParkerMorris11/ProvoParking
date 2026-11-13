import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { getMapsApiKey, mapsScriptUrl, loadGoogleMaps } from '../js/lib/google-maps.js';
import { byuShape, cityShape, outerRings, permitCategory, boundsFromCorners, withAlpha } from '../js/domain/map-geometry.js';
import { createMap2D } from '../js/pages/map-2d.js';
import { createMap3D } from '../js/pages/map-3d.js';
import { lotCardHtml } from '../js/pages/map.js';

const square = [[-111.65, 40.25], [-111.649, 40.25], [-111.649, 40.251], [-111.65, 40.251], [-111.65, 40.25]];

test('Google Maps key comes from config.js and placeholders count as missing', () => {
  assert.equal(getMapsApiKey({ GOOGLE_MAPS_API_KEY: ' abc123 ' }), 'abc123');
  assert.equal(getMapsApiKey({ GOOGLE_MAPS_API_KEY: 'YOUR-GOOGLE-MAPS-KEY' }), '');
  assert.equal(getMapsApiKey({}), '');
  assert.equal(getMapsApiKey(undefined), '');
});

test('script URL asks for the beta channel with maps3d, places and marker', () => {
  const url = new URL(mapsScriptUrl('k e/y'));
  assert.equal(url.origin + url.pathname, 'https://maps.googleapis.com/maps/api/js');
  assert.equal(url.searchParams.get('v'), 'beta');
  assert.equal(url.searchParams.get('libraries'), 'maps3d,places,marker');
  assert.equal(url.searchParams.get('loading'), 'async');
  assert.equal(url.searchParams.get('key'), 'k e/y');
});

test('loader rejects without a key and never adds a script', async () => {
  const appended = [];
  const doc = { createElement: () => ({}), head: { append: (n) => appended.push(n) } };
  await assert.rejects(loadGoogleMaps({ key: '', doc, win: {} }), /No Google Maps API key/);
  assert.equal(appended.length, 0);
});

test('loader appends one script and resolves with google.maps once it loads', async () => {
  const appended = [];
  const win = {};
  const doc = { createElement: () => ({}), head: { append: (n) => appended.push(n) } };
  const first = loadGoogleMaps({ key: 'test-key', doc, win });
  const second = loadGoogleMaps({ key: 'test-key', doc, win });
  assert.equal(appended.length, 1);
  assert.match(appended[0].src, /key=test-key/);
  win.google = { maps: { importLibrary() {} } };
  appended[0].onload();
  assert.equal(await first, win.google.maps);
  assert.equal(await second, win.google.maps);
  assert.equal(typeof win.gm_authFailure, 'function');
});

test('loader can retry after the script fails to load', async () => {
  const appended = [];
  const doc = { createElement: () => ({}), head: { append: (n) => appended.push(n) } };
  const win = {};
  const failed = loadGoogleMaps({ key: 'retry-key', doc, win });
  appended[0].onerror();
  await assert.rejects(failed, /failed to load/);
  const again = loadGoogleMaps({ key: 'retry-key', doc, win });
  assert.equal(appended.length, 2);
  win.google = { maps: { importLibrary() {} } };
  appended[1].onload();
  await again;
});

test('boundary colors distinguish visitor permits from YV and mark missing or prohibited parking neutrally', () => {
  const color = (permit) => permitCategory(permit).color;
  assert.notEqual(color('YV'), color('V'));
  assert.notEqual(color('No BYU Parking'), color('Y'));
  assert.notEqual(color(null), color('Y'));
});

test('BYU features become shapes with outer rings in {lat, lng} order', () => {
  const shape = byuShape({ properties: { OBJECTID: 7, permit_typ: 'Y' }, geometry: { type: 'Polygon', coordinates: [square] } });
  assert.equal(shape.key, 'byu-7');
  assert.equal(shape.kind, 'polygon');
  assert.deepEqual(shape.rings[0][0], { lat: 40.25, lng: -111.65 });
  assert.deepEqual(shape.bounds, { south: 40.25, west: -111.65, north: 40.251, east: -111.649 });
  assert.equal(shape.color, permitCategory('Y').color);
});

test('MultiPolygon keeps every outer ring and junk geometry is dropped', () => {
  const multi = { type: 'MultiPolygon', coordinates: [[square], [square]] };
  assert.equal(outerRings(multi).length, 2);
  assert.deepEqual(outerRings({ type: 'Polygon', coordinates: [[[0, 0], [1, 1]]] }), []);
  assert.deepEqual(outerRings({ type: 'Polygon', coordinates: [[[-300, 95], [0, 0], [1, 1], [2, 2]]] }).length, 1);
  assert.equal(byuShape({ properties: { OBJECTID: 1 }, geometry: null }), null);
});

test('city facilities may be points or polygons', () => {
  const point = cityShape({ geometry: { type: 'Point', coordinates: [-111.66, 40.23] } }, 3);
  assert.equal(point.kind, 'point');
  assert.deepEqual(point.center, { lat: 40.23, lng: -111.66 });
  assert.deepEqual(point.source, { type: 'city', index: 3 });
  assert.equal(cityShape({ geometry: { type: 'Point', coordinates: ['x', 1] } }, 0), null);
  assert.equal(cityShape({ geometry: { type: 'Polygon', coordinates: [square] } }, 1).kind, 'polygon');
});

test('bounds helpers and alpha colors', () => {
  assert.deepEqual(boundsFromCorners([[1, 2], [3, 4]]), { south: 1, west: 2, north: 3, east: 4 });
  assert.equal(boundsFromCorners(null), null);
  assert.equal(withAlpha('#3168dc', 1), '#3168dcff');
  assert.equal(withAlpha('#3168dc', 0), '#3168dc00');
});

function fakeMaps2D() {
  const made = { polygons: [], circles: [], maps: [] };
  const item = (store) => class {
    constructor(options) { this.options = options; this.listeners = {}; store.push(this); }
    addListener(name, fn) { this.listeners[name] = fn; }
    setMap(m) { this.options.map = m; }
    setCenter(c) { this.options.center = c; }
    setRadius(r) { this.options.radius = r; }
  };
  const lib = {
    Map: class { constructor(el, options) { this.options = options; made.maps.push(this); this.zoom = options.zoom; }
      addListener() {} getZoom() { return this.zoom; } setZoom(z) { this.zoom = z; } panTo(p) { this.center = p; }
      setOptions(o) { Object.assign(this.options, o); } getCenter() { return { lat: () => 40.25, lng: () => -111.65 }; } },
    Polygon: item(made.polygons), Circle: item(made.circles),
  };
  return { made, lib, maps: { ControlPosition: { RIGHT_CENTER: 12 }, event: { trigger() {}, addListenerOnce() {} } } };
}

test('2D view draws polygons and points, and a tap reports the shape', () => {
  const { made, lib, maps } = fakeMaps2D();
  const selected = [];
  const view = createMap2D({ maps, lib, container: {}, onSelect: (s) => selected.push(s) });
  const poly = byuShape({ properties: { OBJECTID: 1, permit_typ: 'Y' }, geometry: { type: 'Polygon', coordinates: [square] } });
  const pin = cityShape({ geometry: { type: 'Point', coordinates: [-111.66, 40.23] } }, 0);
  view.setShapes([poly, pin]);
  assert.equal(made.polygons.length, 1);
  assert.equal(made.circles.length, 1);
  assert.equal(made.polygons[0].options.strokeColor, poly.color);
  made.polygons[0].listeners.click();
  assert.deepEqual(selected, [poly]);
  view.setShapes([]);
  assert.equal(made.polygons[0].options.map, null, 'old shapes are removed from the map');
});

test('2D view is the default style, dark mode swaps the style, user dot is created once', () => {
  const { made, lib, maps } = fakeMaps2D();
  const view = createMap2D({ maps, lib, container: {}, onSelect() {} });
  assert.equal(made.maps[0].options.styles, null);
  assert.equal(made.maps[0].options.disableDefaultUI, true);
  view.setDark(true);
  assert.ok(Array.isArray(made.maps[0].options.styles));
  view.setUser({ lat: 40.25, lng: -111.65 }, 20);
  view.setUser({ lat: 40.2501, lng: -111.65 }, 15);
  assert.equal(made.circles.length, 2, 'accuracy ring + dot, reused on update');
  view.setUser(null);
  assert.equal(made.circles[0].options.map, null);
});

test('3D view builds a hybrid, tilted Photorealistic map and extrudes lots', () => {
  const children = [];
  const events = {};
  class El {
    constructor(options) { this.options = options; this.listeners = {}; }
    addEventListener(name, fn) { this.listeners[name] = fn; }
    append(c) { children.push(c); } remove() { const i = children.indexOf(this); if (i >= 0) children.splice(i, 1); }
    setAttribute() {}
  }
  const lib = { Map3DElement: El, Polygon3DElement: El, Marker3DElement: El, MapMode: { HYBRID: 'HYBRID' } };
  const container = { append(m) { events.map = m; } };
  const selected = [];
  const view = createMap3D({ lib, container, onSelect: (s) => selected.push(s) });
  assert.equal(events.map.options.mode, 'HYBRID');
  assert.equal(events.map.options.tilt, 65);
  const poly = byuShape({ properties: { OBJECTID: 1, permit_typ: 'Y' }, geometry: { type: 'Polygon', coordinates: [square] } });
  view.setShapes([poly]);
  assert.equal(children.length, 1);
  assert.equal(children[0].options.extruded, true);
  assert.equal(children[0].options.outerCoordinates[0].altitude, 10);
  children[0].listeners['gmp-click']();
  assert.deepEqual(selected, [poly]);
  view.setShapes([]);
  assert.equal(children.length, 0);
});

test('lot card links to Area details and the timer for each matching area', () => {
  const feature = { properties: { OBJECTID: 5, Lot_Type: '20Y', permit_typ: 'Y', Descriptio: 'Student parking' } };
  const html = lotCardHtml(feature, [{ area_id: 9, area_name: 'Lot 20Y' }]);
  assert.match(html, /href="#area\/9"/);
  assert.match(html, /href="#car\/9"/);
  assert.match(html, /Lot 20Y/);
});

test('Pages deployment includes the map boundary snapshot and passes the Maps key', async () => {
  const workflow = await readFile(new URL('../.github/workflows/pages.yml', import.meta.url), 'utf8');
  assert.match(workflow, /cp -r css js data site\//);
  assert.match(workflow, /GOOGLE_MAPS_API_KEY/);
});

test('Leaflet is gone from the app', async () => {
  const files = ['index.html', 'css/styles.css', 'css/fullscreen-map.css'];
  for (const dir of ['js', 'js/pages', 'js/lib', 'js/domain', 'js/data', 'js/components']) {
    for (const name of await readdir(new URL(`../${dir}/`, import.meta.url))) if (name.endsWith('.js')) files.push(`${dir}/${name}`);
  }
  for (const file of files) {
    const text = await readFile(new URL(`../${file}`, import.meta.url), 'utf8');
    assert.doesNotMatch(text, /leaflet|window\.L\b/i, `${file} still mentions Leaflet`);
  }
});

test('no Google Maps key is committed to the repository', async () => {
  for (const file of ['config.example.js', 'index.html', 'js/lib/google-maps.js']) {
    const text = await readFile(new URL(`../${file}`, import.meta.url), 'utf8');
    assert.doesNotMatch(text, /AIza[0-9A-Za-z_-]{20,}/, `${file} contains a Google API key`);
  }
});

test('without a key the map canvas shows a clean message and loads nothing', async () => {
  const { initMap, NO_KEY_MESSAGE } = await import('../js/pages/map.js?no-key');
  const canvas = { innerHTML: '' };
  const status = { textContent: 'Loading campus boundaries…' };
  globalThis.window = { APP_CONFIG: { SUPABASE_URL: 'x' } };
  globalThis.document = { querySelector: () => canvas, getElementById: (id) => id === 'map-status' ? status : null };
  try {
    await initMap();
    assert.match(canvas.innerHTML, /class="map-empty"/);
    assert.match(canvas.innerHTML, /GOOGLE_MAPS_API_KEY/);
    assert.equal(NO_KEY_MESSAGE.includes('AIza'), false);
    assert.equal(status.textContent, '');
  } finally { delete globalThis.window; delete globalThis.document; }
});
