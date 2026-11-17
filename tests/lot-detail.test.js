// Lot page: contextual back link, one directions control, key facts; permit list doubles as the color legend.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { backTarget, nextOrigin, lotFacts, parseSection } from "../js/domain/lot-facts.js";
import { permitOptions } from "../js/pages/fullscreen-map.js";
import { permitCategory } from "../js/domain/map-geometry.js";
import { state } from "../js/state.js";
import { renderAreaDetail } from "../js/pages/area-detail.js";

test("back link names the screen the lot was opened from", () => {
  assert.deepEqual(backTarget({ view: "favorites" }), { href: "#favorites", label: "Back to favorites" });
  assert.deepEqual(backTarget({ view: "lots" }), { href: "#lots", label: "Back to all lots" });
  assert.deepEqual(backTarget({ view: "areas", results: true }), { href: "#areas", label: "Back to results" });
  assert.deepEqual(backTarget({ view: "areas", results: false }), { href: "#areas", label: "Back to map" });
  assert.deepEqual(backTarget(null), { href: "#areas", label: "Back to map" });
});

test("origin is set when entering a lot and kept across lot-to-lot and timer hops", () => {
  let o = nextOrigin(null, { from: "favorites", to: "area" });
  assert.deepEqual(o, { view: "favorites", results: false });
  o = nextOrigin(o, { from: "area", to: "area" });
  assert.equal(o.view, "favorites");
  assert.deepEqual(nextOrigin(null, { from: "areas", to: "area", results: true }), { view: "areas", results: true });
  assert.equal(nextOrigin(o, { from: "area", to: "favorites" }), o);
});

test("key facts come from the lot's rules", () => {
  const permits = [{ permit_id: 1, permit_code: "Y", permit_name: "Y Undergraduate" }, { permit_id: 2, permit_code: "A", permit_name: "A Employee" }];
  const rules = [
    { permit_id: 1, days_of_week: "Mon-Fri", start_time: "07:00", end_time: "15:59" },
    { permit_id: 2, days_of_week: "Mon-Fri", start_time: "07:00", end_time: "15:59" },
    { permit_id: null, days_of_week: "Mon-Fri", start_time: "00:00", end_time: "06:59", blocked_start: "01:00", blocked_end: "05:00" },
    { permit_id: null, days_of_week: "Mon-Fri", start_time: "16:00", end_time: "23:59" },
  ];
  const area = { area_id: 9, latitude: 40.25, longitude: -111.65, section_note: "Part 3 of 4 · near Indoor Practice Facility" };
  const f = lotFacts({ area, rules, permits, day: 2, destination: { point: { latitude: 40.2525, longitude: -111.65 }, name: "JKB" } });
  assert.deepEqual(f.permits.map(p => p.code), ["A", "Y"]);
  assert.equal(f.permits[1].color, permitCategory("Y").color);
  assert.equal(f.permitHours, "7 AM–4 PM");
  assert.equal(f.closedHours, "1 AM–5 AM");
  assert.match(f.distance.text, /mi|ft/);
  assert.equal(f.distance.from, "from JKB");
  assert.deepEqual(f.section, { index: 3, total: 4, near: "Indoor Practice Facility" });
  assert.equal(parseSection(null), null);
});

test("lot page has one directions control (next to the heart) and the facts grid", () => {
  const box = { innerHTML: "", addEventListener() {}, focus() {} };
  const back = { attrs: {}, textContent: "", setAttribute(k, v) { this.attrs[k] = v; } };
  globalThis.document = { activeElement: null, getElementById: (id) => id === "area-back" ? back : box };
  state.areas = [{ area_id: 7, area_name: "BYU Lot 37Y", operator: "BYU", lot_code: "37Y", is_sample_data: false, latitude: 40.25, longitude: -111.65, section_note: "Part 3 of 4" }];
  state.permits = [{ permit_id: 1, permit_code: "Y", permit_name: "Y Undergraduate" }];
  state.rulesByArea = new Map([[7, [{ permit_id: 1, days_of_week: "Mon-Fri", start_time: "07:00", end_time: "15:59" }]]]);
  state.favoriteIds = new Set(); state.towById = new Map(); state.destinations = [];
  state.find = { permitId: 1, day: 2, time: "10:00", live: false };
  state.lotOrigin = { view: "favorites", results: false };
  renderAreaDetail(7);
  assert.equal(back.attrs.href, "#favorites");
  assert.equal(back.textContent, "← Back to favorites");
  const html = box.innerHTML;
  assert.equal((html.match(/directions-btn/g) || []).length, 1);
  assert.doesNotMatch(html, /Other directions options|Directions · /);
  assert.match(html, /class="elig status-pill ok"/);
  assert.match(html, /<dl class="lot-facts">/);
  assert.match(html, /Permit hours<\/dt><dd>7 AM–4 PM/);
  assert.match(html, /Section<\/dt><dd>3 of 4/);
});

test("permit list rows carry the map color and show each code once", () => {
  const rows = permitOptions([{ permit_id: 1, permit_code: "A", permit_name: "A Employee" }, { permit_id: 2, permit_code: "C", permit_name: "C Helaman Halls" }]);
  assert.equal(rows[0].value, "");
  assert.deepEqual(rows.slice(1).map(r => [r.code, r.name, r.color]), [["A", "Employee", permitCategory("A").color], ["C", "Helaman Halls", permitCategory("C").color]]);
});

test("only one permit color legend: the separate map legend and help copy are gone", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  assert.doesNotMatch(html, /id="map-legend"|id="help-legend"|PERMIT TYPES/);
  const schedule = readFileSync(new URL("../js/components/rule-schedule.js", import.meta.url), "utf8");
  assert.match(schedule, /schedule-legend/); // the times legend stays
});
