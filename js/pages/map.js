// Map on the Areas page: BYU lot shapes (and sample areas as dots), colored by the same
// eligibility result as the list. The list below stays the accessible source of truth.
// Leaflet + OpenStreetMap tiles: no API key. Lot shapes: BYU's public parking layer (see js/domain/byu-lots.js).
import { state } from "../state.js";
import { $ } from "../lib/dom.js";
import { escapeHtml } from "../lib/format.js";
import { evaluateArea } from "../components/area-card.js";
import { BYU_LAYER_ITEM_URL } from "../domain/byu-lots.js";

const BYU_CENTER = [40.2518, -111.6493];
const COLORS = { ok: "#1b6e3a", limit: "#a35a00", "no-permit": "#c8102e", blocked: "#c8102e", pick: "#5f6b7a", unknown: "#5f6b7a" };
const LEGEND = [
  ["ok", "✓", "Legal now"],
  ["limit", "!", "Legal, with limits"],
  ["no-permit", "✕", "Not legal for you"],
  ["unknown", "?", "No rules on file / pick a permit"],
];

let map = null;
let layer = null;
let fitted = false;

function createMap() {
  map = window.L.map("area-map", { scrollWheelZoom: false }).setView(BYU_CENTER, 15);
  window.L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: `&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · Lots: <a href="${BYU_LAYER_ITEM_URL}">BYU Campus Parking Lots</a>`,
  }).addTo(map);
  layer = window.L.layerGroup().addTo(map);
  $("map-legend").innerHTML = LEGEND.map(([kind, icon, text]) =>
    `<li><span class="swatch" style="background:${COLORS[kind]}" aria-hidden="true">${icon}</span>${text}</li>`).join("");
}

function popupHtml(area, ev) {
  return `<strong>${escapeHtml(area.area_name)}</strong><br>
    <span class="elig ${ev.kind}"><span aria-hidden="true">${ev.icon}</span> ${escapeHtml(ev.text)}</span><br>
    <a href="#area/${area.area_id}">Rules &amp; details →</a>`;
}

export function renderMap() {
  const box = $("area-map");
  if (!window.L) { // CDN blocked or offline: the list still works.
    box.hidden = true;
    $("map-note").textContent = "The map could not load. Every area is still listed below.";
    return;
  }
  if ($("view-areas").hidden) return; // Leaflet needs a visible box to size itself; redraw when shown.
  if (!map) createMap();
  map.invalidateSize();
  layer.clearLayers();

  const shapes = [];
  for (const area of state.areas) {
    const ev = evaluateArea(area);
    const color = COLORS[ev.kind] || COLORS.unknown;
    const label = `${ev.icon} ${area.lot_code || area.area_name}`;
    const shape = area.boundary
      ? window.L.geoJSON(area.boundary, { style: { color, weight: 2, fillColor: color, fillOpacity: 0.35 } })
      : window.L.circleMarker([area.latitude, area.longitude], { radius: 9, color, weight: 2, fillColor: color, fillOpacity: 0.6 });
    shape.bindTooltip(label, { sticky: true }).bindPopup(popupHtml(area, ev)).addTo(layer);
    if (area.boundary) shapes.push(shape);
  }
  // First time: zoom to BYU's lots if they are loaded, otherwise stay on campus center.
  if (!fitted && shapes.length) {
    map.fitBounds(window.L.featureGroup(shapes).getBounds(), { padding: [12, 12] });
    fitted = true;
  }
  const byu = state.areas.filter((a) => a.boundary).length;
  $("map-note").textContent = byu
    ? `${byu} BYU lots drawn from BYU's public parking map layer. Colors match the list below; tap a lot for its rules.`
    : "BYU lot shapes are not loaded yet, so areas show as dots. Every area is also listed below.";
}
