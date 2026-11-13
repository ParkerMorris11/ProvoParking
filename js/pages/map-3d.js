// Google Maps Photorealistic 3D view (<gmp-map-3d>), same adapter shape as map-2d.js.
// Lots are extruded polygons; tapping one fires `gmp-click`. Needs v=beta with the maps3d library.
import { CAMPUS_CENTER, withAlpha } from "../domain/map-geometry.js";

const ALTITUDE = 1415;
const DEFAULT_CAMERA = { tilt: 65, heading: 335, range: 1200 };
// Zoom level 17 in 2D is about 850 m of camera range; each level doubles or halves it.
const USER_COLOR = "#0062B8";
// A circle of `radius` meters around `point`, as a ring of lat/lng vertices for a ground-clamped polygon.
function circleRing(point, radius, steps = 48) {
  const dLat = radius / 111320, dLng = radius / (111320 * Math.cos(point.lat * Math.PI / 180));
  return Array.from({ length: steps }, (_, i) => {
    const angle = 2 * Math.PI * i / steps;
    return { lat: point.lat + dLat * Math.sin(angle), lng: point.lng + dLng * Math.cos(angle), altitude: 1 };
  });
}
const rangeForZoom = level => Math.min(4000, Math.max(300, 850 * 2 ** (17 - level)));

/** `lib` is the result of google.maps.importLibrary("maps3d"). */
export function createMap3D({ lib, container, center = CAMPUS_CENTER, onSelect, onError = () => {} }) {
  const map = new lib.Map3DElement({
    center: { ...center, altitude: ALTITUDE }, ...DEFAULT_CAMERA,
    mode: lib.MapMode?.HYBRID ?? "HYBRID",
  });
  map.setAttribute?.("aria-label", "3D map of BYU and Provo parking");
  map.addEventListener("gmp-error", onError);
  container.append(map);

  const Polygon = lib.Polygon3DInteractiveElement ?? lib.Polygon3DElement;
  const Marker = lib.Marker3DInteractiveElement ?? lib.Marker3DElement;
  let drawn = [], userMarker = null, userShapes = [];

  const clear = () => { for (const el of drawn) el.remove(); drawn = []; };
  const fly = (camera, durationMillis = 1000) => {
    const endCamera = { tilt: DEFAULT_CAMERA.tilt, heading: DEFAULT_CAMERA.heading, ...camera, center: { ...camera.center, altitude: ALTITUDE } };
    if (typeof map.flyCameraTo === "function") map.flyCameraTo({ endCamera, durationMillis });
    else Object.assign(map, endCamera);
  };

  return {
    mode: "3d",
    setShapes(shapes) {
      clear();
      for (const shape of shapes) {
        const el = shape.kind === "polygon"
          ? new Polygon({
            outerCoordinates: shape.rings[0].map(p => ({ ...p, altitude: shape.source.type === "city" ? 20 : 10 })),
            altitudeMode: "RELATIVE_TO_GROUND", extruded: true, drawsOccludedSegments: true,
            fillColor: withAlpha(shape.color, 0.45), strokeColor: shape.color, strokeWidth: 2,
          })
          : new Marker({ position: shape.center, altitudeMode: "CLAMP_TO_GROUND", label: "P", title: "Provo parking" });
        el.addEventListener("gmp-click", () => onSelect(shape));
        map.append(el);
        drawn.push(el);
      }
    },
    setUser(point, accuracy) {
      userMarker?.remove();
      for (const el of userShapes) el.remove();
      userMarker = null;
      userShapes = [];
      if (!point) return;
      // Accuracy ring (translucent) plus a solid blue dot with a white edge, like the 2D view.
      const ground = { altitudeMode: "CLAMP_TO_GROUND", extruded: false, drawsOccludedSegments: true };
      const ring = Number.isFinite(accuracy) && accuracy > 0 ? Math.min(accuracy, 1500) : 0;
      const parts = [
        ring && { outerCoordinates: circleRing(point, ring), fillColor: withAlpha(USER_COLOR, 0.14), strokeColor: withAlpha(USER_COLOR, 0.6), strokeWidth: 2 },
        { outerCoordinates: circleRing(point, 9, 24), fillColor: USER_COLOR, strokeColor: "#ffffff", strokeWidth: 4 },
      ].filter(Boolean);
      try {
        for (const options of parts) {
          const el = new lib.Polygon3DElement({ ...ground, ...options });
          map.append(el);
          userShapes.push(el);
        }
      } catch { /* the "You" marker below still shows where the person is */ }
      userMarker = new lib.Marker3DElement({ position: point, altitudeMode: "CLAMP_TO_GROUND", drawsWhenOccluded: true, label: "You" });
      map.append(userMarker);
    },
    focus(point, level = 17) { fly({ center: point, range: rangeForZoom(level) }); },
    fitBounds(bounds) {
      const span = Math.max(bounds.north - bounds.south, (bounds.east - bounds.west) * Math.cos(bounds.south * Math.PI / 180));
      fly({ center: { lat: (bounds.south + bounds.north) / 2, lng: (bounds.west + bounds.east) / 2 }, range: Math.min(4000, Math.max(500, span * 111000 * 2)) });
    },
    getView() { return { lat: map.center?.lat ?? center.lat, lng: map.center?.lng ?? center.lng }; },
    setDark() {}, // the photorealistic view has its own lighting
    resize() {},
    show() { container.hidden = false; },
    hide() { container.hidden = true; },
    destroy() { clear(); userMarker?.remove(); for (const el of userShapes) el.remove(); map.remove(); },
  };
}
