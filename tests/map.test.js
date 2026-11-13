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
  const made = { polygons: [], circles: [], maps: [], overlays: [] };
  const item = (store) => class {
    constructor(options) { this.options = options; this.listeners = {}; store.push(this); }
    addListener(name, fn) { this.listeners[name] = fn; }
    setMap(m) { this.options.map = m; }
    setCenter(c) { this.options.center = c; }
    setRadius(r) { this.options.radius = r; }
  };
  const lib = {
    Map: class { constructor(el, options) { this.options = options; made.maps.push(this); this.zoom = options.zoom; }
      addListener(name, fn) { (this.listeners ??= {})[name] = fn; } getZoom() { return this.zoom; } setZoom(z) { this.zoom = z; } panTo(p) { this.center = p; }
      setOptions(o) { Object.assign(this.options, o); } getCenter() { return { lat: () => 40.25, lng: () => -111.65 }; } },
    Polygon: item(made.polygons), Circle: item(made.circles),
    OverlayView: class {
      constructor() { made.overlays.push(this); }
      setMap(map) { this.map = map; if (map) { this.onAdd(); this.draw(); } else this.onRemove(); }
      getPanes() { return { floatPane: { append() {} } }; }
      getProjection() { return { fromLatLngToDivPixel: () => ({ x: 40, y: 60 }) }; }
    },
  };
  return { made, lib, maps: { OverlayView: lib.OverlayView, LatLng: class { constructor(p) { Object.assign(this, p); } }, ControlPosition: { RIGHT_CENTER: 12 }, event: { trigger() {}, addListenerOnce() {} } } };
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

