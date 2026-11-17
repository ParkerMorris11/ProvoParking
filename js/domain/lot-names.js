// Lot titles without GIS ids. The database names each BYU section "BYU Lot 1A (section 147)"; people only
// know "Lot 1A", so the title drops the id and lots with several sections get a quiet subtitle instead.

const SECTION = /\s*\(section \d+\)\s*$/i;

export const cleanAreaName = (name) => String(name ?? "").replace(SECTION, "");

/** "BENSON (EZRA TAFT) BUILDING" → "Benson Building"; mixed-case names are kept. */
export function buildingLabel(name) {
  const text = String(name ?? "").replace(/\s*\([^)]*\)/g, "").replace(/\s+/g, " ").trim();
  if (text !== text.toUpperCase()) return text;
  return text.toLowerCase().replace(/\b([a-z])/g, (c) => c.toUpperCase()).replace(/\bByu\b/g, "BYU");
}

const meters = (a, b) => Math.hypot((a.latitude - b.latitude) * 110540, (a.longitude - b.longitude) * 84800);

/**
 * Cleans area_name in place and, for lots split into several sections, sets section_note to
 * "Part 1 of 3 · near Tanner Building" (north to south). Returns the same array.
 */
export function labelAreas(areas = [], destinations = []) {
  const groups = new Map();
  for (const area of areas) {
    area.area_name = cleanAreaName(area.area_name);
    area.section_note = null;
    if (area.operator !== "BYU" || area.is_sample_data || !area.lot_code) continue;
    if (!groups.has(area.lot_code)) groups.set(area.lot_code, []);
    groups.get(area.lot_code).push(area);
  }
  const places = destinations.filter((d) => Number.isFinite(Number(d.latitude)) && Number.isFinite(Number(d.longitude)))
    .map((d) => ({ name: buildingLabel(d.name), latitude: Number(d.latitude), longitude: Number(d.longitude) }));
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    group.sort((a, b) => Number(b.latitude) - Number(a.latitude) || a.area_id - b.area_id);
    group.forEach((area, i) => {
      const at = { latitude: Number(area.latitude), longitude: Number(area.longitude) };
      const near = places.reduce((best, p) => (!best || meters(at, p) < meters(at, best) ? p : best), null);
      area.section_note = `Part ${i + 1} of ${group.length}${near ? ` · near ${near.name}` : ""}`;
    });
  }
  return areas;
}
