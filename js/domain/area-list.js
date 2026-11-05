// Search, sort and paging for the Areas list. Pure functions: no DOM, no database.
import { validLocation, metersBetween } from "./nearby.js";

// "Lot 1A" before "Lot 19Y" before "Lot 20A": compare numbers inside names as numbers.
export const byName = (a, b) => String(a.area_name).localeCompare(String(b.area_name), "en", { numeric: true, sensitivity: "base" });

export function areaPoint(area) {
  const num = (v) => (typeof v === "number" || (typeof v === "string" && v.trim() !== "")) ? Number(v) : NaN;
  const point = { latitude: num(area?.latitude), longitude: num(area?.longitude) };
  return validLocation(point) ? point : null;
}

export function matchesQuery(area, query) {
  const words = String(query || "").toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const text = [area.area_name, area.lot_code, area.operator].filter(Boolean).join(" ").toLowerCase();
  return words.every((word) => text.includes(word));
}

// Walking estimate from a lot section's center to a building. Straight-line distance times 1.3 for
// paths that are not straight, at 80 m per minute (about 3 mph). An estimate, not a route.
export const WALK_DETOUR = 1.3, WALK_METERS_PER_MINUTE = 80;
export function walkMinutes(meters) {
  if (!Number.isFinite(meters)) return null;
  return Math.max(1, Math.round(meters * WALK_DETOUR / WALK_METERS_PER_MINUTE));
}

/**
 * Returns { items, total, sortedBy } where items is the filtered, sorted list (each item is the area,
 * plus distanceMeters when sorting by distance, or walkMeters + walkMinutes when sorting by walk to the
 * destination building). Distance and walk sorts need a valid point; without one they fall back to
 * name order and report sortedBy: "name".
 */
export function arrangeAreas(areas, { query = "", sort = "name", position = null, destination = null } = {}) {
  const matched = (areas || []).filter((area) => matchesQuery(area, query));
  if (sort === "walk" && validLocation(destination)) {
    const withWalk = matched.map((area) => {
      const point = areaPoint(area);
      const walkMeters = point ? metersBetween(destination, point) : Infinity;
      return { ...area, walkMeters, walkMinutes: walkMinutes(walkMeters) };
    });
    withWalk.sort((a, b) => a.walkMeters - b.walkMeters || byName(a, b));
    return { items: withWalk, total: matched.length, sortedBy: "walk" };
  }
  if (sort === "distance" && validLocation(position)) {
    const withDistance = matched.map((area) => {
      const point = areaPoint(area);
      return { area, distanceMeters: point ? metersBetween(position, point) : Infinity };
    });
    withDistance.sort((a, b) => a.distanceMeters - b.distanceMeters || byName(a.area, b.area));
    return { items: withDistance.map(({ area, distanceMeters }) => ({ ...area, distanceMeters })), total: matched.length, sortedBy: "distance" };
  }
  return { items: [...matched].sort(byName), total: matched.length, sortedBy: "name" };
}

export function formatDistance(meters) {
  if (!Number.isFinite(meters)) return "";
  const miles = meters / 1609.344;
  return miles < 0.1 ? `${Math.max(50, Math.round(meters * 3.28084 / 50) * 50)} ft` : `${miles.toFixed(1)} mi`;
}

// One card per lot: BYU lists some lots as several map sections (e.g. Lot 19Y has three).
// Keeps the first section of each lot in the order given (so the closest one when sorted by walk),
// and adds sectionCount. Areas without a lot code stay as their own entries.
export function groupByLot(items) {
  const groups = new Map(), out = [];
  for (const item of items || []) {
    const code = item.lot_code ? `${item.operator || ""}|${String(item.lot_code).toUpperCase()}` : null;
    if (code && groups.has(code)) { groups.get(code).sectionCount += 1; continue; }
    const entry = { ...item, sectionCount: 1 };
    if (code) groups.set(code, entry);
    out.push(entry);
  }
  return out;
}

// "BYU Lot 19Y (section 125)" -> "Lot 19Y" for a grouped card; other names stay as they are.
export function lotTitle(area) {
  if (area?.operator === "BYU" && area.lot_code) return `Lot ${area.lot_code}`;
  return String(area?.area_name ?? "");
}
