// Turns BYU's public "Campus Parking Lots" ArcGIS layer (GeoJSON) into our parking_area + parking_rule rows.
// Pure functions so they can be unit tested (tests/byu-lots.test.js); scripts/import-byu-lots.mjs uses them.
// Layer: https://byu.maps.arcgis.com/home/item.html?id=0010decde49642f5b86e0c2b164578eb (public, no license stated).

export const BYU_LAYER_ITEM_URL = "https://byu.maps.arcgis.com/home/item.html?id=0010decde49642f5b86e0c2b164578eb";
export const BYU_LAYER_QUERY_URL = "https://services.arcgis.com/FvF9MZKp3JWPrSkg/arcgis/rest/services/Campus_Parking_Lots/FeatureServer/0/query";

// Lot permit type -> permit codes allowed in it, inverted from the cited permit list in supabase/schema.sql
// (for example "G permit: valid in G, Y, and U lots" puts G under Y and U).
export const LOT_PERMITS = {
  Y: ["Y", "G", "A", "YM", "YV"],
  U: ["U", "Y", "G", "A", "YM", "YV", "B", "C", "D"],
  G: ["G", "A"],
  A: ["A"],
  C: ["C", "A"],
  B: ["B"],
  D: ["D"],
  BCD: ["B", "C", "D"],
  YM: ["YM"],
  YV: ["YV"],
  V: ["V"],
};
// On-campus housing lots are exempt from the 1-5 a.m. ban (BYU parking regulations).
const HOUSING = new Set(["B", "C", "D", "BCD", "YM", "YV"]);
const SKIP = new Set(["No BYU Parking"]);

const DAY_WORDS = { sunday: "Sun", monday: "Mon", tuesday: "Tue", wednesday: "Wed", thursday: "Thu", friday: "Fri", saturday: "Sat" };
const OTHER_DAYS = { "Mon-Fri": "Sat-Sun", "Mon-Sat": "Sun", "Mon-Thu": "Fri-Sun" };

function to24(h, m, ap) {
  let hours = Number(h) % 12;
  if (/p/i.test(ap)) hours += 12;
  return `${String(hours).padStart(2, "0")}:${m}`;
}

// "Permit required from 7:00 a.m. to 4:00 p.m. Monday through Friday." -> { days, start, end }
// "...parking only at all times." -> { days: "All", start: "00:00", end: "23:59", allTimes: true }
// Anything else -> null (the lot gets no rules and shows "No rules on file").
export function parseSchedule(text) {
  if (typeof text !== "string") return null;
  if (/at all times/i.test(text)) return { days: "All", start: "00:00", end: "23:59", allTimes: true };
  const t = /from\s+(\d{1,2}):(\d{2})\s*([ap])\.?\s*m\.?\s+to\s+(\d{1,2}):(\d{2})\s*([ap])\.?\s*m\.?\s+(\w+)\s+through\s+(\w+)/i.exec(text);
  if (!t) return null;
  const a = DAY_WORDS[t[7].toLowerCase()], b = DAY_WORDS[t[8].toLowerCase()];
  if (!a || !b) return null;
  return { days: `${a}-${b}`, start: to24(t[1], t[2], t[3]), end: to24(t[4], t[5], t[6]), allTimes: false };
}

// "30 minute timed parking" -> 30, "2 hour timed parking" -> 120
export function parseTimeLimit(text) {
  const t = /(\d+)\s*(minute|min|hour|hr)s?\b[^.]*timed/i.exec(text || "");
  if (!t) return null;
  return Number(t[1]) * (/^h/i.test(t[2]) ? 60 : 1);
}

