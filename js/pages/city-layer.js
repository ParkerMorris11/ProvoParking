// Draws Provo public parking from the city GIS + OSM snapshot on the shared Leaflet map,
// with an accessible list. Kept separate from BYU eligibility: these are unverified records, not rules.
import { escapeHtml, directionsUrl } from "../lib/format.js";
import { facilitySummary, cityLayerBounds } from "../domain/city-parking.js";

import { loadCitySnapshot } from "../data/city-snapshot.js";

const CITY_COLOR = "#7a4fb5";
let layer, facilities = [], source = {};
const layersByIndex = [];
const byId = id => globalThis.document?.getElementById?.(id) ?? null;

export function cityPopupHtml(summary) {
  const directions = summary.center && directionsUrl(summary.center);
  const sourceLink = summary.sourceUrl
    ? `<a href="${escapeHtml(summary.sourceUrl)}" target="_blank" rel="noopener">${escapeHtml(summary.sourceLabel || "Source")}</a> · `
    : "";
  return `<div class="lot-popup"><span class="lot-popup-type">Provo · ${escapeHtml(summary.kind)}</span>` +
    `<h3>${escapeHtml(summary.name)}</h3><span class="lot-popup-permit">${escapeHtml(summary.spaces)}</span>` +
    `<p>${escapeHtml(summary.hours)}</p>` + (summary.notes ? `<p>${escapeHtml(summary.notes)}</p>` : "") +
    (summary.access ? `<p>${escapeHtml(summary.access)}</p>` : "") +
    `<p class="lot-popup-caution">${escapeHtml(summary.caution)}</p>` +
    `<p class="lot-popup-source">${sourceLink}${escapeHtml(summary.provenance)}</p>` +
    (directions ? `<p><a href="${escapeHtml(directions)}" target="_blank" rel="noopener">Get directions</a></p>` : "") + `</div>`;
}

function renderList(map) {
  const list = byId("city-lot-list");
  const count = byId("city-lot-count");
  if (count) count.textContent = String(facilities.length);
  if (!list) return;
  list.innerHTML = facilities.map((feature, index) => {
    const s = facilitySummary(feature, source);
    const label = `Show on map: ${s.name}`;
    return `<li class="nearby-card"><div class="nearby-card-head"><h4>${escapeHtml(s.name)}</h4><span>${escapeHtml(s.kind)}</span></div>` +
      `<p class="nearby-category">${escapeHtml(s.spaces)} · ${escapeHtml(s.hours)}</p>` +
      (s.access ? `<p class="nearby-description">${escapeHtml(s.access)}</p>` : "") +
      (s.notes ? `<p class="nearby-description">${escapeHtml(s.notes)}</p>` : "") +
      `<button type="button" data-city-index="${index}" aria-label="${escapeHtml(label)}">Show on map <span aria-hidden="true">↗</span></button></li>`;
  }).join("");
  list.onclick = event => {
    const control = event.target.closest("[data-city-index]");
    const index = control ? Number(control.dataset.cityIndex) : -1;
    const s = facilities[index] && facilitySummary(facilities[index], source);
    if (!s?.center) return;
    const toggle = byId("city-toggle");
    if (toggle && !toggle.checked) { toggle.checked = true; layer.addTo(map); }
    map.setView([s.center.latitude, s.center.longitude], 17);
    layersByIndex[index]?.openPopup();
    byId("parking-map")?.focus({ preventScroll: false });
  };
}

export async function initCityLayer(map, L = window.L, fetchImpl = fetch) {
  if (!map || !L || layer) return;
  const status = byId("city-status");
  try {
    ({ facilities, source } = await loadCitySnapshot(fetchImpl));
    layer = L.geoJSON({ type: "FeatureCollection", features: facilities }, {
      style: () => ({ color: CITY_COLOR, weight: 1.6, dashArray: "5 4", fillColor: CITY_COLOR, fillOpacity: 0.16 }),
      pointToLayer: (_feature, latlng) => L.circleMarker(latlng, {
        radius: 7, color: CITY_COLOR, weight: 1.6, fillColor: CITY_COLOR, fillOpacity: 0.35,
      }),
      onEachFeature: (feature, featureLayer) => {
        layersByIndex[facilities.indexOf(feature)] = featureLayer;
        featureLayer.bindPopup(cityPopupHtml(facilitySummary(feature, source)), { maxWidth: 280 });
      },
    });
    const toggle = byId("city-toggle");
    if (toggle) {
      toggle.disabled = false;
      toggle.addEventListener("change", () => { if (toggle.checked) layer.addTo(map); else map.removeLayer(layer); });
    }
    if (!toggle || toggle.checked) layer.addTo(map);
    const jump = byId("map-downtown");
    const showCity = () => {
      if (toggle && !toggle.checked) { toggle.checked = true; layer.addTo(map); }
    };
    if (jump) { jump.disabled = false; jump.addEventListener("click", () => { showCity(); map.setView([40.2338, -111.6595], 16); }); }
    const citywide = byId("map-provo");
    const bounds = cityLayerBounds(facilities);
    if (citywide && bounds) {
      citywide.disabled = false;
      citywide.addEventListener("click", () => { showCity(); map.fitBounds(bounds, { padding: [24, 24], maxZoom: 13 }); });
    }
    renderList(map);
    const gis = facilities.filter(f => f.properties?.record_source !== "osm").length;
    const osm = facilities.length - gis;
    if (status) status.textContent = `${facilities.length} mapped lots and garages across Provo (${gis} city GIS public facilities, ${osm} OpenStreetMap). Coverage is partial. Check posted signs for access, hours, and limits.`;
  } catch (error) {
    console.warn("[map] Provo city lots unavailable", error);
    if (status) status.textContent = "Provo city lots are unavailable right now. BYU lots still work.";
  }
}
