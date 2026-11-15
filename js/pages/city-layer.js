// Provo public parking from the city GIS + OSM snapshot, with an accessible list.
// Drawing is done by the map in map.js through a small `host`; this file owns the data, toggle and list.
// Kept separate from BYU eligibility: these are unverified records, not rules.
import { escapeHtml, directionsUrl, appleDirectionsUrl } from "../lib/format.js";
import { facilitySummary, cityLayerBounds } from "../domain/city-parking.js";
import { boundsFromCorners, DOWNTOWN_CENTER } from "../domain/map-geometry.js";

import { loadCitySnapshot } from "../data/city-snapshot.js";

let started = false, facilities = [], source = {};
const byId = id => globalThis.document?.getElementById?.(id) ?? null;

export function cityPopupHtml(summary) {
  const directions = summary.center && directionsUrl(summary.center, "driving");
  const appleDirections = summary.center && appleDirectionsUrl(summary.center, "driving");
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

export function cityFacilitySummary(index) {
  return facilities[index] ? facilitySummary(facilities[index], source) : null;
}

function renderList(host) {
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
    if (toggle && !toggle.checked) { toggle.checked = true; host.setVisible(true); }
    host.focus({ lat: s.center.latitude, lng: s.center.longitude }, 17);
    host.select(index);
    byId("parking-map")?.focus({ preventScroll: false });
  };
}

/**
 * host: { setFacilities(list), setVisible(bool), focus({lat, lng}, zoom), fitBounds(bounds), select(index) }.
 * Safe to call more than once; only the first call does anything.
 */
export async function initCityLayer(host, fetchImpl = fetch) {
  if (!host || started) return;
  started = true;
  const status = byId("city-status");
  try {
    ({ facilities, source } = await loadCitySnapshot(fetchImpl));
    host.setFacilities(facilities);
    const toggle = byId("city-toggle");
    if (toggle) {
      toggle.disabled = false;
      toggle.addEventListener("change", () => host.setVisible(toggle.checked));
    }
    host.setVisible(Boolean(toggle?.checked));
    const showCity = () => {
      if (toggle && !toggle.checked) { toggle.checked = true; host.setVisible(true); }
    };
    const jump = byId("map-downtown");
    if (jump) { jump.disabled = false; jump.addEventListener("click", () => { showCity(); host.focus(DOWNTOWN_CENTER, 16); }); }
    const citywide = byId("map-provo");
    const bounds = boundsFromCorners(cityLayerBounds(facilities));
    if (citywide && bounds) {
      citywide.disabled = false;
      citywide.addEventListener("click", () => { showCity(); host.fitBounds(bounds); });
    }
    renderList(host);
    const gis = facilities.filter(f => f.properties?.record_source !== "osm").length;
    const osm = facilities.length - gis;
    if (status) status.textContent = `${facilities.length} mapped lots and garages across Provo (${gis} city GIS public facilities, ${osm} OpenStreetMap). Coverage is partial. Check posted signs for access, hours, and limits.`;
  } catch (error) {
    started = false;
    console.warn("[map] Provo city lots unavailable", error);
    if (status) status.textContent = "Provo city lots are unavailable right now. BYU lots still work.";
  }
}
