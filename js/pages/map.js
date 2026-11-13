// The Areas map: Google Maps 2D (default) or Photorealistic 3D, with the same lots in both.
// Pure Google Maps, no other map library. The key is read from config.js (see lib/google-maps.js).
// This file decides WHAT to draw (eligible BYU sections + optional Provo city lots) and what a tap does;
// map-2d.js / map-3d.js only draw. Eligibility itself stays in domain/eligibility.js via parking-results.js.
import { escapeHtml } from "../lib/format.js";

import { nearbyLots, arrivalSuggestion } from "../domain/nearby.js";
import { createLocationTracker } from "../lib/location.js";
import { state } from "../state.js";
import { eligibleAreas, eligibleMapFeatures, parkingSelection } from "../domain/parking-results.js";
import { areaPoint } from "../domain/area-list.js";
import { PERMIT_CATEGORIES, CAMPUS_CENTER, byuShape, cityShape } from "../domain/map-geometry.js";
import { getMapsApiKey, loadGoogleMaps, onMapsAuthFailure } from "../lib/google-maps.js";
import { initCityLayer, cityPopupHtml, cityFacilitySummary } from "./city-layer.js";
import { createMap2D } from "./map-2d.js";
import { createMap3D } from "./map-3d.js";

let maps, started = false, mode = "2d", centeredDestinationId;
let mapStyle = "roadmap";
const views = {};           // "2d" / "3d" -> adapter, created the first time each is shown
const layers = {};          // "2d" / "3d" -> the <div> inside #parking-map that holds it
let features = [], tracker, latestPosition = null, nearby = [];
let visibleFeatures = [], cityFacilities = [], cityVisible = false, shapes = [];

const byId = (id) => document.getElementById(id);
const isDark = () => document.documentElement?.getAttribute("data-theme-active") === "dark";
const activeView = () => views[mode];

function updateArrivalSuggestion(element, candidate) {
  if (!element) return;
  const html = candidate ? `<strong>You may be near ${escapeHtml(candidate.area_name)}.</strong> Location is approximate. <a href="#area/${encodeURIComponent(candidate.area_id)}">Review this lot and confirm before starting a timer</a>.` : "";
  if (element.innerHTML === html) return;
  const hadFocus = element.contains(document.activeElement);
  element.innerHTML = html;
  element.hidden = !candidate;
  if (hadFocus) document.getElementById("locate-me")?.focus();
}

function renderNearby() {
  const list = document.getElementById("nearby-list");
  if (!list) return;
  const controls = document.getElementById("nearby-controls");
  const empty = document.getElementById("nearby-empty");
  const suggestion = document.getElementById("arrival-suggestion");
  controls.hidden = !latestPosition;
  if (!latestPosition) { list.innerHTML = ""; empty.hidden = true; updateArrivalSuggestion(suggestion, null); nearby = []; return; }
  const activeButton = document.activeElement?.closest?.("[data-nearby-index]");
  const focusedLot = activeButton && list.contains(activeButton) ? nearby[Number(activeButton.dataset.nearbyIndex)] : null;
  nearby = nearbyLots(visibleFeatures, latestPosition, document.getElementById("nearby-permit").value);
  const candidate = state.find.live ? arrivalSuggestion(nearby, latestPosition, state.areas) : null;
  updateArrivalSuggestion(suggestion, candidate);
  empty.hidden = nearby.length > 0;
  empty.textContent = "No matching mapped sections in this category within 5 km. Try another category or check your permit and parking time.";
  list.innerHTML = nearby.map((lot, index) => {
    const distance = lot.distanceMeters < 1000 ? `${Math.max(10, Math.round(lot.distanceMeters / 10) * 10)} m` : `${(lot.distanceMeters / 1000).toFixed(1)} km`;
    return `<li class="nearby-card"><div class="nearby-card-head"><h4>${escapeHtml(lot.name)}</h4><span>~${distance}</span></div><p class="nearby-category">Lot category ${escapeHtml(lot.permit)} · Matches listed rules; check signs</p><p class="nearby-description">${escapeHtml(lot.description)}</p><button type="button" data-nearby-index="${index}">Show lot on map <span aria-hidden="true">↗</span></button></li>`;
  }).join("");
  if (focusedLot) {
    const index = nearby.findIndex(lot => lot.name === focusedLot.name && lot.permit === focusedLot.permit);
    if (index >= 0) list.querySelector(`[data-nearby-index="${index}"]`)?.focus({ preventScroll: true });
    else document.getElementById("nearby-permit").focus({ preventScroll: true });
  }
}

