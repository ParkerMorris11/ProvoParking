// "Best pick": a one-line reason for the first lot in an already-ranked, already-eligible list.
// It never decides eligibility (domain/eligibility.js and domain/area-list.js do); it only explains
// why the top row is on top, e.g. "Closest Y section to the JKB · ~0.3 mi".
import { formatDistance } from "./area-list.js";

/**
 * @param {object|undefined} area  first item from arrangeAreas (with distanceMeters when sorted by distance)
 * @param {{ sortedBy: string, permitCode?: string, place?: { name?: string, building_code?: string }, kind?: string }} context
 * @returns {string|null} null when the list is not ranked by distance (lot-number order has no "best").
 */
export function bestPickReason(area, { sortedBy, permitCode = "", place = null, kind = "ok" } = {}) {
  if (!area || !Number.isFinite(area.distanceMeters)) return null;
  if (sortedBy !== "destination" && sortedBy !== "distance") return null;
  // BYU lots are split into sections (e.g. "Part 1 of 4"); say "section" when this row is one part of a lot.
  const noun = area.section_note ? "section" : "lot";
  const code = String(permitCode || "").trim();
  const target = sortedBy === "distance" ? "you"
    : place?.building_code ? `the ${place.building_code}` : place?.name ? place.name : "your building";
  const parts = [`Closest ${code ? `${code} ` : ""}${noun} to ${target}`, `~${formatDistance(area.distanceMeters)}`];
  if (kind === "limit") parts.push("time limit");
  return parts.join(" · ");
}
