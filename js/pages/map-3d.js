// Google Maps Photorealistic 3D view (<gmp-map-3d>), same adapter shape as map-2d.js.
// Lots are extruded polygons; tapping one fires `gmp-click`. Needs v=beta with the maps3d library.
import { CAMPUS_CENTER, withAlpha } from "../domain/map-geometry.js";

const ALTITUDE = 1415;
const DEFAULT_CAMERA = { tilt: 65, heading: 335, range: 1200 };
// Zoom level 17 in 2D is about 850 m of camera range; each level doubles or halves it.
const USER_COLOR = "#007AFF";
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
export function createMap3D({ lib, container, center = CAMPUS_CENTER, dark = false, onSelect, onError = () => {} }) {
  let darkOn = dark, mapStyle = "hybrid";
  const scheme = () => lib.ColorScheme?.[darkOn ? "DARK" : "LIGHT"] ?? (darkOn ? "DARK" : "LIGHT");
  const map = new lib.Map3DElement({
    center: { ...center, altitude: ALTITUDE }, ...DEFAULT_CAMERA,
    mode: lib.MapMode?.HYBRID ?? "HYBRID", colorScheme: scheme(),
  });
  map.setAttribute?.("aria-label", "3D map of BYU and Provo parking");
  map.addEventListener("gmp-error", onError);
  container.append(map);

  const Polygon = lib.Polygon3DInteractiveElement ?? lib.Polygon3DElement;
  const Marker = lib.Marker3DInteractiveElement ?? lib.Marker3DElement;
  let drawn = [], userShapes = {}, userPoint = null, userAccuracy = 0, userHeading = null;
  const win = container.ownerDocument?.defaultView;
  let pulseFrame = null, lastPulse = 0, visible = true;
  const night = () => darkOn && mapStyle === "hybrid";
  const clearUser = () => {
    if (pulseFrame !== null) win?.cancelAnimationFrame(pulseFrame);
    pulseFrame = null;
    for (const el of Object.values(userShapes)) el.remove();
    userShapes = {}; userPoint = null;
  };
  const userPart = (name, options) => {
    if (!options) { userShapes[name]?.remove(); delete userShapes[name]; return; }
    if (userShapes[name]) Object.assign(userShapes[name], options);
    else {
      const el = new lib.Polygon3DElement({ altitudeMode: "CLAMP_TO_GROUND", extruded: false, drawsOccludedSegments: true, zIndex: 1000 + ["accuracy", "halo", "heading", "shadow", "dot"].indexOf(name), ...options });
      el.style && (el.style.pointerEvents = "none");
      map.append(el); userShapes[name] = el;
    }
  };
  const drawUser = (pulse = 0) => {
    if (!userPoint) return;
    // Scale the ground footprint with camera range so the dot remains small while zooming.
    const radius = Math.max(1, (map.range ?? DEFAULT_CAMERA.range) / 150);
    const blue = night() ? "#0094FF" : USER_COLOR;
    userPart("accuracy", userAccuracy > 0 ? { outerCoordinates: circleRing(userPoint, userAccuracy), fillColor: withAlpha(blue, 0.14), strokeColor: withAlpha(blue, 0.35), strokeWidth: 1 } : null);
    userPart("halo", { outerCoordinates: circleRing(userPoint, radius * (1.8 + pulse * 0.6)), fillColor: withAlpha(blue, 0.2 - pulse * 0.1), strokeColor: withAlpha(blue, 0), strokeWidth: 0 });
    const fan = Number.isFinite(userHeading) ? [userPoint, ...Array.from({ length: 14 }, (_, i) => {
      const angle = (userHeading - 32 + i * 64 / 13) * Math.PI / 180;
      return { lat: userPoint.lat + radius * 5 * Math.cos(angle) / 111320, lng: userPoint.lng + radius * 5 * Math.sin(angle) / (111320 * Math.cos(userPoint.lat * Math.PI / 180)) };
    })] : null;
    userPart("heading", fan ? { outerCoordinates: fan, fillColor: withAlpha(blue, night() ? 0.36 : 0.25), strokeColor: withAlpha(blue, 0), strokeWidth: 0 } : null);
    userPart("shadow", { outerCoordinates: circleRing(userPoint, radius * 1.12, 24), fillColor: "#ffffff", strokeColor: "#10244080", strokeWidth: 5 });
    userPart("dot", { outerCoordinates: circleRing(userPoint, radius, 24), fillColor: blue, strokeColor: "#ffffff", strokeWidth: night() ? 4 : 3 });
  };
  const pulse = time => {
    pulseFrame = null;
    if (!userPoint || !visible || win.matchMedia?.("(prefers-reduced-motion: reduce)").matches) { drawUser(); return; }
    if (time - lastPulse > 80) { drawUser((1 - Math.cos(time * Math.PI / 1200)) / 2); lastPulse = time; }
    pulseFrame = win.requestAnimationFrame(pulse);
  };
  const startPulse = () => {
    if (win?.requestAnimationFrame && pulseFrame === null && userPoint && visible && !win.matchMedia?.("(prefers-reduced-motion: reduce)").matches) pulseFrame = win.requestAnimationFrame(pulse);
  };
  const applyStyle = () => {
    map.mode = mapStyle === "roadmap" ? lib.MapMode?.ROADMAP ?? "ROADMAP" : lib.MapMode?.HYBRID ?? "HYBRID";
    map.colorScheme = scheme();
    map.setAttribute?.("color-scheme", scheme());
    container.classList?.toggle("map-layer-3d--night", night());
    // The tile filter also affects WebGL overlays, so give permits more opacity and a crisp edge.
    for (const { el, shape } of drawn) if (shape.kind === "polygon") {
      el.fillColor = withAlpha(shape.color, night() ? 0.66 : 0.45);
      el.strokeWidth = night() ? 3 : 2;
    }
    drawUser();
  };
  map.addEventListener("gmp-rangechange", () => drawUser());
  applyStyle();

  const clear = () => { for (const { el } of drawn) el.remove(); drawn = []; };
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
            fillColor: withAlpha(shape.color, night() ? 0.66 : 0.45), strokeColor: shape.color, strokeWidth: night() ? 3 : 2,
          })
          : new Marker({ position: shape.center, altitudeMode: "CLAMP_TO_GROUND", label: "P", title: "Provo parking" });
        el.addEventListener("gmp-click", () => onSelect(shape));
        map.append(el);
        drawn.push({ el, shape });
      }
    },
    setUser(point, accuracy, heading = null, speed = null) {
      if (!point) return clearUser();
      userPoint = point;
      userAccuracy = Number.isFinite(accuracy) && accuracy > 0 ? Math.min(accuracy, 1500) : 0;
      userHeading = Number.isFinite(heading) && !(Number.isFinite(speed) && speed < 0.3) ? heading : null;
      drawUser(); startPulse();
    },
    focus(point, level = 17) { fly({ center: point, range: rangeForZoom(level) }); },
    fitBounds(bounds) {
      const span = Math.max(bounds.north - bounds.south, (bounds.east - bounds.west) * Math.cos(bounds.south * Math.PI / 180));
      fly({ center: { lat: (bounds.south + bounds.north) / 2, lng: (bounds.west + bounds.east) / 2 }, range: Math.min(4000, Math.max(500, span * 111000 * 2)) });
    },
    getView() { return { lat: map.center?.lat ?? center.lat, lng: map.center?.lng ?? center.lng }; },
    zoomBy(delta) { map.range = Math.min(20000, Math.max(150, (map.range ?? DEFAULT_CAMERA.range) / 2 ** delta)); },
    setDark(on) { darkOn = !!on; applyStyle(); },
    setStyle(style) { mapStyle = style === "hybrid" ? "hybrid" : "roadmap"; applyStyle(); },
    resize() {},
    show() { container.hidden = false; visible = true; startPulse(); },
    hide() { container.hidden = true; visible = false; if (pulseFrame !== null) win?.cancelAnimationFrame(pulseFrame); pulseFrame = null; },
    destroy() { clear(); clearUser(); container.classList?.toggle("map-layer-3d--night", false); map.remove(); },
  };
}
