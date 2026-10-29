// Downloads BYU's public "Campus Parking Lots" layer and writes SQL that loads it into Supabase.
//   node scripts/import-byu-lots.mjs > supabase/byu-lots-import.sql
//   node scripts/import-byu-lots.mjs --file saved-layer.geojson > supabase/byu-lots-import.sql
// Then run the SQL in the Supabase SQL Editor (after the parking_area_map_fields migration).
import { readFile } from "node:fs/promises";
import { BYU_LAYER_QUERY_URL, lotsFromFeatures, lotsToSql } from "../js/domain/byu-lots.js";

const fileArg = process.argv.indexOf("--file");
let geojson;
if (fileArg > -1) {
  geojson = JSON.parse(await readFile(process.argv[fileArg + 1], "utf8"));
} else {
  const url = `${BYU_LAYER_QUERY_URL}?where=1%3D1&outFields=*&outSR=4326&f=geojson`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`BYU layer request failed: ${res.status} ${res.statusText}`);
  geojson = await res.json();
}
if (geojson.error) throw new Error(`BYU layer error: ${JSON.stringify(geojson.error)}`);
if (geojson.properties?.exceededTransferLimit) throw new Error("BYU layer returned a partial page; add paging (resultOffset) to this script.");

const today = new Date().toISOString().slice(0, 10);
const lots = lotsFromFeatures(geojson.features || [], today);
const ruleCount = lots.reduce((n, l) => n + l.rules.length, 0);
const noRules = lots.filter((l) => !l.rules.length).map((l) => l.area.lot_code);
console.error(`${geojson.features?.length ?? 0} features -> ${lots.length} areas, ${ruleCount} rules.`);
if (noRules.length) console.error(`No rules (restricted or unreadable hours): ${noRules.join(", ")}`);
process.stdout.write(lotsToSql(lots, today));
