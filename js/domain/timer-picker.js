// Pure helpers for the My Car timer sheet: which lots to suggest, and the hour/minute duration.
import { searchMapCatalog } from "./map-search.js";
import { metersBetween, validLocation } from "./nearby.js";

export const MAX_HOURS = 12;
export const MINUTE_STEP = 5;
export const HOUR_OPTIONS = Array.from({ length: MAX_HOURS + 1 }, (_, i) => i);
export const MINUTE_OPTIONS = Array.from({ length: 60 / MINUTE_STEP }, (_, i) => i * MINUTE_STEP);
export const DEFAULT_DURATION = { hours: 2, minutes: 0 };

/** Total minutes for a wheel choice; 0 means nothing chosen yet. */
export function totalMinutes(hours, minutes) {
  const h = Math.min(MAX_HOURS, Math.max(0, Math.trunc(Number(hours) || 0)));
  const m = Math.min(55, Math.max(0, Math.trunc(Number(minutes) || 0)));
  return h * 60 + m;
}

/** A reminder must fire before the timer ends; otherwise turn it off. */
export function fitReminder(reminderMinutes, durationMinutes) {
  const r = Number(reminderMinutes) || 0;
  return r > 0 && r < durationMinutes ? r : 0;
}

const fmtDistance = meters => {
  const miles = meters / 1609.344;
  return miles < 0.1 ? `${Math.max(50, Math.round(meters * 3.28084 / 50) * 50)} ft away` : `${miles.toFixed(1)} mi away`;
};

/**
 * Lots to show under "Where did you park?".
 * With no query: the lot from last time, saved favorites, then the closest lots (when location is known).
 * With a query: the app's normal lot search, plus favorites whose nickname matches.
 * Returns up to `limit` rows of { id, title, sub, kind } where kind is last | favorite | near | match.
 */
export function lotSuggestions({ query = "", areas = [], favoriteIds = new Set(), favoriteNames = new Map(), position = null, lastAreaId = null, limit = 5 } = {}) {
  const real = areas.filter(a => !a.is_sample_data);
  const byId = new Map(real.map(a => [Number(a.area_id), a]));
  const rows = [], seen = new Set();
  const nickname = id => favoriteNames.get(id) ?? favoriteNames.get(String(id));
  const add = (area, kind, sub) => {
    const id = Number(area?.area_id);
    if (!area || seen.has(id) || rows.length >= limit) return;
    seen.add(id);
    rows.push({ id, title: String(area.area_name || ""), sub, kind });
  };
  const favoriteSub = id => (nickname(id) ? `Saved as “${nickname(id)}”` : "Saved");
  const term = String(query).trim().toLowerCase();

  if (term) {
    for (const id of favoriteIds) {
      const name = String(nickname(id) || "").toLowerCase();
      if (name && name.includes(term)) add(byId.get(Number(id)), "favorite", favoriteSub(id));
    }
    for (const hit of searchMapCatalog(query, { areas: real })) {
      if (hit.type !== "lot") continue;
      const fav = favoriteIds.has(hit.id) || favoriteIds.has(String(hit.id));
      add(byId.get(Number(hit.id)), fav ? "favorite" : "match", fav ? favoriteSub(hit.id) : "Parking area");
    }
    return rows;
  }

  limit = Math.min(limit, 3); // before typing, keep the list short so Start stays on screen
  if (lastAreaId != null) add(byId.get(Number(lastAreaId)), "last", "Parked here last time");
  let favorites = 0; // leave room for nearby lots
  for (const id of favoriteIds) {
    if (favorites >= 3) break;
    const before = rows.length;
    add(byId.get(Number(id)), "favorite", favoriteSub(id));
    favorites += rows.length - before;
  }
  if (validLocation(position)) {
    const near = real.filter(a => validLocation(a))
      .map(a => ({ a, d: metersBetween(position, a) }))
      .filter(x => x.d <= 5000)
      .sort((x, y) => x.d - y.d);
    for (const { a, d } of near) add(a, "near", fmtDistance(d));
  }
  return rows;
}
