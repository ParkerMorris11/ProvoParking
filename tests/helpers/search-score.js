// Compares a parsed Find answer with the expected trip in tests/fixtures/search-queries.js.
import { LIVE_PERMITS, LIVE_DESTINATIONS } from "../fixtures/live-search-lists.js";

export function describeParsed(parsed, { permits = LIVE_PERMITS, destinations = LIVE_DESTINATIONS } = {}) {
  const permit = parsed.permit_id != null ? permits.find((p) => p.permit_id === parsed.permit_id)?.permit_code ?? `#${parsed.permit_id}`
    : parsed.use_saved_permit ? "saved" : null;
  const building = parsed.destination_id != null ? destinations.find((d) => d.destination_id === parsed.destination_id)?.building_code ?? `#${parsed.destination_id}` : null;
  return { permit, building, day: parsed.live ? null : parsed.day ?? null, time: parsed.live ? null : parsed.time ?? null };
}

// "Use my saved permit" and "no permit named" end the same way in the Find form: the person's own permit stays.
const samePermit = (a, b) => a === b || ((a == null || a === "saved") && (b == null || b === "saved"));

/** Field-by-field differences (empty when the answer is exactly right). */
export function scoreParsed(parsed, expected, lists) {
  const got = describeParsed(parsed, lists);
  return ["permit", "building", "day", "time"]
    .filter((k) => (k === "permit" ? !samePermit(got[k], expected[k]) : got[k] !== expected[k]))
    .map((k) => `${k}: expected ${expected[k]}, got ${got[k]}`);
}