test('2D view starts with road map styling and supports dark mode', () => {
  const { made, lib, maps } = fakeMaps2D();
  const view = createMap2D({ maps, lib, container: {}, onSelect() {} });
  assert.equal(made.maps[0].options.styles, null);
  assert.equal(made.maps[0].options.disableDefaultUI, true);
  view.setDark(true);
  assert.ok(Array.isArray(made.maps[0].options.styles));

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
  view.zoomBy(1);
  assert.equal(events.map.range, 600);
  view.zoomBy(-1);
  assert.equal(events.map.range, 1200);
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
  assert.match(workflow, /cp -r css js data assets site\//);
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

test('2D satellite retains labels, restores the dark roadmap, and uses shared zoom controls', () => {
  const { made, lib, maps } = fakeMaps2D();
  const view = createMap2D({ maps, lib, container: {}, dark: true, onSelect() {} });
  assert.equal(made.maps[0].options.zoomControl, false);
  view.setStyle('hybrid');
  assert.equal(made.maps[0].options.mapTypeId, 'hybrid');
  assert.equal(made.maps[0].options.styles, null);
  view.setDark(false);
  view.setDark(true);
  view.setStyle('roadmap');
  assert.equal(made.maps[0].options.mapTypeId, 'roadmap');
  assert.ok(made.maps[0].options.styles.length);
  view.zoomBy(1);
  assert.equal(made.maps[0].zoom, 16);
  view.zoomBy(-1);
  assert.equal(made.maps[0].zoom, 15);
});

function cursorDocument() {
  return { createElement() { return { style: {}, children: [], setAttribute() {}, append(...els) { this.children.push(...els); }, remove() { this.removed = true; } }; } };
}

test('2D cursor reuses its overlay, projects updates, hides cleared headings, and removes everything', () => {
  const { made, lib, maps } = fakeMaps2D();
  const container = { ownerDocument: cursorDocument() };
  const view = createMap2D({ maps, lib, container, onSelect() {} });
  view.setUser({ lat: 40.25, lng: -111.65 }, 20, 90);
  assert.equal(made.circles.length, 1, 'only the geographic accuracy disc uses a Circle');
  assert.equal(made.overlays.length, 1);
  const cursor = made.overlays[0];
  const cone = cursor.element.children.find(el => el.className === 'map-user-heading');
  assert.equal(cone.hidden, false);
  assert.equal(cone.style.transform, 'rotate(90deg)');
  assert.equal(cursor.element.style.left, '40px');
  view.setUser({ lat: 40.251, lng: -111.651 }, 10, null);
  assert.equal(made.overlays.length, 1);
  assert.equal(made.circles.length, 1);
  assert.equal(made.circles[0].options.radius, 10);
  assert.equal(cone.hidden, true);
  view.setUser({ lat: 40.251, lng: -111.651 }, 10, 0);
  assert.equal(cone.hidden, false, 'north is a valid heading');
  view.setUser({ lat: 40.251, lng: -111.651 }, 10, NaN);
  assert.equal(cone.hidden, true);
  view.setUser({ lat: 40.251, lng: -111.651 }, 10, 90, 0);
  assert.equal(cone.hidden, true, 'stationary GPS heading is suppressed');
  view.setUser(null);
  assert.equal(cursor.map, null);
  assert.equal(cursor.element.removed, true);
  assert.equal(made.circles[0].options.map, null);
});

function fakeMaps3D() {
  const children = [], classes = new Set();
  class El {
    constructor(options) { Object.assign(this, options); this.options = options; this.listeners = {}; this.attributes = {}; }
    addEventListener(name, fn) { this.listeners[name] = fn; }
    append(el) { children.push(el); }
    setAttribute(name, value) { this.attributes[name] = value; }
    remove() { const i = children.indexOf(this); if (i >= 0) children.splice(i, 1); }
  }
  const lib = { Map3DElement: El, Polygon3DElement: El, Marker3DElement: El };
  const container = { append(el) { this.map = el; }, classList: { toggle(name, on) { if (on) classes.add(name); else classes.delete(name); } } };
  return { children, classes, lib, container };
}

test('3D switches native dark roadmap and night-treated hybrid without changing views', () => {
  const f = fakeMaps3D();
  const view = createMap3D({ ...f, dark: true, onSelect() {} });
  const map = f.container.map;
  assert.equal(map.colorScheme, 'DARK');
  assert.equal(map.attributes['color-scheme'], 'DARK');
  assert.ok(f.classes.has('map-layer-3d--night'));
  view.setDark(false);
  assert.equal(map.colorScheme, 'LIGHT');
  assert.equal(f.classes.size, 0);
  view.setStyle('roadmap'); view.setDark(true);
  assert.equal(map.mode, 'ROADMAP');
  assert.equal(map.colorScheme, 'DARK');
  assert.equal(f.classes.size, 0);
  view.setStyle('hybrid');
  assert.equal(map.mode, 'HYBRID');
  assert.ok(f.classes.has('map-layer-3d--night'));
});

test('3D cursor reuses ground polygons and removes the heading fan when heading clears', () => {
  const f = fakeMaps3D();
  const view = createMap3D({ ...f, onSelect() {} });
  view.setUser({ lat: 40.25, lng: -111.65 }, 20, 0);
  const original = [...f.children];
  assert.equal(original.length, 5, 'accuracy, halo, heading fan, shadow and dot');
  assert.ok(original.every(el => el.zIndex >= 1000), 'cursor stays above permit overlays');
  const fan = original.find(el => el.outerCoordinates.length === 15);
  assert.ok(fan.outerCoordinates.slice(1).every(p => p.lat > 40.25), 'north fan points north');
  view.setUser({ lat: 40.251, lng: -111.65 }, 10, 90);
  assert.deepEqual(f.children, original, 'updates reuse every polygon');
  assert.ok(fan.outerCoordinates.slice(1).every(p => p.lng > -111.65), 'east fan points east');
  view.setUser({ lat: 40.251, lng: -111.65 }, 10, null);
  assert.equal(f.children.length, 4);
  assert.ok(!f.children.includes(fan));
  view.setUser({ lat: 40.251, lng: -111.65 }, 10, 90, 0);
  assert.equal(f.children.length, 4, 'stationary GPS heading stays hidden');
  view.setUser(null);
  assert.equal(f.children.length, 0);
});

test('map controls retain 3D while switching basemaps and apply theme changes to both views', async () => {
  const two = fakeMaps2D(), three = fakeMaps3D();
  let theme = 'dark', themeChanged;
  const nodes = new Map();
  const doc = {
    createElement() {
      const classes = new Set(), attrs = {};
      return { ownerDocument: doc, children: [], classList: { toggle(name, on) { if (on) classes.add(name); else classes.delete(name); }, contains: name => classes.has(name) },
        append(el) { this.children.push(el); }, setAttribute(name, value) { attrs[name] = value; }, getAttribute: name => attrs[name], addEventListener() {}, remove() {} };
    },
    documentElement: { getAttribute: () => theme },
    getElementById: id => nodes.get(id) ?? null,
    querySelector: () => nodes.get('parking-map'),
  };
  for (const id of ['parking-map', 'map-mode-2d', 'map-mode-3d', 'map-style', 'map-status']) nodes.set(id, doc.createElement());
  const previousFetch = globalThis.fetch;
  globalThis.window = { APP_CONFIG: { GOOGLE_MAPS_API_KEY: 'test-key' }, google: { maps: { ...two.maps, importLibrary: async name => name === 'maps' ? two.lib : three.lib } } };
  globalThis.document = doc;
  globalThis.MutationObserver = class { constructor(fn) { themeChanged = fn; } observe() {} };
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ type: 'FeatureCollection', features: [] }) });
  try {
    const controller = await import('../js/pages/map.js?style-controls');
    await controller.initMap();
    await controller.setMode('3d');
    const layer = nodes.get('parking-map').children[1], map = layer.children[0];
    assert.equal(map.mode, 'ROADMAP');
    assert.equal(map.colorScheme, 'DARK');
    await controller.toggleMapStyle();
    assert.equal(nodes.get('map-mode-3d').getAttribute('aria-pressed'), 'true');
    assert.equal(nodes.get('map-style').getAttribute('aria-pressed'), 'true');
    assert.equal(map.mode, 'HYBRID');
    assert.equal(two.made.maps[0].options.mapTypeId, 'hybrid');
    assert.ok(layer.classList.contains('map-layer-3d--night'));
    theme = 'light'; themeChanged();
    assert.equal(map.colorScheme, 'LIGHT');
    assert.equal(layer.classList.contains('map-layer-3d--night'), false);
    await controller.toggleMapStyle();
    assert.equal(map.mode, 'ROADMAP');
    assert.equal(nodes.get('map-style').getAttribute('aria-pressed'), 'false');
    assert.equal(two.made.maps[0].options.styles, null);
    theme = 'dark'; themeChanged();
    assert.equal(map.colorScheme, 'DARK');
    assert.ok(two.made.maps[0].options.styles.length);
    assert.equal(nodes.get('map-mode-3d').getAttribute('aria-pressed'), 'true');
  } finally {
    globalThis.fetch = previousFetch;
    delete globalThis.window; delete globalThis.document; delete globalThis.MutationObserver;
  }
});

