import test from "node:test";
import assert from "node:assert/strict";
import { cleanAreaName, buildingLabel, labelAreas } from "../js/domain/lot-names.js";

test("lot titles drop the GIS section id", () => {
  assert.equal(cleanAreaName("BYU Lot 1A (section 147)"), "BYU Lot 1A");
  assert.equal(cleanAreaName("BYU Lot 59Y"), "BYU Lot 59Y");
  assert.equal(buildingLabel("BENSON (EZRA TAFT) BUILDING"), "Benson Building");
  assert.equal(buildingLabel("Jesse Knight Building"), "Jesse Knight Building");
});

test("only lots with several sections get a north-to-south subtitle", () => {
  const areas = labelAreas([
    { area_id: 1, area_name: "BYU Lot 2A (section 58)", lot_code: "2A", operator: "BYU", latitude: 40.2511, longitude: -111.6471 },
    { area_id: 2, area_name: "BYU Lot 2A (section 59)", lot_code: "2A", operator: "BYU", latitude: 40.2516, longitude: -111.6481 },
    { area_id: 3, area_name: "BYU Lot 59Y", lot_code: "59Y", operator: "BYU", latitude: 40.2438, longitude: -111.649 },
  ], [{ name: "MARRIOTT (J WILLARD) CENTER", latitude: 40.2540, longitude: -111.6493 }]);
  assert.deepEqual(areas.map((a) => a.area_name), ["BYU Lot 2A", "BYU Lot 2A", "BYU Lot 59Y"]);
  assert.equal(areas[1].section_note, "Part 1 of 2 · near Marriott Center");
  assert.equal(areas[0].section_note, "Part 2 of 2 · near Marriott Center");
  assert.equal(areas[2].section_note, null);
});
