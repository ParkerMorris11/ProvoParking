// Google Maps 2D view. Same adapter shape as map-3d.js so map.js can swap between them:
//   setShapes(shapes), setUser(point, accuracy), focus(point, zoom), fitBounds(bounds), getView(),
//   setDark(on), show(), hide(). Shapes come from domain/map-geometry.js.
import { CAMPUS_CENTER } from "../domain/map-geometry.js";

// Dark road map, ported from ProvoParking3D's Map2DView.
export const DARK_STYLE = [
  { elementType: "geometry", stylers: [{ color: "#111827" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#111827" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#94a3b8" }] },
  { featureType: "administrative.locality", elementType: "labels.text.fill", stylers: [{ color: "#e2e8f0" }] },
  { featureType: "poi", elementType: "labels.text.fill", stylers: [{ color: "#94a3b8" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#1e293b" }] },
  { featureType: "poi.park", elementType: "labels.text.fill", stylers: [{ color: "#64748b" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#1f2937" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#111827" }] },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#9ca3af" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#374151" }] },
  { featureType: "road.highway", elementType: "geometry.stroke", stylers: [{ color: "#1f2937" }] },
  { featureType: "transit", elementType: "geometry", stylers: [{ color: "#1f2937" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#090d16" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#64748b" }] },
];

const USER_COLOR = "#0062B8";
const metersPerPixel = (zoom, lat) => 156543.03392 * Math.cos(lat * Math.PI / 180) / 2 ** zoom;

/** `maps` is google.maps; `lib` is the result of maps.importLibrary("maps"). */
export function createMap2D({ maps, lib, container, center = CAMPUS_CENTER, zoom = 15, dark = false, onSelect }) {
  const map = new lib.Map(container, {
    center, zoom,
    gestureHandling: "greedy", clickableIcons: false,
    disableDefaultUI: true, zoomControl: true, keyboardShortcuts: true,
    zoomControlOptions: { position: maps.ControlPosition?.RIGHT_CENTER },
    styles: dark ? DARK_STYLE : null,
  });
  let drawn = [], accuracyRing = null, userDot = null, userPoint = null;

  const clear = () => { for (const item of drawn) item.setMap(null); drawn = []; };
  const clearUser = () => { accuracyRing?.setMap(null); userDot?.setMap(null); accuracyRing = userDot = userPoint = null; };
  const sizeDot = () => userDot?.setRadius(8 * metersPerPixel(map.getZoom() ?? zoom, userPoint.lat));
  map.addListener?.("zoom_changed", () => { if (userDot) sizeDot(); });

  return {
    mode: "2d",
    setShapes(shapes) {
      clear();
      for (const shape of shapes) {
        const style = { strokeColor: shape.color, strokeOpacity: 0.9, strokeWeight: 1.6, fillColor: shape.color, map };
        const item = shape.kind === "polygon"
          ? new lib.Polygon({ ...style, paths: shape.rings, fillOpacity: 0.24 })
          : new lib.Circle({ ...style, center: shape.center, radius: 24, fillOpacity: 0.35 });
        item.addListener("click", () => onSelect(shape));
        drawn.push(item);
      }
    },
    setUser(point, accuracy) {
      if (!point) return clearUser();
      userPoint = point;
      if (!userDot) {
        accuracyRing = new lib.Circle({ map, center: point, radius: accuracy, strokeColor: USER_COLOR, strokeWeight: 1, fillColor: USER_COLOR, fillOpacity: 0.07, clickable: false });
        userDot = new lib.Circle({ map, center: point, radius: 8, strokeColor: "#ffffff", strokeWeight: 3, strokeOpacity: 1, fillColor: USER_COLOR, fillOpacity: 1, clickable: false, zIndex: 2 });
      } else {
        accuracyRing.setCenter(point); accuracyRing.setRadius(accuracy);
        userDot.setCenter(point);
      }
      sizeDot();
    },
    focus(point, level = 17) { map.panTo(point); map.setZoom(level); },
    fitBounds(bounds, padding = 24) {
      map.fitBounds(bounds, padding);
      // A single small lot should not zoom in past street level.
      maps.event.addListenerOnce(map, "idle", () => { if (map.getZoom() > 18) map.setZoom(18); });
    },
    getView() { const c = map.getCenter(); return { lat: c.lat(), lng: c.lng() }; },
    setDark(on) { map.setOptions({ styles: on ? DARK_STYLE : null }); },
    resize() { maps.event.trigger(map, "resize"); },
    show() { container.hidden = false; this.resize(); },
    hide() { container.hidden = true; },
  };
}
