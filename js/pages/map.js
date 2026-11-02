import { escapeHtml } from "../lib/format.js";

let map;

export async function initMap({ areas }) {
  const el = document.querySelector("#parking-map");
  if (!el || !window.L || map) return;
  map = L.map(el, { zoomControl: true, preferCanvas: true }).setView([40.2518, -111.6493], 15);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors"
  }).addTo(map);

  try {
    const response = await fetch("data/byu-campus-parking.json");
    const geometry = await response.json();
    L.geoJSON(geometry, {
      style: (feature) => {
        const permit = feature?.properties?.permit_typ || "";
        const color = permit.includes("V") ? "#2563eb" : permit.includes("T") ? "#d97706" : permit.includes("R") ? "#7c3aed" : permit.includes("G") ? "#0891b2" : "#126b53";
        return { color, weight: 2, fillColor: color, fillOpacity: 0.16 };
      },
      onEachFeature: (feature, layer) => {
        const p = feature.properties || {};
        const title = p.Lot_Type || "BYU parking area";
        const permit = p.permit_typ || "General";
        const description = p.Descriptio || "See posted signage.";
        layer.bindTooltip(`<strong>${escapeHtml(title)}</strong><br>${escapeHtml(permit)} permit<br>${escapeHtml(description)}`, { sticky: true });
      }
    }).addTo(map);
  } catch (error) {
    console.warn("[map] official geometry unavailable", error);
  }

  const points = (areas || []).filter((area) => Number.isFinite(Number(area.latitude)) && Number.isFinite(Number(area.longitude)));
  points.forEach((area) => {
    L.circleMarker([area.latitude, area.longitude], { radius: 7, color: "#17332b", fillColor: area.is_free ? "#126b53" : "#d97706", fillOpacity: 0.95, weight: 2 })
      .bindPopup(`<strong>${escapeHtml(area.area_name)}</strong><br>${escapeHtml(area.lot_code || "")}`)
      .addTo(map);
  });
  if (points.length) map.fitBounds(L.latLngBounds(points.map((area) => [area.latitude, area.longitude])), { padding: [20, 20] });
}

export function refreshMap() {
  if (map) setTimeout(() => map.invalidateSize(), 0);
}