function initLocation() {
  const button = document.getElementById("locate-me");
  if (!button || tracker) return;
  button.disabled = false;
  let firstFix = true;
  tracker = createLocationTracker({ geolocation: window.navigator?.geolocation, onChange: update => {
    const wasLive = Boolean(latestPosition);
    latestPosition = update.position;
    const active = update.status === "live" || update.status === "waiting";
    button.textContent = active ? "Stop tracking" : "Use my location";
    button.setAttribute("aria-pressed", String(active));
    document.getElementById("location-status").textContent = update.message;
    const toolbarStatus = document.getElementById("location-toolbar-status");
    if (toolbarStatus) toolbarStatus.textContent = update.message;
    document.getElementById("location-status").classList.toggle("is-live", update.status === "live");
    if (latestPosition) {
      const point = { lat: latestPosition.latitude, lng: latestPosition.longitude };
      for (const view of Object.values(views)) view.setUser(point, latestPosition.accuracy, latestPosition.heading, latestPosition.speed);
      if (firstFix) { activeView()?.focus(point, 16); firstFix = false; }
    } else {
      if (wasLive) for (const view of Object.values(views)) view.setUser(null);
      firstFix = true;
    }
    renderNearby();
    if (typeof document.dispatchEvent === "function") document.dispatchEvent(new CustomEvent("map:location"));
  } });
  button.addEventListener("click", () => {
    if (button.getAttribute("aria-pressed") === "true") tracker.stop(); else tracker.start();
  });
  const select = document.getElementById("nearby-permit");
  const codes = [...new Set(features.map(f => f.properties?.permit_typ).filter(code => code && !["R", "No BYU Parking"].includes(code)))].sort();
  select.innerHTML = '<option value="">All matching categories</option>' + codes.map(code => `<option value="${escapeHtml(code)}">${escapeHtml(code)}</option>`).join("");
  select.addEventListener("change", renderNearby);
  document.getElementById("nearby-list").addEventListener("click", event => {
    const control = event.target.closest("[data-nearby-index]");
    const lot = control && nearby[Number(control.dataset.nearbyIndex)];
    if (!lot) return;
    activeView()?.focus({ lat: lot.point.latitude, lng: lot.point.longitude }, 17);
    showFeatureCard(lot.feature);
    document.getElementById("parking-map").focus({ preventScroll: false });
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) pauseMapLocation();
    else if (document.getElementById("auth-screen")?.hidden) tracker.resume();
  });
  window.addEventListener("pagehide", pauseMapLocation);
}

/** The live location from "Use my location", or null. Used to sort the Areas list by distance. */
export function currentPosition() { return latestPosition; }

// ---- Selected-lot card ------------------------------------------------------------------------
// Replaces the old map popup. One BYU section -> straight to Area details; shared or city lots -> this card.
function matchesFor(feature) {
  const id = feature?.properties?.OBJECTID;
  return state.areas.filter((area) => area.source_feature_id === id && !area.is_sample_data);
}

// What the GIS layer says about one mapped section, plus links into the app for its matching areas.
export function lotCardHtml(feature, matches = matchesFor(feature)) {
  const p = feature.properties || {};
  const links = matches.map((area) => {
    const label = matches.length > 1 ? ` · ${escapeHtml(area.area_name)}` : "";
    return `<a class="lot-popup-link" href="#area/${area.area_id}">Rules &amp; details${label} →</a>
      <a class="lot-popup-link" href="#car/${area.area_id}">Park here${label} →</a>`;
  }).join("");
  return `<div class="lot-popup"><span class="lot-popup-type">${escapeHtml(p.Map_Catego || "Parking boundary")}</span><h3>${escapeHtml(matches.length === 1 ? matches[0].area_name : (p.Lot_Type || "BYU parking area"))}</h3><span class="lot-popup-permit">Lot category ${escapeHtml(p.permit_typ || "not recorded")}</span><p>${escapeHtml(p.Descriptio || "See posted signage.")}</p>${links}</div>`;
}

function showCard(html) {
  const card = byId("map-card");
  if (!card) return;
  card.innerHTML = `<button type="button" class="map-card-close" aria-label="Close lot details"><span aria-hidden="true">×</span></button>${html}`;
  card.hidden = false;
  card.focus({ preventScroll: true });
}

export function hideCard() {
  const card = byId("map-card");
  if (card && !card.hidden) { card.hidden = true; card.innerHTML = ""; }
}

