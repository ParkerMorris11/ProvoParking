import test from "node:test";
import assert from "node:assert/strict";
import { lotSuggestions, totalMinutes, fitReminder } from "../js/domain/timer-picker.js";

const areas = [
  { area_id: 1, area_name: "Lot 20 section A", lot_code: "20", latitude: 40.2575, longitude: -111.6545 },
  { area_id: 2, area_name: "Lot 2V visitor", lot_code: "2V", latitude: 40.2486, longitude: -111.6493 },
  { area_id: 3, area_name: "Lot 44 section C", lot_code: "44", latitude: 40.2600, longitude: -111.6600 },
  { area_id: 9, area_name: "Sample lot", is_sample_data: true },
];

test("with no typing, suggestions lead with last time, then favorites, then nearby lots", () => {
  const rows = lotSuggestions({
    areas, lastAreaId: "3", favoriteIds: new Set([2]), favoriteNames: new Map([[2, "Class"]]),
    position: { latitude: 40.2576, longitude: -111.6546 },
  });
  assert.deepEqual(rows.map(r => [r.id, r.kind]), [[3, "last"], [2, "favorite"], [1, "near"]]);
  assert.equal(rows[1].sub, "Saved as “Class”");
  assert.match(rows[2].sub, /ft away|mi away/);
});

test("typing searches lots by number or favorite nickname and never offers sample lots", () => {
  assert.deepEqual(lotSuggestions({ areas, query: "20" }).map(r => r.id), [1]);
  assert.deepEqual(lotSuggestions({ areas, query: "class", favoriteIds: new Set([2]), favoriteNames: new Map([[2, "Class"]]) }).map(r => r.id), [2]);
  assert.deepEqual(lotSuggestions({ areas, query: "sample" }), []);
});

test("the wheels add up to minutes and the reminder always fires before the end", () => {
  assert.equal(totalMinutes(2, 30), 150);
  assert.equal(totalMinutes(0, 0), 0);
  assert.equal(totalMinutes(99, 99), 12 * 60 + 55);
  assert.equal(fitReminder(10, 150), 10);
  assert.equal(fitReminder(10, 10), 0);
  assert.equal(fitReminder(30, 15), 0);
});
