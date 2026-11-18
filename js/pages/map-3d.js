// Google Maps Photorealistic 3D view (<gmp-map-3d>), same adapter shape as map-2d.js.
// Lots are extruded polygons; tapping one fires `gmp-click`. Needs v=beta with the maps3d library.
import { CAMPUS_CENTER, withAlpha } from "../domain/map-geometry.js";
import { paddedCamera } from "../domain/map-focus.js";

const ALTITUDE = 1415;
// North-up and a moderate tilt, so the middle of the screen is campus itself. The old 65° tilt facing
// north-north-west put the horizon (north Provo / Orem) in view while campus hid under the drawer.
const DEFAULT_CAMERA = { tilt: 45, heading: 0, range: 2400 };
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
const LONG_PRESS_MS = 500, LONG_PRESS_CLICK_MS = 600, MOVE_PX = 12;
const rangeForZoom = level => Math.min(4000, Math.max(300, 850 * 2 ** (17 - level)));

/** `lib` is the result of google.maps.importLibrary("maps3d"). */
export function createMap3D({ lib, container, center = CAMPUS_CENTER, dark = false, onSelect, onDropPin, onError = () => {} }) {
  let darkOn = dark, mapStyle = "hybrid";
  const scheme = () => lib.ColorScheme?.[darkOn ? "DARK" : "LIGHT"] ?? (darkOn ? "DARK" : "LIGHT");
  const map = new lib.Map3DElement({
    center: { ...center, altitude: ALTITUDE }, ...DEFAULT_CAMERA,
    mode: lib.MapMode?.HYBRID ?? "HYBRID", colorScheme: scheme(),
    // Google's own compass/zoom buttons sat behind our map control rail; the rail already has zoom.
    defaultUIHidden: true,
  });
  map.setAttribute?.("aria-label", "3D map of BYU and Provo parking");
  map.addEventListener("gmp-error", onError);
  container.append(map);

  const Polygon = lib.Polygon3DInteractiveElement ?? lib.Polygon3DElement;
  let selectedKey = null;
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
    for (const entry of drawn) paint(entry);
    drawUser();
  };
  // A selected lot gets a white outline, a near-solid fill and stands taller than the others.
  function paint({ el, shape }) {
    if (shape.kind !== "polygon") return;
    if (shape.dim) {
      // BYU sections your permit can't use right now: faint and flat, so the matching ones stand out.
      el.fillColor = withAlpha("#94a3b8", night() ? 0.12 : 0.1);
      el.strokeColor = withAlpha("#94a3b8", 0.5);
      el.strokeWidth = 1;
      if (el.__height !== 1) { el.__height = 1; el.outerCoordinates = shape.rings[0].map(p => ({ ...p, altitude: 1 })); }
      return;
    }
    const selected = selectedKey != null && shape.key === selectedKey;
    el.fillColor = withAlpha(shape.color, selected ? 0.9 : night() ? 0.66 : 0.45);
    el.strokeColor = selected ? "#ffffff" : shape.color;
    el.strokeWidth = selected ? 6 : night() ? 3 : 2;
    const height = selected ? 30 : shape.source.type === "city" ? 20 : 10;
    if (el.__height !== height) { el.__height = height; el.outerCoordinates = shape.rings[0].map(p => ({ ...p, altitude: height })); }
  }
  // ---- Long press drops a pin --------------------------------------------------------------------
  // Press and hold ~0.5 s without moving. The map reports where a click landed (event.position), so a
  // press that was held and not dragged is treated as a pin drop instead of a tap on a lot.
  const now = () => globalThis.performance?.now?.() ?? Date.now();
  let down = null, press = null, lastDrop = -Infinity, pinPoint = null, pinEl = null;
  container.addEventListener?.("pointerdown", e => { down = { t: now(), x: e.clientX, y: e.clientY, moved: false }; press = null; }, true);
  container.addEventListener?.("pointermove", e => { if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > MOVE_PX) down.moved = true; }, true);
  container.addEventListener?.("pointercancel", () => { down = null; press = null; }, true);
  container.addEventListener?.("pointerup", () => {
    press = down && !down.moved && now() - down.t >= LONG_PRESS_MS ? { at: now() } : null; down = null;
  }, true);
  const drawPin = () => {
    if (!pinPoint) { pinEl?.remove(); pinEl = null; return; }
    const radius = Math.max(4, (map.range ?? DEFAULT_CAMERA.range) / 120);
    const options = { outerCoordinates: circleRing(pinPoint, radius, 24), fillColor: "#e11d48", strokeColor: "#ffffff", strokeWidth: 4 };
    if (pinEl) Object.assign(pinEl, options);
    else {
      pinEl = new lib.Polygon3DElement({ altitudeMode: "CLAMP_TO_GROUND", extruded: false, drawsOccludedSegments: true, zIndex: 1100, ...options });
      pinEl.style && (pinEl.style.pointerEvents = "none");
      map.append(pinEl);
    }
  };
  // True when this click ended a long press; it then drops the pin at the pressed spot.
  const longPressDrop = event => {
    const held = press && now() - press.at < LONG_PRESS_CLICK_MS;
    press = null;
    if (!held) return false;
    const lat = event?.position?.lat, lng = event?.position?.lng;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
    pinPoint = { lat, lng }; drawPin(); lastDrop = now();
    try { win?.navigator?.vibrate?.(15); } catch { /* not supported */ }
    onDropPin?.({ latitude: lat, longitude: lng });
    return true;
  };
  const justDropped = () => now() - lastDrop < 700;
  map.addEventListener("gmp-click", longPressDrop);
  map.addEventListener("gmp-rangechange", () => { drawUser(); drawPin(); });
  applyStyle();

  const clear = () => { for (const { el } of drawn) el.remove(); drawn = []; };
  let lastTarget = null; // the camera last asked for (the live one is mid-flight for a second)
  const currentHeading = () => (Number.isFinite(map.heading) ? map.heading : DEFAULT_CAMERA.heading);
  const frameTilt = () => {
    const tilt = Number.isFinite(map.tilt) ? map.tilt : DEFAULT_CAMERA.tilt;
    return Math.min(55, Math.max(45, tilt));
  };
  const fly = (camera, durationMillis = 1000) => {
    const endCamera = {
      tilt: DEFAULT_CAMERA.tilt,
      heading: currentHeading(),
      ...camera,
      center: { ...camera.center, altitude: ALTITUDE },
    };
    lastTarget = endCamera;
    const reduced = win?.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    const ms = reduced ? 0 : durationMillis;
    if (ms > 0 && typeof map.flyCameraTo === "function") map.flyCameraTo({ endCamera, durationMillis: ms });
    else {
      map.stopCameraAnimation?.();
      Object.assign(map, endCamera);
    }
  };

  return {
    mode: "3d",
    setShapes(shapes) {
      clear();
      for (const original of shapes) {
        // City facilities recorded as a single point used to be default Google marker pins (big red
        // teardrops labeled "P"). Draw them as the same small ground circle the 2D map uses instead.
        const shape = original.kind === "polygon" ? original
          : { ...original, kind: "polygon", rings: [circleRing(original.center, 24, 24)] };
        const el = new Polygon({
            outerCoordinates: shape.rings[0].map(p => ({ ...p, altitude: shape.source.type === "city" ? 20 : 10 })),
            altitudeMode: "RELATIVE_TO_GROUND", extruded: true, drawsOccludedSegments: true,
            fillColor: withAlpha(shape.color, night() ? 0.66 : 0.45), strokeColor: shape.color, strokeWidth: night() ? 3 : 2,
          });
        el.addEventListener("gmp-click", event => { if (!longPressDrop(event) && !justDropped()) onSelect(original); });
        map.append(el);
        el.__height = shape.source.type === "city" ? 20 : 10; // matches the altitude above
        drawn.push({ el, shape });
        paint({ el, shape });
      }
    },
    setSelected(key) { selectedKey = key; for (const entry of drawn) paint(entry); },
    setUser(point, accuracy, heading = null, speed = null) {
      if (!point) return clearUser();
      userPoint = point;
      userAccuracy = Number.isFinite(accuracy) && accuracy > 0 ? Math.min(accuracy, 1500) : 0;
      userHeading = Number.isFinite(heading) && !(Number.isFinite(speed) && speed < 0.3) ? heading : null;
      drawUser(); startPulse();
    },
    clearPin() { pinPoint = null; drawPin(); },
    setPin(point) { pinPoint = { lat: point.lat, lng: point.lng }; drawPin(); },
    resetCamera() {
      map.stopCameraAnimation?.();
      Object.assign(map, { center: { ...CAMPUS_CENTER, altitude: ALTITUDE }, ...DEFAULT_CAMERA });
    },
    focus(point, level = 17) { fly({ center: point, range: rangeForZoom(level), heading: currentHeading(), tilt: frameTilt() }); },
    fitBounds(bounds, padding) {
      const size = {
        width: container.clientWidth || 390,
        height: container.clientHeight || 844,
        maxRange: 6000,
        tilt: frameTilt(),
        heading: currentHeading(),
        fov: Number.isFinite(map.fov) ? map.fov : undefined,
      };
      // Padding (sheet, chip, buttons): aim so the lot sits in the uncovered part of the map.
      const pad = padding && typeof padding === "object" ? padding
        : typeof padding === "number" ? { top: padding, right: padding, bottom: padding, left: padding }
        : {};
      fly(paddedCamera(bounds, pad, size));
    },
    getView() { return { lat: map.center?.lat ?? center.lat, lng: map.center?.lng ?? center.lng }; },
    getCamera() { return { lat: map.center?.lat ?? center.lat, lng: map.center?.lng ?? center.lng, range: map.range, target: lastTarget && { lat: lastTarget.center.lat, lng: lastTarget.center.lng, range: lastTarget.range } }; },
    zoomBy(delta) { map.range = Math.min(20000, Math.max(150, (map.range ?? DEFAULT_CAMERA.range) / 2 ** delta)); },
    setDark(on) { darkOn = !!on; applyStyle(); },
    setStyle(style) { mapStyle = style === "hybrid" ? "hybrid" : "roadmap"; applyStyle(); },
    resize() {},
    show() { container.hidden = false; visible = true; startPulse(); },
    hide() { container.hidden = true; visible = false; if (pulseFrame !== null) win?.cancelAnimationFrame(pulseFrame); pulseFrame = null; },
    destroy() { clear(); clearUser(); pinPoint = null; drawPin(); container.classList?.toggle("map-layer-3d--night", false); map.remove(); },
  };
}