function minuteBefore(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  const t = (h * 60 + m + 1439) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

function round6(n) { return Math.round(n * 1e6) / 1e6; }

function roundCoords(c) { return Array.isArray(c[0]) ? c.map(roundCoords) : [round6(c[0]), round6(c[1])]; }

function polygonsOf(geometry) {
  if (!geometry) return [];
  if (geometry.type === "Polygon") return [geometry.coordinates];
  if (geometry.type === "MultiPolygon") return geometry.coordinates;
  return [];
}

// Shoelace area of a ring in degrees (only used to pick the biggest piece for the label point).
function ringArea(ring) {
  let s = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) s += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1]);
  return Math.abs(s / 2);
}

// Label point: average of the outer ring of the largest polygon. Good enough for a marker and directions.
export function labelPoint(polygons) {
  const biggest = [...polygons].sort((p, q) => ringArea(q[0]) - ringArea(p[0]))[0];
  const ring = biggest[0].slice(0, -1).length ? biggest[0].slice(0, -1) : biggest[0];
  const sum = ring.reduce((acc, [lng, lat]) => [acc[0] + lng, acc[1] + lat], [0, 0]);
  return { longitude: round6(sum[0] / ring.length), latitude: round6(sum[1] / ring.length) };
}

function rulesFor(permitType, description, verifiedOn) {
  const schedule = parseSchedule(description);
  if (!schedule) return [];
  const housing = HOUSING.has(permitType);
  const block = housing ? { blocked_start: null, blocked_end: null } : { blocked_start: "01:00", blocked_end: "05:00" };
  const base = { source_url: BYU_LAYER_ITEM_URL, last_verified_on: verifiedOn };
  const byuText = `BYU map: "${description.trim()}"`;
  const rules = [];
  const during = { days_of_week: schedule.days, start_time: schedule.start, end_time: schedule.end, ...block, ...base };

  if (permitType === "T") {
    const limit = parseTimeLimit(description);
    if (!limit) return [];
    rules.push({ ...during, permit_code: null, max_stay_minutes: limit, rule_note: byuText });
  } else if (LOT_PERMITS[permitType]) {
    for (const code of LOT_PERMITS[permitType]) rules.push({ ...during, permit_code: code, max_stay_minutes: null, rule_note: byuText });
  } else {
    return []; // R, EV and other special stalls: no rules we can state.
  }

  // Outside the posted hours the layer lists no permit requirement, so we treat the lot as open.
  // This is our reading of BYU's text, not a BYU statement; the note says so.
  if (!schedule.allTimes) {
    const note = `Outside ${schedule.start}-${schedule.end} ${schedule.days} BYU's map lists no permit requirement (our reading; check posted signs).`;
    rules.push({ ...base, ...block, days_of_week: schedule.days, start_time: schedule.end, end_time: minuteBefore(schedule.start), permit_code: null, max_stay_minutes: null, rule_note: note });
    const other = OTHER_DAYS[schedule.days];
    if (other) rules.push({ ...base, ...block, days_of_week: other, start_time: "00:00", end_time: "23:59", permit_code: null, max_stay_minutes: null, rule_note: note });
  }
  return rules;
}

// features: GeoJSON features from the layer (f=geojson, outSR=4326).
// Returns [{ area, rules }]. One area per lot type + description, so "29R gas station" and
// "29R auto shop" stay separate. Ordering is stable across runs (by lowest OBJECTID).
export function lotsFromFeatures(features, verifiedOn) {
  const groups = new Map();
  for (const f of features) {
    const p = f.properties || {};
    if (!p.Lot_Type || SKIP.has(p.permit_typ) || !polygonsOf(f.geometry).length) continue;
    const key = `${p.Lot_Type}|${(p.Descriptio || "").trim()}`;
    if (!groups.has(key)) groups.set(key, { props: p, ids: [], polygons: [] });
    const g = groups.get(key);
    g.ids.push(p.OBJECTID ?? f.id);
    g.polygons.push(...polygonsOf(f.geometry).map(roundCoords));
  }
  const ordered = [...groups.values()].sort((a, b) => Math.min(...a.ids) - Math.min(...b.ids));
  const seen = new Map();
  return ordered.map((g) => {
    const p = g.props;
    const n = (seen.get(p.Lot_Type) || 0) + 1;
    seen.set(p.Lot_Type, n);
    const category = p.Map_Catego ? ` · ${p.Map_Catego}` : "";
    return {
      area: {
        source_ref: `byu-arcgis:${p.Lot_Type}:${n}`,
        area_name: `BYU Lot ${p.Lot_Type}${n > 1 ? ` (${n})` : ""}${category}`.slice(0, 120),
        lot_code: String(p.Lot_Type).slice(0, 20),
        operator: "BYU",
        ...labelPoint(g.polygons),
        boundary: g.polygons.length === 1 ? { type: "Polygon", coordinates: g.polygons[0] } : { type: "MultiPolygon", coordinates: g.polygons },
        source_url: BYU_LAYER_ITEM_URL,
        last_verified_on: verifiedOn,
      },
      rules: rulesFor(p.permit_typ, p.Descriptio || "", verifiedOn),
    };
  });
}

