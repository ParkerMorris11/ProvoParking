import { escapeHtml } from "../lib/format.js";

let map;

function setMapStatus(message) {
  const el = document.getElementById("map-status");
  if (el) el.textContent = message;
}

function coordinates(area) {
  const lat = area.latitude;
  const lng = area.longitude;
  if (lat == null || lng == null || String(lat).trim() === "" || String(lng).trim() === "") return null;
  const point = [Number(lat), Number(lng)];
  return Number.isFinite(point[0]) && Math.abs(point[0]) <= 90 &&
    Number.isFinite(point[1]) && Math.abs(point[1]) <= 180 ? point : null;
}

export async function initMap({ areas }) {
  const el = document.querySelector("#parking-map");
  if (!el) return;
  if (!window.L) {
    el.hidden = true;
    setMapStatus("Map unavailable. Use the parking list below to view rules and details.");
    return;
  }
  if (map) { refreshMap(); return; }
  const L = window.L;
  try {
    map = L.map(el, { zoomControl: true, preferCanvas: true, scrollWheelZoom: false }).setView([40.2518, -111.6493], 15);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>'
    }).addTo(map);

    // Show database markers immediately, even if the geometry request fails.
    const markers = [];
    for (const area of areas || []) {
      const point = coordinates(area);
      if (!point) continue;
      const details = Number.isInteger(area.area_id) && area.area_id > 0
        ? `<br><a href="#area/${area.area_id}">Rules &amp; details</a>` : "";
      const marker = L.circleMarker(point, { radius: 7, color: "#17332b", fillColor: "#ffffff", fillOpacity: 0.95, weight: 3 })
        .bindPopup(`<strong>${escapeHtml(area.area_name)}</strong><br>${escapeHtml(area.lot_code || "")}${details}`)
        .addTo(map);
      markers.push(marker);
    }
    refreshMap();
    try {
      const response = await fetch("data/byu-campus-parking.json");
      if (!response.ok) throw new Error(`Boundary request failed (${response.status})`);
      const geometry = await response.json();
      if (geometry.type !== "FeatureCollection" || !Array.isArray(geometry.features)) throw new Error("Invalid boundary snapshot");
      L.geoJSON(geometry, {
        style: (feature) => {
          const permit = feature?.properties?.permit_typ || "";
          const color = !permit || permit === "No BYU Parking" ? "#5d6878" : permit === "V" ? "#2563eb" : permit === "T" ? "#d97706" : permit === "R" ? "#7c3aed" : permit === "G" ? "#0891b2" : "#126b53";
          return { color, weight: 2, fillColor: color, fillOpacity: 0.16 };
        },
        onEachFeature: (feature, layer) => {
          const p = feature.properties || {};
          layer.bindPopup(`<strong>${escapeHtml(p.Lot_Type || "BYU parking area")}</strong><br>Permit category: ${escapeHtml(p.permit_typ || "Not recorded")}<br>${escapeHtml(p.Descriptio || "See posted signage.")}`);
        }
      }).addTo(map);
      for (const marker of markers) marker.bringToFront();
      setMapStatus(`${geometry.features.length} boundary shapes loaded. Outlined white dots are database areas; use the list below for permit and time results.`);
    } catch (error) {
      console.warn("[map] boundary snapshot unavailable", error);
      setMapStatus("Lot boundaries unavailable. Database markers and the parking list are still available.");
    }
  } catch (error) {
    console.warn("[map] unavailable", error);
    if (map) map.remove();
    map = null;
    el.hidden = true;
    setMapStatus("Map unavailable. Use the parking list below to view rules and details.");
  }
}

export function refreshMap() {
  if (map) setTimeout(() => map?.invalidateSize(), 0);
}
