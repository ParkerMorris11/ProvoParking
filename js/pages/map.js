import { escapeHtml } from "../lib/format.js";

let map;

function setMapStatus(message) {
  const el = document.getElementById("map-status");
  if (el) el.textContent = message;
}

const categories = [
  { label: "Student · Y / G", color: "#3168dc", codes: ["Y", "G"] },
  { label: "Employee · A", color: "#b07b23", codes: ["A"] },
  { label: "Visitor · V", color: "#07859a", codes: ["V"] },
  { label: "Free · U", color: "#16806b", codes: ["U"] },
  { label: "Housing", color: "#8062b3", codes: ["B", "C", "D", "YM", "YV", "BCD"] },
  { label: "Timed · T / EV", color: "#c2643a", codes: ["T", "EV"] },
  { label: "Restricted / other", color: "#687589", codes: [] },
];

function boundaryStyle(feature) {
  const permit = feature?.properties?.permit_typ;
  const category = categories.find((item) => item.codes.includes(permit)) || categories.at(-1);
  return { color: category.color, weight: 1.6, fillColor: category.color, fillOpacity: 0.24 };
}

export async function initMap() {
  const el = document.querySelector("#parking-map");
  if (!el) return;
  if (!window.L) {
    el.hidden = true;
    setMapStatus("Map unavailable. Use the parking list to view rules and details.");
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

    const legend = document.getElementById("map-legend");
    if (legend) legend.innerHTML = categories.map((item) => `<li><span class="legend-dot" style="background:${item.color}" aria-hidden="true"></span>${escapeHtml(item.label)}</li>`).join("");
    const reset = document.getElementById("map-reset");
    if (reset) {
      reset.disabled = false;
      reset.addEventListener("click", () => map.setView([40.2518, -111.6493], 15));
    }
    refreshMap();
    try {
      const response = await fetch("data/byu-campus-parking.json");
      if (!response.ok) throw new Error(`Boundary request failed (${response.status})`);
      const geometry = await response.json();
      if (geometry.type !== "FeatureCollection" || !Array.isArray(geometry.features)) throw new Error("Invalid boundary snapshot");
      L.geoJSON(geometry, {
        style: boundaryStyle,
        onEachFeature: (feature, layer) => {
          const p = feature.properties || {};
          layer.bindPopup(`<div class="lot-popup"><span class="lot-popup-type">${escapeHtml(p.Map_Catego || "Parking boundary")}</span><h3>${escapeHtml(p.Lot_Type || "BYU parking area")}</h3><span class="lot-popup-permit">Permit ${escapeHtml(p.permit_typ || "not recorded")}</span><p>${escapeHtml(p.Descriptio || "See posted signage.")}</p></div>`, { maxWidth: 280 });
        }
      }).addTo(map);
      setMapStatus(`${geometry.features.length} mapped boundaries`);
    } catch (error) {
      console.warn("[map] boundary snapshot unavailable", error);
      setMapStatus("Lot boundaries unavailable. The parking list is still available.");
    }
  } catch (error) {
    console.warn("[map] unavailable", error);
    if (map) map.remove();
    map = null;
    el.hidden = true;
    setMapStatus("Map unavailable. Use the parking list to view rules and details.");
  }
}

export function refreshMap() {
  if (map) setTimeout(() => map?.invalidateSize(), 0);
}
