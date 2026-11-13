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

const USER_COLOR = "#007AFF";

/** `maps` is google.maps; `lib` is the result of maps.importLibrary("maps"). */
export function createMap2D({ maps, lib, container, center = CAMPUS_CENTER, zoom = 15, dark = false, onSelect }) {
  const map = new lib.Map(container, {
    center, zoom,
    gestureHandling: "greedy", clickableIcons: false,
    disableDefaultUI: true, zoomControl: false, keyboardShortcuts: true,
    mapTypeId: "roadmap", styles: dark ? DARK_STYLE : null,
  });
  let mapStyle = "roadmap", darkOn = dark;
  const applyStyle = () => map.setOptions({ mapTypeId: mapStyle, styles: mapStyle === "roadmap" && darkOn ? DARK_STYLE : null });
  let drawn = [], accuracyRing = null, userCursor = null;

  class LocationCursor extends maps.OverlayView {
    constructor(point, heading) {
      super();
      this.point = point;
      const doc = container.ownerDocument;
      this.element = doc.createElement("div");
      this.element.className = "map-user-cursor";
      this.element.setAttribute("aria-hidden", "true");
      const halo = doc.createElement("span");
      halo.className = "map-user-halo";
      this.cone = doc.createElement("span");
      this.cone.className = "map-user-heading";
      const dot = doc.createElement("span");
      dot.className = "map-user-dot";
      this.element.append(halo, this.cone, dot);
      this.update(point, heading);
    }
    onAdd() { this.getPanes().floatPane.append(this.element); }
    draw() {
      const pixel = this.getProjection()?.fromLatLngToDivPixel(new maps.LatLng(this.point));
      if (!pixel) return;
      this.element.style.left = `${pixel.x}px`;
      this.element.style.top = `${pixel.y}px`;
    }
    update(point, heading) {
      this.point = point;
      this.cone.hidden = !Number.isFinite(heading);
      this.cone.style.transform = `rotate(${Number.isFinite(heading) ? heading : 0}deg)`;
      if (this.getMap?.()) this.draw();
    }
    onRemove() { this.element.remove(); }
  }

  const clear = () => { for (const item of drawn) item.setMap(null); drawn = []; };
  const clearUser = () => { accuracyRing?.setMap(null); userCursor?.setMap(null); accuracyRing = userCursor = null; };
  map.addListener?.("zoom_changed", () => userCursor?.draw());

  return {
    mode: "2d",
    setShapes(shapes) {
      clear();
      for (const shape of shapes) {
        const style = { strokeColor: shape.color, strokeOpacity: 1, strokeWeight: 2.4, fillColor: shape.color, map };
        const item = shape.kind === "polygon"
          ? new lib.Polygon({ ...style, paths: shape.rings, fillOpacity: 0.24 })
          : new lib.Circle({ ...style, center: shape.center, radius: 24, fillOpacity: 0.35 });
        item.addListener("click", () => onSelect(shape));
        drawn.push(item);
      }
    },
    setUser(point, accuracy, heading = null, speed = null) {
      if (!point) return clearUser();
      if (Number.isFinite(speed) && speed < 0.3) heading = null;
      const radius = Number.isFinite(accuracy) && accuracy > 0 ? Math.min(accuracy, 1500) : 0;
      if (!userCursor) {
        accuracyRing = new lib.Circle({ map, center: point, radius, strokeColor: USER_COLOR, strokeOpacity: 0.35, strokeWeight: 1, fillColor: USER_COLOR, fillOpacity: 0.12, clickable: false, zIndex: 1000 });
        userCursor = new LocationCursor(point, heading);
        userCursor.setMap(map);
      } else {
        accuracyRing.setCenter(point); accuracyRing.setRadius(radius);
        userCursor.update(point, heading);
        userCursor.draw();
      }
    },
    focus(point, level = 17) { map.panTo(point); map.setZoom(level); },
    fitBounds(bounds, padding = 24) {
      map.fitBounds(bounds, padding);
      // A single small lot should not zoom in past street level.
      maps.event.addListenerOnce(map, "idle", () => { if (map.getZoom() > 18) map.setZoom(18); });
    },
    getView() { const c = map.getCenter(); return { lat: c.lat(), lng: c.lng() }; },
    setDark(on) { darkOn = on; applyStyle(); },
    setStyle(style) { mapStyle = style === "hybrid" ? "hybrid" : "roadmap"; applyStyle(); },
    zoomBy(delta) { map.setZoom(Math.min(21, Math.max(3, (map.getZoom() ?? zoom) + delta))); },
    resize() { maps.event.trigger(map, "resize"); },
    show() { container.hidden = false; this.resize(); },
    hide() { container.hidden = true; },
  };
}
