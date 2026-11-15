// Mobile polish: expired timer pill, all lots on the map (matches highlighted), default campus framing.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fabText, fabLabel } from "../js/components/car-fab.js";
import { allByuShapes, campusBounds, shapeStyle, cityShape, CAMPUS_CENTER } from "../js/domain/map-geometry.js";
import { createMap3D } from "../js/pages/map-3d.js";
import { mapStatusText } from "../js/pages/map.js";

const MIN = 60000;
const square = (lng, lat, d = 0.0005) => [[lng, lat], [lng + d, lat], [lng + d, lat + d], [lng, lat + d], [lng, lat]];
const lot = (id, code, lng, lat) => ({ properties: { OBJECTID: id, permit_typ: code, Lot_Type: `${id}${code}` }, geometry: { type: "Polygon", coordinates: [square(lng, lat)] } });

test("timer pill: h:mm while time is left, then \"Time's up\" instead of a negative count", () => {
  assert.equal(fabText(75 * MIN), "1:15");
  assert.equal(fabText(0), "0:00");
  assert.equal(fabText(-30 * 1000), "0:00", "the first minute over still reads 0:00");
  assert.equal(fabText(-12 * MIN), "Time's up");
  assert.equal(fabText(-(146 * 60 + 28) * MIN), "Time's up", "a timer left running for days never shows -146:28");
  for (const ms of [-MIN, -90 * MIN, -7 * 24 * 60 * MIN]) assert.doesNotMatch(fabText(ms), /-|\d+:\d\d/);
});

test("timer pill label keeps the exact overage and points to ending the timer", () => {
  assert.equal(fabLabel(-(146 * 60 + 28) * MIN), "Parking timer: time is up, ended 146 h 28 min ago. Open to end the timer.");
  assert.match(fabLabel(-20 * 1000), /ended 1 min ago/);
  assert.match(fabLabel(30 * MIN), /30 min left/);
});

test("the map draws every BYU lot; matching lots are highlighted and drawn last", () => {
  const features = [lot(1, "Y", -111.65, 40.25), lot(2, "A", -111.649, 40.251), lot(3, "G", -111.648, 40.249)];
  const shapes = allByuShapes(features, new Set([2]));
  assert.equal(shapes.length, 3, "non-matching lots stay on the map");
  assert.deepEqual(shapes.map(s => s.matched), [false, false, true]);
  assert.equal(shapes.at(-1).source.feature.properties.OBJECTID, 2);
  assert.equal(shapes.at(-1).label, "2A");
  assert.equal(allByuShapes(features).every(s => !s.matched), true, "no permit match: all lots muted, none hidden");
  const bright = shapeStyle(shapes.at(-1)), muted = shapeStyle(shapes[0]);
  assert.ok(bright.fillOpacity > muted.fillOpacity * 3 && bright.strokeWeight > muted.strokeWeight);
});

test("default framing covers the campus lots and ignores far-off outliers", () => {
  const features = [lot(1, "Y", -111.655, 40.244), lot(2, "A", -111.645, 40.258), lot(3, "R", -111.6238, 40.2011)];
  const bounds = campusBounds(features);
  assert.ok(bounds.south > 40.24 && bounds.north < 40.26, "the R lot 5 km south does not stretch the view");
  assert.ok(bounds.west < CAMPUS_CENTER.lng && bounds.east > CAMPUS_CENTER.lng);
  assert.equal(campusBounds([]), null);
  // The center sits on main campus (between the WSC and the JSB), not north by the stadium or in Orem.
  assert.ok(CAMPUS_CENTER.lat > 40.246 && CAMPUS_CENTER.lat < 40.252);
});

test("3D: muted lots lie flat, matches stand up, and city lots wait until the camera is close", () => {
  const children = [];
  class El {
    constructor(options) { Object.assign(this, options); this.options = options; this.listeners = {}; }
    addEventListener(name, fn) { this.listeners[name] = fn; }
    append(el) { children.push(el); }
    setAttribute() {}
    remove() { const i = children.indexOf(this); if (i >= 0) children.splice(i, 1); }
  }
  const container = { append(el) { this.map = el; }, classList: { toggle() {} } };
  const selected = [];
  const view = createMap3D({ lib: { Map3DElement: El, Polygon3DElement: El, Marker3DElement: El }, container, onSelect: s => selected.push(s) });
  const [muted, match] = allByuShapes([lot(1, "Y", -111.65, 40.25), lot(2, "A", -111.649, 40.251)], new Set([2]));
  const city = cityShape({ geometry: { type: "Polygon", coordinates: [square(-111.66, 40.234)] } }, 0);
  view.setShapes([muted, match, city]);
  assert.equal(children.length, 2, "city outlines are not added at the default campus range");
  assert.equal(children[0].extruded, false);
  assert.equal(children[1].extruded, true);
  children[0].listeners["gmp-click"]();
  assert.equal(selected[0], muted, "tapping a muted lot still opens its details");
  container.map.range = 1500;
  container.map.listeners["gmp-rangechange"]();
  assert.equal(children.length, 3, "zooming in adds the city lots");
  container.map.range = 4000;
  container.map.listeners["gmp-rangechange"]();
  assert.equal(children.length, 2);
});

test("map status says what is highlighted and never reads \"0 matching mapped boundaries\"", () => {
  assert.equal(mapStatusText(12, 189), "12 of 189 BYU lot sections match your permit and time (highlighted).");
  assert.equal(mapStatusText(0, 189), "All 189 BYU lot sections shown. None match your permit and time right now.");
  assert.equal(mapStatusText(0, 0), "");
});

test("phone layout keeps the status chip off the top of the map and Provo lots on by default", async () => {
  const css = await readFile(new URL("../css/fullscreen-map.css", import.meta.url), "utf8");
  const phone = css.slice(css.indexOf("@media (max-width: 600px)"));
  assert.match(phone, /\.fs-shell \.map-status \{[^}]*clip-path: inset\(50%\)/);
  assert.match(phone, /\.fs-shell \.map-controls \{[^}]*flex-direction: column/);
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  assert.match(html, /id="city-toggle" checked/);
});
