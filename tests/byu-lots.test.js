// Unit tests for js/domain/byu-lots.js. The attribute text matches rows seen in BYU's layer on 2026-10-29;
// the square shapes are made up for the test, they are not real lot outlines.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSchedule, parseTimeLimit, lotsFromFeatures, lotsToSql } from "../js/domain/byu-lots.js";
import { evaluate } from "../js/domain/eligibility.js";

const square = (lng, lat, d = 0.001) => ({ type: "Polygon", coordinates: [[[lng, lat], [lng + d, lat], [lng + d, lat + d], [lng, lat + d], [lng, lat]]] });
const feature = (OBJECTID, Lot_Type, permit_typ, Map_Catego, Descriptio, geometry) =>
  ({ type: "Feature", properties: { OBJECTID, Lot_Type, permit_typ, Map_Catego, Descriptio }, geometry });

const FEATURES = [
  feature(1, "22B", "B", "On Campus Student Housing", "Heritage Halls Student Housing parking only at all times.", square(-111.650, 40.250)),
  feature(2, "30G", "G", "Graduate Students", "Permit required from 7:00 a.m. to 4:00 p.m. Monday through Friday.", square(-111.652, 40.252)),
  feature(5, "59Y", "Y", "Students", "Permit required from 7:00 a.m. to 4:00 p.m. Monday through Friday.", square(-111.654, 40.254)),
  feature(8, "29R", "R", "Restricted", "BYU Gas and Car Service Station.", square(-111.656, 40.256)),
  feature(10, "29R", "R", "Restricted", "BYU Auto Repair Shop.", square(-111.657, 40.257)),
  feature(14, "23T", "T", "Timed Parking", "30 minute timed parking from 7:00 a.m. to 6:00 p.m. Monday through Friday.", square(-111.658, 40.258)),
  feature(20, "59Y", "Y", "Students", "Permit required from 7:00 a.m. to 4:00 p.m. Monday through Friday.", square(-111.660, 40.260)),
  feature(30, "99X", "No BYU Parking", "No BYU", "Not BYU parking.", square(-111.662, 40.262)),
];

// Same ids as the permit table in supabase/schema.sql.
const PERMIT_IDS = { Y: 1, G: 2, PP: 3, A: 4, U: 5, YM: 6, YV: 7, B: 8, C: 9, D: 10, V: 11 };
const asDbRules = (rules) => rules.map((r) => ({ ...r, permit_id: r.permit_code ? PERMIT_IDS[r.permit_code] : null }));
const lots = lotsFromFeatures(FEATURES, "2026-10-29");
const lot = (code, n = 1) => lots.find((l) => l.area.source_ref === `byu-arcgis:${code}:${n}`);
const MON = 1, SAT = 6;

test("reads BYU's hours text", () => {
  assert.deepEqual(parseSchedule("Permit required from 7:00 a.m. to 4:00 p.m. Monday through Friday."),
    { days: "Mon-Fri", start: "07:00", end: "16:00", allTimes: false });
  assert.deepEqual(parseSchedule("CFS visitor parking. Permit required from 7:00a.m. to 5:00p.m. Monday through Friday.")?.end, "17:00");
  assert.equal(parseSchedule("Heritage Halls Student Housing parking only at all times.").allTimes, true);
  assert.equal(parseSchedule("BYU Gas and Car Service Station."), null);
  assert.equal(parseTimeLimit("30 minute timed parking from 7:00 a.m. to 6:00 p.m. Monday through Friday."), 30);
});

test("groups polygons by lot type and description, skips non-BYU lots", () => {
  assert.equal(lots.length, 6);
  assert.equal(lot("59Y").area.boundary.type, "MultiPolygon");
  assert.ok(lot("29R", 2), "two different 29R descriptions stay separate");
  assert.ok(!lots.some((l) => l.area.lot_code === "99X"));
  assert.ok(Math.abs(lot("30G").area.latitude - 40.2525) < 1e-6);
});

test("G lot: G permit ok on a weekday morning, Y permit is not", () => {
  const rules = asDbRules(lot("30G").rules);
  assert.equal(evaluate(rules, PERMIT_IDS.G, MON, "08:00").kind, "ok");
  assert.equal(evaluate(rules, PERMIT_IDS.Y, MON, "08:00").kind, "no-permit");
  assert.equal(evaluate(rules, PERMIT_IDS.Y, MON, "06:59").kind, "ok", "open before 7 a.m.");
});

test("permit lots open up after hours and on weekends, but keep the 1-5 a.m. ban", () => {
  const rules = asDbRules(lot("30G").rules);
  assert.equal(evaluate(rules, PERMIT_IDS.Y, MON, "17:00").kind, "ok");
  assert.equal(evaluate(rules, PERMIT_IDS.Y, SAT, "10:00").kind, "ok");
  assert.equal(evaluate(rules, PERMIT_IDS.G, MON, "03:00").kind, "blocked");
});

test("housing lot is residents only at all times, with no 1-5 a.m. ban", () => {
  const rules = asDbRules(lot("22B").rules);
  assert.equal(evaluate(rules, PERMIT_IDS.B, SAT, "03:00").kind, "ok");
  assert.equal(evaluate(rules, PERMIT_IDS.Y, SAT, "20:00").kind, "no-permit");
});

test("timed lot shows a time limit during posted hours", () => {
  const r = evaluate(asDbRules(lot("23T").rules), PERMIT_IDS.Y, MON, "09:00");
  assert.equal(r.kind, "limit");
  assert.match(r.text, /30 min limit/);
});

test("restricted lots get no rules instead of guessed ones", () => {
  assert.equal(lot("29R").rules.length, 0);
});

test("SQL upserts by source_ref and never turns a missing permit into an open rule", () => {
  const out = lotsToSql(lots, "2026-10-29");
  assert.match(out, /ON CONFLICT \(source_ref\) DO UPDATE/);
  assert.match(out, /JOIN permit p ON p\.permit_code = 'G'/);
  assert.match(out, /^BEGIN;/m);
  assert.match(out, /COMMIT;\n$/);
});