const sql = (v) => (v == null ? "NULL" : `'${String(v).replace(/'/g, "''")}'`);

// Idempotent SQL: upserts areas by source_ref, then replaces their rules. Safe to run twice.
export function lotsToSql(lots, verifiedOn) {
  const lines = [
    `-- BYU campus parking lots imported from BYU's public ArcGIS layer on ${verifiedOn}.`,
    `-- Source: ${BYU_LAYER_ITEM_URL} (public; no license stated, credit BYU).`,
    "-- Generated by scripts/import-byu-lots.mjs. Do not edit by hand; re-run the script instead.",
    "-- Needs supabase/migrations/20261029214000_parking_area_map_fields.sql first.",
    "BEGIN;",
  ];
  for (const { area } of lots) {
    lines.push(`INSERT INTO parking_area (source_ref, area_name, lot_code, operator, latitude, longitude, total_spaces, est_available_spaces, is_free, boundary, source_url, last_verified_on)
VALUES (${sql(area.source_ref)}, ${sql(area.area_name)}, ${sql(area.lot_code)}, 'BYU', ${area.latitude}, ${area.longitude}, NULL, NULL, FALSE, ${sql(JSON.stringify(area.boundary))}::jsonb, ${sql(area.source_url)}, ${sql(area.last_verified_on)})
ON CONFLICT (source_ref) DO UPDATE SET area_name = EXCLUDED.area_name, lot_code = EXCLUDED.lot_code, latitude = EXCLUDED.latitude, longitude = EXCLUDED.longitude, boundary = EXCLUDED.boundary, source_url = EXCLUDED.source_url, last_verified_on = EXCLUDED.last_verified_on;`);
  }
  lines.push("DELETE FROM parking_rule WHERE area_id IN (SELECT area_id FROM parking_area WHERE source_ref LIKE 'byu-arcgis:%');");
  for (const { area, rules } of lots) {
    for (const r of rules) {
      // Inner join on permit: a permit code missing from the table drops the rule instead of making it open to everyone.
      const [permitCol, permitJoin] = r.permit_code
        ? ["p.permit_id", ` JOIN permit p ON p.permit_code = ${sql(r.permit_code)}`]
        : ["NULL", ""];
      lines.push(`INSERT INTO parking_rule (area_id, permit_id, days_of_week, start_time, end_time, max_stay_minutes, blocked_start, blocked_end, vehicle_type, source_url, last_verified_on, rule_note)
SELECT a.area_id, ${permitCol}, ${sql(r.days_of_week)}, ${sql(r.start_time)}, ${sql(r.end_time)}, ${r.max_stay_minutes ?? "NULL"}, ${sql(r.blocked_start)}, ${sql(r.blocked_end)}, 'car', ${sql(r.source_url)}, ${sql(r.last_verified_on)}, ${sql(r.rule_note)} FROM parking_area a${permitJoin} WHERE a.source_ref = ${sql(area.source_ref)};`);
    }
  }
  lines.push("COMMIT;", "");
  return lines.join("\n");
}