function showFeatureCard(feature) { showCard(lotCardHtml(feature)); }

function selectShape(shape) {
  if (shape.source.type === "city") {
    const summary = cityFacilitySummary(shape.source.index);
    if (summary) showCard(cityPopupHtml(summary));
    return;
  }
  const matches = matchesFor(shape.source.feature);
  if (matches.length === 1) { hideCard(); location.hash = `#area/${matches[0].area_id}`; } // the existing Area details screen
  else showFeatureCard(shape.source.feature);
}

/** "Show on map" from an Areas card: zoom to that section's boundary and open its card. */
export function showAreaOnMap(area) {
  const view = activeView();
  if (!view || !area) return false;
  const feature = visibleFeatures.find((f) => f.properties?.OBJECTID === area.source_feature_id);
  const shape = feature && shapes.find((s) => s.source.feature === feature);
  if (!shape) return false;
  const el = byId("parking-map");
  el?.scrollIntoView?.({ behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
  if (mode === "2d") view.fitBounds(shape.bounds, 24); else view.focus(shape.center, 18);
  showFeatureCard(feature);
  el?.focus?.({ preventScroll: true });
  return true;
}

export function pauseMapLocation() {
  tracker?.pause();
}

export function stopMapLocation() {
  tracker?.stop();
}

function setMapStatus(message) {
  const el = byId("map-status");
  if (el) el.textContent = message;
}

// ---- Drawing -----------------------------------------------------------------------------------
function drawShapes() {
  shapes = [
    ...visibleFeatures.map(byuShape),
    ...(cityVisible ? cityFacilities.map((feature, index) => cityShape(feature, index)) : []),
  ].filter(Boolean);
  activeView()?.setShapes(shapes);
}

// What the city layer asks the map to do.
const cityHost = {
  setFacilities(list) { cityFacilities = list; drawShapes(); },
  setVisible(on) { cityVisible = on; drawShapes(); },
  focus(point, zoom) { activeView()?.focus(point, zoom); },
  fitBounds(bounds) { activeView()?.fitBounds(bounds, 24); },
  select(index) { const summary = cityFacilitySummary(index); if (summary) showCard(cityPopupHtml(summary)); },
};

// ---- 2D / 3D -----------------------------------------------------------------------------------
async function ensureView(next, center) {
  if (views[next]) return views[next];
  const container = document.createElement("div");
  container.className = `map-layer map-layer-${next}`;
  byId("parking-map").append(container);
  layers[next] = container;
  if (next === "2d") {
    const lib = await maps.importLibrary("maps");
    views[next] = createMap2D({ maps, lib, container, center, dark: isDark(), onSelect: selectShape });
  } else {
    const lib = await maps.importLibrary("maps3d");
    views[next] = createMap3D({ lib, container, center, dark: isDark(), onSelect: selectShape, onError: () => void setMode("2d", "3D view unavailable on this device. Showing the 2D map.") });
  }
  views[next].setStyle(mapStyle);
  return views[next];
}

function syncToggle() {
  for (const m of ["2d", "3d"]) {
    const button = byId(`map-mode-${m}`);
    if (button) button.setAttribute("aria-pressed", String(mode === m));
  }
}

export async function setMode(next, failureMessage = "") {
  if (!maps || (next === mode && views[next])) return;
  const center = activeView()?.getView() ?? CAMPUS_CENTER;
  try {
    const view = await ensureView(next, center);
    activeView()?.hide();
    mode = next;
    view.show();
    view.setShapes(shapes);
    view.setUser(latestPosition ? { lat: latestPosition.latitude, lng: latestPosition.longitude } : null, latestPosition?.accuracy, latestPosition?.heading, latestPosition?.speed);
    if (next === "3d") view.focus(center, 16);
    hideCard();
    setMapStatus(failureMessage);
  } catch (error) {
    console.warn(`[map] ${next} view unavailable`, error);
    layers[next]?.remove();
    delete views[next];
    delete layers[next];
    mode = "2d";
    views["2d"]?.show();
    setMapStatus(failureMessage || "3D view unavailable on this device. Showing the 2D map.");
  }
  syncToggle();
  syncStyleControl();
}

// The same labeled satellite / road map choice applies to both views.
function syncStyleControl() {
  const button = byId("map-style");
  if (!button) return;
  button.setAttribute("aria-pressed", String(mapStyle === "hybrid"));
  button.setAttribute("aria-label", mapStyle === "hybrid" ? "Switch to road map" : "Switch to satellite with labels");
  button.title = button.getAttribute("aria-label");
}

export async function toggleMapStyle() {
  mapStyle = mapStyle === "hybrid" ? "roadmap" : "hybrid";
  for (const view of Object.values(views)) view.setStyle(mapStyle);
  syncStyleControl();
}

export function zoomMap(delta) { activeView()?.zoomBy(delta); }

function centerOnDestination() {
  const id = state.find.destinationId;
  if (!id || id === centeredDestinationId) return;
  const point = areaPoint(state.destinations.find(d => d.destination_id === id));
  if (!point) return;
  centeredDestinationId = id;
  activeView()?.focus({ lat: point.latitude, lng: point.longitude }, 16);
}

/** Clean, minimal message on the map canvas when there is no usable Google Maps key. */
export function renderMapMessage(el, message) {
  el.innerHTML = `<p class="map-empty">${escapeHtml(message)}</p>`;
}

export const NO_KEY_MESSAGE = "The map needs a Google Maps key. Add GOOGLE_MAPS_API_KEY to config.js. The parking list below still works.";

export async function initMap() {
  const el = document.querySelector("#parking-map");
  if (!el) return;
  if (started) { centerOnDestination(); refreshMap(); hideCard(); if (!document.hidden && document.getElementById("auth-screen")?.hidden) tracker?.resume(); return; }
  const key = getMapsApiKey();
  if (!key) {
    renderMapMessage(el, NO_KEY_MESSAGE);
    setMapStatus("");
    return;
  }
  started = true;
  try {
    maps = await loadGoogleMaps({ key });
    onMapsAuthFailure(() => { renderMapMessage(el, "Google rejected the map key. Check its allowed sites and that Maps JavaScript API is enabled."); setMapStatus(""); });
    el.textContent = "";
    mode = "2d";
    await ensureView("2d", CAMPUS_CENTER);
    views["2d"].show();
    syncToggle();
    new MutationObserver(() => { for (const view of Object.values(views)) view.setDark(isDark()); }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme-active"] });
    byId("map-card")?.addEventListener("click", (event) => { if (event.target.closest(".map-card-close")) { hideCard(); el.focus({ preventScroll: true }); } });
    byId("map-card")?.addEventListener("keydown", (event) => { if (event.key === "Escape") { hideCard(); el.focus({ preventScroll: true }); } });
    for (const m of ["2d", "3d"]) {
      const button = byId(`map-mode-${m}`);
      if (button) { button.disabled = false; button.addEventListener("click", () => void setMode(m)); }
    }

    const legend = document.getElementById("map-legend");
    if (legend) legend.innerHTML = PERMIT_CATEGORIES.map((item) => `<li><span class="legend-dot" style="background:${item.color}" aria-hidden="true"></span>${escapeHtml(item.label)}</li>`).join("");
    const reset = document.getElementById("map-reset");
    if (reset) {
      reset.disabled = false;
      reset.addEventListener("click", () => activeView()?.focus(CAMPUS_CENTER, 15));
    }
    centerOnDestination();
    refreshMap();
    void initCityLayer(cityHost);
    try {
      const response = await fetch("data/byu-campus-parking.json");
      if (!response.ok) throw new Error(`Boundary request failed (${response.status})`);
      const geometry = await response.json();
      if (geometry.type !== "FeatureCollection" || !Array.isArray(geometry.features)) throw new Error("Invalid boundary snapshot");
      features = geometry.features;
      refreshMapEligibility();
      initLocation();
    } catch (error) {
      console.warn("[map] boundary snapshot unavailable", error);
      setMapStatus("Lot boundaries unavailable. The parking list is still available.");
    }
  } catch (error) {
    console.warn("[map] unavailable", error);
    started = false;
    renderMapMessage(el, "Map unavailable right now. Use the parking list to view rules and details.");
    setMapStatus("");
  }
}

export function refreshMap() {
  if (activeView()) setTimeout(() => activeView()?.resize(), 0);
}

export function refreshMapEligibility(selection = parkingSelection(state.find), areas = eligibleAreas(state.areas, state.rulesByArea, selection)) {
  if (!maps || !features.length && !visibleFeatures.length) return;
  const next = eligibleMapFeatures(features, areas);
  if (next.length !== visibleFeatures.length || next.some((feature, index) => feature !== visibleFeatures[index])) {
    visibleFeatures = next;
    drawShapes();
  }
  setMapStatus(`${visibleFeatures.length} matching mapped ${visibleFeatures.length === 1 ? "boundary" : "boundaries"}`);
  renderNearby();
}
