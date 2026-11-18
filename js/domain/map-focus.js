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

/** Vertical field of view of <gmp-map-3d>, in degrees (Map3DElement's documented default). */
export const MAP_3D_FOV = 35;
export const METERS_PER_DEG_LAT = 111000;

/**
 * 3D has no fitBounds padding, so the look-at point and range have to put the lot in the uncovered
 * part of the map themselves. A previous version scaled the offset by the lot's own lat/lng span, so
 * a single section only nudged the camera by a few dozen meters — the look-at stayed on the lot, at
 * the centre of the full screen, hidden under the half-height phone sheet. The visible map then
 * showed the ground in the heading direction ("above" the lot). This version uses the camera's tilt
 * and field of view so the lot is centred in the remaining map, fully in frame.
 * Returns { center, range, tilt, heading }.
 */
export function paddedCamera(bounds, padding = {}, {
  width = 390, height = 844, minRange = 350, maxRange = 4000,
  tilt = 45, heading = 0, fov = MAP_3D_FOV,
} = {}) {
  const pad = { top: 0, right: 0, bottom: 0, left: 0, ...(typeof padding === "object" && padding ? padding : {}) };
  const visH = Math.max(120, height - pad.top - pad.bottom);
  const visW = Math.max(120, width - pad.left - pad.right);
  const midLat = (bounds.south + bounds.north) / 2;
  const midLng = (bounds.west + bounds.east) / 2;
  const latSpan = Math.max(bounds.north - bounds.south, 0.0004);
  const lngSpan = Math.max(bounds.east - bounds.west, 0.0004);
  const metersNS = latSpan * METERS_PER_DEG_LAT;
  const metersEW = lngSpan * METERS_PER_DEG_LAT * Math.cos(midLat * Math.PI / 180);
  const lotSize = Math.max(metersNS, metersEW);

  const tiltRad = clamp(tilt, 0, 75) * Math.PI / 180;
  const fovRad = clamp(fov, 5, 80) * Math.PI / 180;
  const visibleFov = fovRad * (visH / height);
  // Size the camera so the lot fits in the visible window. 1/cos(tilt) leaves room for foreshortening.
  const tiltFactor = 1 / Math.max(0.35, Math.cos(tiltRad));
  const range = Math.min(maxRange, Math.max(minRange,
    (1.3 * lotSize) / (2 * Math.tan(Math.max(visibleFov, 0.05) / 2)) * Math.min(tiltFactor, 2)));

  // The look-at is the visual centre of the full viewport. Shift it so the lot sits at the centre
  // of the uncovered rectangle (above the sheet on phones, to the right of the sidebar on laptops).
  const phiY = ((height / 2 - (pad.top + visH / 2)) / height) * fovRad;
  const fovX = 2 * Math.atan(Math.tan(fovRad / 2) * (width / Math.max(height, 1)));
  const phiX = (((pad.left + visW / 2) - width / 2) / width) * fovX;
  const heightM = range * Math.cos(tiltRad);
  const maxPhi = Math.PI * 80 / 180 - tiltRad - 0.05;
  const along = heightM * (Math.tan(tiltRad + clamp(phiY, -maxPhi, maxPhi)) - Math.tan(tiltRad));
  const across = range * Math.tan(phiX);
  const headingRad = (Number.isFinite(heading) ? heading : 0) * Math.PI / 180;
  const north = Math.cos(headingRad), east = Math.sin(headingRad);
  const rightN = -Math.sin(headingRad), rightE = Math.cos(headingRad);
  const dNorth = -along * north - across * rightN;
  const dEast = -along * east - across * rightE;
  const metersPerDegLng = METERS_PER_DEG_LAT * Math.cos(midLat * Math.PI / 180);
  return {
    center: { lat: midLat + dNorth / METERS_PER_DEG_LAT, lng: midLng + dEast / metersPerDegLng },
    range, tilt, heading: Number.isFinite(heading) ? heading : 0,
  };
}

/** Clamp `value` into [lo, hi]. */
function clamp(value, lo, hi) {
  return Math.min(hi, Math.max(lo, value));
}

/**
 * Approximate screen position (px from the top-left of the map) of a ground point for a tilted
 * 3D camera. Used to unit-test that a framed lot lands in the uncovered part of the viewport.
 */
export function projectGroundToScreen(point, camera, { width = 390, height = 844, fov = MAP_3D_FOV } = {}) {
  const tilt = (Number.isFinite(camera.tilt) ? camera.tilt : 45) * Math.PI / 180;
  const heading = (Number.isFinite(camera.heading) ? camera.heading : 0) * Math.PI / 180;
  const fovY = (Number.isFinite(fov) ? fov : MAP_3D_FOV) * Math.PI / 180;
  const fovX = 2 * Math.atan(Math.tan(fovY / 2) * (width / Math.max(height, 1)));
  const midLat = camera.center.lat;
  const metersPerDegLng = METERS_PER_DEG_LAT * Math.cos(midLat * Math.PI / 180);
  const dNorth = (point.lat - midLat) * METERS_PER_DEG_LAT;
  const dEast = (point.lng - camera.center.lng) * metersPerDegLng;
  const along = dNorth * Math.cos(heading) + dEast * Math.sin(heading);
  const across = dNorth * -Math.sin(heading) + dEast * Math.cos(heading);
  const heightM = camera.range * Math.cos(tilt);
  const look = camera.range * Math.sin(tilt);
  const phiY = Math.atan((look + along) / heightM) - tilt;
  const phiX = Math.atan(across / Math.max(camera.range, 1));
  return {
    x: width / 2 + (phiX / fovX) * width,
    y: height / 2 - (phiY / fovY) * height,
  };
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
