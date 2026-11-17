// Starting data copied from the Provo Parking project's verified BYU lot files (is403/data).
// Permit wording comes from BYU's Parking Rules and Regulations (July 23, 2026).
const sections = require("../../data/verified-byu-sections.json");
const visitor = require("../../data/verified-byu-visitor-lots.json");

const PERMITS = [
  { permit_code: "A", permit_name: "Faculty and staff", description: "Valid in A, C, G, Y and U parking areas.", price: "No cost" },
  { permit_code: "B", permit_name: "Heritage Halls residents", description: "Valid in B and U parking areas.", price: "$25 per month" },
  { permit_code: "C", permit_name: "Helaman Halls residents", description: "Valid in C and U parking areas.", price: "$25 per month" },
  { permit_code: "D", permit_name: "Riviera residents", description: "Valid in D and U parking areas.", price: "$25 per month" },
  { permit_code: "G", permit_name: "Graduate students", description: "Valid in G, Y and U parking areas.", price: "$60 per semester" },
  { permit_code: "U", permit_name: "Free affiliated parking", description: "Valid in U lots.", price: "No fee" },
  { permit_code: "V", permit_name: "Visitors", description: "Visitor lots 2V and 26V, for the posted time limit.", price: "Free" },
  { permit_code: "Y", permit_name: "Undergraduate students", description: "Valid in Y and U lots.", price: "$60 per semester" },
  { permit_code: "YM", permit_name: "Wymount Terrace residents", description: "Valid in YM, Y and U lots.", price: "In housing contract" },
  { permit_code: "YV", permit_name: "Wyview Park residents", description: "Valid in YV, Y and U lots.", price: "In housing contract" },
];

// One row per lot: the map data has several sections per lot, so average their centers.
function lotRows(permitIds) {
  const byCode = new Map();
  for (const s of [...sections, ...(visitor.sections || [])]) {
    const code = s.lot_code;
    const entry = byCode.get(code) || { code, permit: s.permit_type || code.replace(/^\d+/, ""), lat: 0, lng: 0, n: 0, note: s.source_description };
    entry.lat += Number(s.latitude); entry.lng += Number(s.longitude); entry.n += 1;
    byCode.set(code, entry);
  }
  return [...byCode.values()]
    .sort((a, b) => parseInt(a.code, 10) - parseInt(b.code, 10) || a.code.localeCompare(b.code))
    .map((e) => ({
      lot_code: e.code,
      lot_name: `BYU Lot ${e.code}`,
      permit_id: permitIds[e.permit] ?? null,
      latitude: +(e.lat / e.n).toFixed(6),
      longitude: +(e.lng / e.n).toFixed(6),
      total_spaces: null, // BYU does not publish capacity, so it stays blank rather than made up.
      is_free: true, // BYU charges for the permit, not per visit.
      notes: e.note || null,
    }));
}

exports.seed = async function (knex) {
  // Clear in child-to-parent order so foreign keys are never broken.
  await knex("lots").del();
  await knex("permits").del();
  const inserted = await knex("permits").insert(PERMITS).returning(["permit_id", "permit_code"]);
  const permitIds = Object.fromEntries(inserted.map((p) => [p.permit_code, p.permit_id]));
  await knex("lots").insert(lotRows(permitIds));
};
