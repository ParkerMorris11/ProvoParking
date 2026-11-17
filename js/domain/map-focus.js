// Pure helpers for pointing the map at lots without the sheet, the permit chip or the map buttons
// covering them. Used by pages/map.js (and the 3D adapter); unit tested in tests/map-focus.test.js.

/** Pixels of map hidden on each side. Phones: chip on top, rail on the right, the bottom sheet below. */
export function mapPadding({ phone = false, sheetState = "half", width = 390, height = 844, sidebarRight = 0 } = {}) {
  if (phone) {
    // The sheet's "half" position leaves the top 45% of the screen as map; "peek" leaves all but ~150 px.
    const bottom = sheetState === "peek" ? 150 : Math.round(height * 0.55) + 16;
    return { top: 96, right: 64, bottom: Math.min(bottom, Math.max(0, height - 200)), left: 16 };
  }
  return { top: 84, right: 72, bottom: 32, left: Math.min(Math.max(24, sidebarRight + 24), Math.max(24, width - 240)) };
}

/** One box around many { south, west, north, east } boxes, or null for none. */
export function unionBounds(list) {
  const boxes = (list || []).filter(b => b && [b.south, b.west, b.north, b.east].every(Number.isFinite));
  if (!boxes.length) return null;
  return {
    south: Math.min(...boxes.map(b => b.south)), west: Math.min(...boxes.map(b => b.west)),
    north: Math.max(...boxes.map(b => b.north)), east: Math.max(...boxes.map(b => b.east)),
  };
}

/**
 * Identifies "which lots should be highlighted": permit plus planned day/time. While parking right now the
 * clock is left out, so the minute tick doesn't re-frame the map every minute.
 */
export function selectionKey(selection = {}) {
  const permit = selection.permitId ?? "none";
  return selection.live ? `${permit}|now` : `${permit}|${selection.day}|${selection.time}`;
}

/**
 * 3D has no fitBounds padding, so move the camera instead: the lots land in the middle of the visible
 * part of the map, and the range grows so they still fit. Returns { center, range }.
 */
export function paddedCamera(bounds, padding = {}, { width = 390, height = 844, minRange = 350, maxRange = 4000 } = {}) {
  const pad = { top: 0, right: 0, bottom: 0, left: 0, ...(typeof padding === "object" ? padding : {}) };
  const visH = Math.max(120, height - pad.top - pad.bottom), visW = Math.max(120, width - pad.left - pad.right);
  const latSpan = Math.max(bounds.north - bounds.south, 0.0004), lngSpan = Math.max(bounds.east - bounds.west, 0.0004);
  const degPerPxLat = latSpan / visH, degPerPxLng = lngSpan / visW;
  const center = {
    lat: (bounds.south + bounds.north) / 2 - ((pad.bottom - pad.top) / 2) * degPerPxLat,
    lng: (bounds.west + bounds.east) / 2 + ((pad.right - pad.left) / 2) * degPerPxLng,
  };
  const span = Math.max(latSpan, lngSpan * Math.cos(bounds.south * Math.PI / 180));
  const scale = Math.max(height / visH, width / visW);
  return { center, range: Math.min(maxRange, Math.max(minRange, span * 111000 * 1.3 * scale)) };
}

/**
 * Should a permit/time change re-frame the map on its matching sections? Pure, so it is unit tested.
 * - Every view counts (map home, Find, results, Favorites, Help): the map behind the sheet follows the chip.
 * - A lot's page keeps its own camera and does not use up the change, so going back home frames it then.
 * - No matches: the camera stays put (the sheet shows the empty state), but the change is used up.
 * - No permit chosen: no framing.
 * - A search that picks a new building at the same moment lets the building camera win.
 * Returns { fit, key, dest }: whether to frame, and the key/destination to remember.
 */
export function fitDecision({ key, lastKey = null, dest = null, lastDest = null, view = "areas", count = 0, hasPermit = true }) {
  if (view === "area" || view === "lots") return { fit: false, key: lastKey, dest: lastDest };
  if (key === lastKey) return { fit: false, key, dest };
  const newBuilding = dest != null && dest !== lastDest;
  // No permit yet: the opening campus camera stays (the "open to everyone" set is not a choice the user made).
  return { fit: hasPermit && count > 0 && !newBuilding, key, dest };
}