test('3D night treatment strengthens permit overlays without changing their hue', () => {
  const f = fakeMaps3D();
  const view = createMap3D({ ...f, onSelect() {} });
  const shape = byuShape({ properties: { OBJECTID: 1, permit_typ: 'Y' }, geometry: { type: 'Polygon', coordinates: [square] } });
  view.setShapes([shape]);
  const polygon = f.children[0];
  view.setDark(true);
  assert.equal(polygon.fillColor, withAlpha(shape.color, 0.66));
  assert.equal(polygon.strokeColor, shape.color);
  assert.equal(polygon.strokeWidth, 3);
  view.setStyle('roadmap');
  assert.equal(polygon.fillColor, withAlpha(shape.color, 0.45));
  assert.equal(polygon.strokeWidth, 2);
});

for (const reducedMotion of [false, true]) {
  test(`3D halo honors reduced motion (${reducedMotion}) and cancels animation on removal`, () => {
    const f = fakeMaps3D();
    let frame, cancelled = [];
    f.container.ownerDocument = { defaultView: {
      matchMedia: () => ({ matches: reducedMotion }),
      requestAnimationFrame(fn) { frame = fn; return 1; }, cancelAnimationFrame(id) { cancelled.push(id); },
    } };
    const view = createMap3D({ ...f, onSelect() {} });
    view.setUser({ lat: 40.25, lng: -111.65 }, 15);
    assert.equal(typeof frame, reducedMotion ? 'undefined' : 'function');
    const halo = f.children[1], original = halo.outerCoordinates;
    if (frame) { frame(1200); assert.notDeepEqual(halo.outerCoordinates, original); }
    const dot = f.children.at(-1), beforeZoom = dot.outerCoordinates[0].lng;
    f.container.map.range = 600;
    f.container.map.listeners['gmp-rangechange']();
    assert.ok(dot.outerCoordinates[0].lng < beforeZoom, 'ground footprint shrinks when zooming in');
    view.setUser(null);
    assert.equal(f.children.length, 0);
    assert.deepEqual(cancelled, reducedMotion ? [] : [1]);
  });
}
