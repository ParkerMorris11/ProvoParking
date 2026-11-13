// Google Maps Photorealistic 3D view (<gmp-map-3d>), same adapter shape as map-2d.js.
// Lots are extruded polygons; tapping one fires `gmp-click`. Needs v=beta with the maps3d library.
import { CAMPUS_CENTER, withAlpha } from "../domain/map-geometry.js";

const ALTITUDE = 1415;
const DEFAULT_CAMERA = { tilt: 65, heading: 335, range: 1200 };
// Zoom level 17 in 2D is about 850 m of camera range; each level doubles or halves it.
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
  let drawn = [], userMarker = null;

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
    setUser(point) {
      userMarker?.remove();
      userMarker = null;
      if (!point) return;
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
    destroy() { clear(); userMarker?.remove(); map.remove(); },
  };
}
