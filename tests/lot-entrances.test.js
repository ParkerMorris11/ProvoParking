// Driving directions go to each lot's drive-in entrance (scripts/build-lot-entrances.py), not the middle of a section.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { LOT_ENTRANCES } from "../js/data/lot-entrances.js";
import { directionsUrl, appleDirectionsUrl, entrancePoint } from "../js/lib/format.js";
import { facilityDirectionsPoint } from "../js/domain/city-parking.js";

const sections = JSON.parse(readFileSync(new URL("../data/verified-byu-sections.json", import.meta.url)));
const meters = (a, b) => Math.hypot((a[0] - b[0]) * 110540, (a[1] - b[1]) * 111320 * Math.cos((a[0] * Math.PI) / 180));

test("almost every verified section has an entrance, each close to its section", () => {
  const missing = sections.filter((s) => !LOT_ENTRANCES[s.object_id]).map((s) => s.lot_code);
  assert.ok(missing.length <= 3, `no entrance for ${missing}`);
  for (const s of sections) {
    const e = LOT_ENTRANCES[s.object_id];
    if (e) assert.ok(meters(e, [s.latitude, s.longitude]) < 150, `${s.lot_code} entrance is ${meters(e, [s.latitude, s.longitude])} m away`);
  }
});

test("driving links use the entrance; walking links and sample lots use the pin", () => {
  const area = { area_id: 99, latitude: 40.251922, longitude: -111.648828, source_feature_id: 147, is_sample_data: false };
  const [lat, lng] = LOT_ENTRANCES[147];
  assert.equal(directionsUrl(area, "driving"), `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${lat},${lng}`)}&travelmode=driving`);
  assert.match(appleDirectionsUrl(area, "driving"), new RegExp(`daddr=${encodeURIComponent(`${lat},${lng}`)}&dirflg=d`));
  assert.match(directionsUrl(area, "walking"), /40\.251922%2C-111\.648828/);
  assert.equal(entrancePoint({ ...area, is_sample_data: true }), null);
  assert.equal(entrancePoint({ latitude: 1, longitude: 2 }), null);
});

test("city lot directions land inside the lot even when its box center does not", () => {
  const city = JSON.parse(readFileSync(new URL("../data/provo-city-parking.json", import.meta.url))).features;
  const inside = (pt, ring) => {
    let hit = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i], [xj, yj] = ring[j];
      if ((yi > pt.latitude) !== (yj > pt.latitude) && pt.longitude < ((xj - xi) * (pt.latitude - yi)) / (yj - yi) + xi) hit = !hit;
    }
    return hit;
  };
  for (const f of city.filter((f) => f.geometry.type === "Polygon")) {
    assert.ok(inside(facilityDirectionsPoint(f), f.geometry.coordinates[0]), f.properties.name);
  }
});
