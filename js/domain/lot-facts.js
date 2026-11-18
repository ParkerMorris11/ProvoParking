// Pure helpers for the lot page: where "Back" goes, and the short facts shown at the top. No DOM.
import { dailyRuleSchedule, scheduleTime } from "./rule-schedule.js";
import { permitCategory } from "./map-geometry.js";
import { areaPoint, formatDistance } from "./area-list.js";
import { metersBetween, validLocation } from "./nearby.js";

const BACK = {
  favorites: { href: "#favorites", label: "Back to favorites" },
  lots: { href: "#lots", label: "Back to all lots" },
  find: { href: "#find", label: "Back to Find" },
  help: { href: "#help", label: "Back to help" },
};

/**
 * Where the lot page's back link goes. `origin` is the screen the person opened the lot from:
 * { view: "favorites" | "lots" | "areas" | ..., results: true when the Areas screen was showing search results }.
 * Opening a lot from the map, Suggestions or nearby lots (the Areas home) goes back to the map.
 */
export function backTarget(origin) {
  if (origin && BACK[origin.view]) return BACK[origin.view];
  if (origin?.view === "areas" && origin.results) return { href: "#areas", label: "Back to results" };
  return { href: "#areas", label: "Back to map" };
}

/** The screen to remember when moving from `from` to `to`. Lot-to-lot and timer-sheet hops keep the first origin. */
export function nextOrigin(previous, { from, to, results = false }) {
  if (to !== "area") return previous;
  if (!from || from === "area" || from === "car") return previous;
  return { view: from, results: from === "areas" && Boolean(results) };
}

// When a lot's code has no letter (sample or city areas), the lowest permit that works here is the one you need.
const LEAST_PRIVILEGED = ["U", "V", "Y", "G", "A"];

/**
 * The one permit a lot is designated for. BYU lot codes end in it ("59Y" -> Y, "30G" -> G);
 * otherwise the lowest permit the rules accept. Higher permits (an A in a Y lot) still work but aren't listed.
 */
export function requiredPermit(area, accepted, permits = []) {
  const letter = /^\d*([A-Z]+)$/.exec(String(area?.lot_code || "").toUpperCase())?.[1];
  if (letter) {
    const match = accepted.find(p => p.code === letter) || toFact(permits.find(p => p.permit_code === letter));
    if (match) return match;
  }
  const rank = (code) => { const i = LEAST_PRIVILEGED.indexOf(code); return i < 0 ? LEAST_PRIVILEGED.length : i; };
  return [...accepted].sort((a, b) => rank(a.code) - rank(b.code) || a.code.localeCompare(b.code))[0] || null;
}

function toFact(p) {
  return p ? { code: p.permit_code, name: p.permit_name, color: permitCategory(p.permit_code).color } : null;
}

const join = (ranges) => ranges.map(s => `${scheduleTime(s.start)}–${scheduleTime(s.end)}`).join(", ");

/** "Part 3 of 4 · near Indoor Practice Facility" -> { index: 3, total: 4, near: "Indoor Practice Facility" }. */
export function parseSection(note) {
  const m = /^Part (\d+) of (\d+)(?: · near (.+))?$/.exec(note || "");
  return m ? { index: Number(m[1]), total: Number(m[2]), near: m[3] || null } : null;
}

/**
 * Key facts for the top of a lot page, read from the same rules as the 24-hour schedule:
 * which permits the rules accept (and the one the lot is designated for), permit hours and no-parking hours for the chosen day, the distance
 * from the chosen building (or the person's location), and which section of the lot this is.
 */
export function lotFacts({ area, rules = [], permits = [], day, position = null, destination = null }) {
  const ids = [...new Set(rules.filter(r => r.permit_id != null).map(r => r.permit_id))];
  const accepted = ids
    .map(id => permits.find(p => p.permit_id === id))
    .map(toFact)
    .filter(Boolean)
    .sort((a, b) => a.code.localeCompare(b.code));
  const segments = dailyRuleSchedule(rules, day);
  const permitHours = segments.filter(s => s.kind === "permit");
  const closedHours = segments.filter(s => s.kind === "closed");
  const point = areaPoint(area);
  let distance = null;
  if (point && validLocation(destination?.point)) distance = { text: formatDistance(metersBetween(destination.point, point)), from: destination.name ? `from ${destination.name}` : "from your building" };
  else if (point && validLocation(position)) distance = { text: formatDistance(metersBetween(position, point)), from: "from you" };
  return {
    permits: accepted,
    permit: requiredPermit(area, accepted, permits),
    permitHours: permitHours.length ? join(permitHours) : null,
    closedHours: closedHours.length ? join(closedHours) : null,
    distance,
    section: parseSection(area.section_note),
    free: Boolean(area.is_free),
  };
}
