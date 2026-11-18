// The Areas map: Google Maps Photorealistic 3D (default) or 2D, with the same lots in both.
// Pure Google Maps, no other map library. The key is read from config.js (see lib/google-maps.js).
// This file decides WHAT to draw (eligible BYU sections + optional Provo city lots) and what a tap does;
// map-2d.js / map-3d.js only draw. Eligibility itself stays in domain/eligibility.js via parking-results.js.
import { escapeHtml, deviceDirections } from "../lib/format.js";

import { nearbyLots, arrivalSuggestion } from "../domain/nearby.js";
import { createLocationTracker } from "../lib/location.js";
import { state } from "../state.js";
import { eligibleAreas, eligibleMapFeatures, parkingSelection } from "../domain/parking-results.js";
import { areaPoint } from "../domain/area-list.js";
import { CAMPUS_CENTER, byuShape, cityShape } from "../domain/map-geometry.js";
import { getMapsApiKey, loadGoogleMaps, onMapsAuthFailure } from "../lib/google-maps.js";
import { initCityLayer, cityPopupHtml, cityFacilitySummary } from "./city-layer.js";
import { createMap2D } from "./map-2d.js";
import { createMap3D } from "./map-3d.js";
import { mapPadding, unionBounds, selectionKey, fitDecision } from "../domain/map-focus.js";

let maps, started = false, mode = "3d", centeredDestinationId;
let mapStyle = "roadmap";
const views = {};           // "2d" / "3d" -> adapter, created the first time each is shown
const layers = {};          // "2d" / "3d" -> the <div> inside #parking-map that holds it
let features = [], tracker, latestPosition = null, nearby = [];
let visibleFeatures = [], cityFacilities = [], cityVisible = false, shapes = [];

const byId = (id) => document.getElementById(id);
const isDark = () => document.documentElement?.getAttribute("data-theme-active") === "dark";
const activeView = () => views[mode];
// On the All Lots screen the map shows every lot: all BYU sections (not only permit matches) plus Provo city lots.
const showingAllLots = () => state.currentView === "lots";
let allLotsFitted = false, drewAllLots = false;
let selectedKey = null; // the lot the user last tapped; drawn highlighted until they close its card
// BYU sections that don't match the chosen permit and time: drawn faint so the matching ones stand out.
let dimFeatures = [], lastFitKey = null, lastFitDest = null;

const PHONE = "(max-width: 600px)";
// What part of the map is uncovered for a given sheet position (phones) or with the sidebar (laptops).
function currentPadding(sheetState) {
  const el = byId("parking-map");
  const sheet = document.getElementById("home-sheet");
  const phone = Boolean(window.matchMedia?.(PHONE).matches);
  const open = sheet && sheet.dataset.state !== "peek";
  return mapPadding({
    phone, sheetState: sheetState || sheet?.dataset.state || "half",
    width: el?.clientWidth || window.innerWidth, height: el?.clientHeight || window.innerHeight,
    sidebarRight: !phone && open ? sheet.getBoundingClientRect().right : 0,
  });
}

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
  const emptyText = document.getElementById("nearby-empty-text") || empty;
  emptyText.textContent = "No lots near you match this permit and time within 5 km. Change your permit or arrival time, or browse every lot.";
  list.innerHTML = nearby.map((lot, index) => {
    const distance = lot.distanceMeters < 1000 ? `${Math.max(10, Math.round(lot.distanceMeters / 10) * 10)} m` : `${(lot.distanceMeters / 1000).toFixed(1)} km`;
    return `<li class="nearby-card"><div class="nearby-card-head"><h4>${escapeHtml(lot.name)}</h4><span>~${distance}</span></div><p class="nearby-category">Lot category ${escapeHtml(lot.permit)} · Matches listed rules; check signs</p><p class="nearby-description">${escapeHtml(lot.description)}</p><button type="button" data-nearby-index="${index}">Show on map</button></li>`;
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
    state.lastPosition = latestPosition;
    const active = update.status === "live" || update.status === "waiting";
    button.textContent = active ? "Stop tracking" : "Use my location";
    button.setAttribute("aria-pressed", String(active));
    document.getElementById("location-status").textContent = update.message;
    const toolbarStatus = document.getElementById("location-toolbar-status");
    if (toolbarStatus) { toolbarStatus.textContent = update.message; toolbarStatus.dataset.status = update.status; }
    document.getElementById("location-status").classList.toggle("is-live", update.status === "live");
    if (latestPosition) {
      const point = { lat: latestPosition.latitude, lng: latestPosition.longitude };
      for (const view of Object.values(views)) view.setUser(point, latestPosition.accuracy, latestPosition.heading, latestPosition.speed);
      if (firstFix) { activeView()?.focus(point, 16); firstFix = false; }
    } else {
      if (wasLive) for (const view of Object.values(views)) view.setUser(null);
      firstFix = true;
    }
    const nearMe = document.getElementById("near-me-btn");
    if (nearMe) nearMe.hidden = active;
    renderNearby();
    if (typeof document.dispatchEvent === "function") document.dispatchEvent(new CustomEvent("map:location"));
  } });
  button.addEventListener("click", () => {
    if (button.getAttribute("aria-pressed") === "true") tracker.stop(); else tracker.start();
  });
  // "Parking near me" (nearby panel, Favorites empty state): turn location on, sort by distance, show the list.
  document.addEventListener("click", (event) => {
    const trigger = event.target.closest?.("[data-near-me]");
    if (!trigger) return;
    const sort = document.getElementById("area-sort");
    if (sort) sort.value = "distance";
    if (button.getAttribute("aria-pressed") !== "true") tracker.start();
    if (location.hash !== "#areas") location.hash = "#areas";
    document.getElementById("nearby-heading")?.scrollIntoView?.({ block: "start" });
  });
  const select = document.getElementById("nearby-permit");
  const codes = [...new Set(features.map(f => f.properties?.permit_typ).filter(code => code && !["R", "No BYU Parking"].includes(code)))].sort();
  select.innerHTML = '<option value="">All matching categories</option>' + codes.map(code => `<option value="${escapeHtml(code)}">${escapeHtml(code)}</option>`).join("");
  select.addEventListener("change", renderNearby);
  // Tapping a nearby lot (the card or its button) flies to that section, highlights it and opens it:
  // one BYU section -> its Area details page (the map keeps it highlighted above the sheet); a shared
  // boundary -> the map card listing its sections.
  document.getElementById("nearby-list").addEventListener("click", event => {
    if (event.target.closest("a, select")) return;
    const card = event.target.closest(".nearby-card");
    const control = card?.querySelector("[data-nearby-index]");
    const lot = control && nearby[Number(control.dataset.nearbyIndex)];
    if (!lot) return;
    const matches = matchesFor(lot.feature);
    if (matches.length === 1) { openLot(matches[0].area_id); return; }
    const shape = shapes.find((s) => s.source.feature === lot.feature);
    if (shape) { activeView()?.fitBounds(shape.bounds, currentPadding("peek")); markSelected(shape.key); }
    else activeView()?.focus({ lat: lot.point.latitude, lng: lot.point.longitude }, 17);
    showFeatureCard(lot.feature);
    document.getElementById("parking-map").focus({ preventScroll: true });
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
  card.innerHTML = `<button type="button" class="map-card-close" aria-label="Close map details"><span aria-hidden="true">×</span></button>${html}`;
  card.hidden = false;
  card.focus({ preventScroll: true });
}

export function hideCard() {
  const card = byId("map-card");
  if (card && !card.hidden) { card.hidden = true; card.innerHTML = ""; }
}

const clearPins = () => { views["2d"]?.clearPin?.(); views["3d"]?.clearPin?.(); };

function showDroppedPin(point) {
  const directions = deviceDirections(point, "driving");
  if (!directions) return;
  markSelected(null);
  showCard(`<div class="lot-popup"><span class="lot-popup-type">Dropped pin</span><h3>Selected location</h3><p>Parking rules and availability are unknown here. Check posted signs before parking.</p><a class="lot-popup-link" href="${escapeHtml(directions.url)}" target="_blank" rel="noopener">Get directions in ${escapeHtml(directions.app)} →</a></div>`);
}

/** A place found by the Google Places search: pin it, fly there, and list the closest lots plus directions. */
export function showSearchedPlace({ lat, lng, title, address }) {
  const view = activeView();
  if (!view) return false;
  clearPins();
  markSelected(null);
  view.setPin?.({ lat, lng });
  view.focus({ lat, lng }, 16);
  const point = { latitude: lat, longitude: lng };
  const close = nearbyLots(features, point, "", 3);
  const directions = deviceDirections(point, "driving");
  const lots = close.map(lot => `<li>${escapeHtml(lot.name)} · category ${escapeHtml(lot.permit)} · ~${lot.distanceMeters < 1609 ? `${Math.max(1, Math.round(lot.distanceMeters / 80) * 80)} m` : `${(lot.distanceMeters / 1609.34).toFixed(1)} mi`}</li>`).join("");
  showCard(`<div class="lot-popup"><span class="lot-popup-type">Searched place</span><h3>${escapeHtml(title)}</h3><p>${escapeHtml(address || "")}</p>`
    + (lots ? `<p><strong>Closest BYU lots</strong></p><ul>${lots}</ul><p>Lot categories only; check your permit and posted signs.</p>` : "<p>No BYU lots within 3 miles. Check posted signs wherever you park.</p>")
    + (directions ? `<a class="lot-popup-link" href="${escapeHtml(directions.url)}" target="_blank" rel="noopener">Get directions in ${escapeHtml(directions.app)} →</a>` : "") + "</div>");
  return true;
}

function showFeatureCard(feature) { showCard(lotCardHtml(feature)); }

function selectShape(shape) {
  markSelected(shape.key);
  if (shape.source.type === "city") {
    const summary = cityFacilitySummary(shape.source.index);
    if (summary) showCard(cityPopupHtml(summary));
    return;
  }
  const matches = matchesFor(shape.source.feature);
  if (matches.length === 1) { hideCard(); location.hash = `#area/${matches[0].area_id}`; } // the existing Area details screen
  else showFeatureCard(shape.source.feature);
}

/** Opens a lot's Area details page; the router then flies the map to it (focusAreaOnMap). */
export function openLot(areaId) {
  const hash = `#area/${areaId}`;
  if (location.hash === hash) focusAreaOnMap(areaId); else location.hash = hash;
}

/** The map boundary of the lot whose details page is open (#area/<id>), or null. */
function openLotFeature() {
  if (state.currentView !== "area") return null;
  const id = Number(/^#area\/(\d+)/.exec(globalThis.location?.hash || "")?.[1]);
  const area = id && state.areas.find((a) => a.area_id === id);
  return (area && features.find((f) => f.properties?.OBJECTID === area.source_feature_id)) || null;
}

function shapeForArea(area) {
  const feature = area && features.find((f) => f.properties?.OBJECTID === area.source_feature_id);
  return feature ? shapes.find((s) => s.source.feature === feature) || null : null;
}

/**
 * Flies to one section and draws it highlighted, framed in the part of the map the sheet leaves
 * uncovered (phones: the top of the screen above the half-height sheet). Returns false until the map is up.
 */
export function focusAreaOnMap(areaId, { sheetState } = {}) {
  const view = activeView();
  const area = state.areas.find((a) => a.area_id === Number(areaId));
  const shape = view && shapeForArea(area);
  if (!shape) return false;
  hideCard();
  view.fitBounds(shape.bounds, currentPadding(sheetState));
  markSelected(shape.key);
  return true;
}

/** "Show on map" from an Areas card: zoom to that section's boundary and open its card. */
export function showAreaOnMap(area) {
  const view = activeView();
  if (!view || !area) return false;
  const shape = shapeForArea(area);
  if (!shape) return false;
  const feature = shape.source.feature;
  const el = byId("parking-map");
  // Phones lower the sheet for this (fullscreen-map.js), so frame it for the lowered sheet.
  view.fitBounds(shape.bounds, currentPadding(window.matchMedia?.(PHONE).matches ? "peek" : undefined));
  markSelected(shape.key);
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

export function resetPersonalMap() {
  stopMapLocation();
  centeredDestinationId = undefined;
  selectedKey = null;
  lastFitKey = null;
  lastFitDest = null;
  hideCard();
  for (const view of Object.values(views)) {
    view.setSelected?.(null);
    view.setUser(null);
    view.resetCamera();
  }
}

// routine: the everyday "N matching mapped boundaries" count. The map home already shows the same
// count in its status tile, so it hides routine messages there; warnings and "All lots" still show.
function setMapStatus(message, { routine = false } = {}) {
  const el = byId("map-status");
  if (!el) return;
  el.textContent = message;
  if (el.dataset) { if (routine) el.dataset.routine = ""; else delete el.dataset.routine; }
}

// ---- Drawing -----------------------------------------------------------------------------------
function drawShapes() {
  shapes = [
    ...dimFeatures.map((feature) => { const shape = byuShape(feature); return shape && { ...shape, dim: true }; }),
    ...visibleFeatures.map(byuShape),
    ...(cityVisible || showingAllLots() ? cityFacilities.map((feature, index) => cityShape(feature, index)) : []),
  ].filter(Boolean);
  activeView()?.setShapes(shapes);
  activeView()?.setSelected?.(selectedKey);
}

function markSelected(key) {
  selectedKey = key;
  activeView()?.setSelected?.(key);
}

// What the city layer asks the map to do.
const cityHost = {
  setFacilities(list) { cityFacilities = list; drawShapes(); if (showingAllLots()) fitAllLots(); },
  setVisible(on) { cityVisible = on; drawShapes(); },
  focus(point, zoom) { activeView()?.focus(point, zoom); },
  fitBounds(bounds) { activeView()?.fitBounds(bounds, 24); },
  select(index) { const summary = cityFacilitySummary(index); if (summary) showCard(cityPopupHtml(summary)); },
};

// Frame the lots on the All Lots screen: BYU campus, or the whole valley only when the city layer is on.
// (Framing all ~600 lots zoomed the 3D view out over the valley, which made campus unreadable.)
function fitAllLots() {
  const framed = cityVisible ? shapes : shapes.filter((shape) => shape.source?.type !== "city");
  const boxes = (framed.length ? framed : shapes).map(shape => shape.bounds || (shape.center && { south: shape.center.lat, north: shape.center.lat, west: shape.center.lng, east: shape.center.lng })).filter(Boolean);
  if (!boxes.length) return;
  activeView()?.fitBounds({
    south: Math.min(...boxes.map(b => b.south)), west: Math.min(...boxes.map(b => b.west)),
    north: Math.max(...boxes.map(b => b.north)), east: Math.max(...boxes.map(b => b.east)),
  }, 24);
}

// A new permit or planned time re-frames the map on the matching sections (same eligibility.js result as
// the list and the chip). No matches: the camera stays put and the sheet shows the empty state.
// Works from every view (Find, results, Favorites, Help, map home); a lot page or a new building keeps its camera.
function fitToMatches(selection, matching) {
  const dest = state.find.destinationId ?? state.find.customDestination?.name ?? null;
  const next = fitDecision({ key: selectionKey(selection), lastKey: lastFitKey, dest, lastDest: lastFitDest, view: state.currentView, count: matching.length, hasPermit: selection.permitId != null });
  lastFitKey = next.key;
  lastFitDest = next.dest;
  if (!next.fit) return;
  const bounds = unionBounds(shapes.filter((shape) => !shape.dim && shape.source?.type === "byu").map((shape) => shape.bounds));
  if (bounds) activeView()?.fitBounds(bounds, currentPadding());
}

// Called on every route change once the map is up: switch between "permit matches" and "every lot".
function syncAllLots() {
  const on = showingAllLots();
  refreshMapEligibility();
  if (!on) {
    // Leaving All Lots: go back to the normal campus camera (3D tilt and heading included),
    // unless a lot was opened from the list: the router is flying to that lot instead.
    if (allLotsFitted && state.currentView !== "area") { for (const view of Object.values(views)) view.resetCamera(); }
    allLotsFitted = false;
    return;
  }
  if (!allLotsFitted && shapes.length) { allLotsFitted = true; fitAllLots(); }
}

// ---- 2D / 3D -----------------------------------------------------------------------------------
async function ensureView(next, center, version) {
  if (views[next]) return views[next];
  const container = document.createElement("div");
  container.className = `map-layer map-layer-${next}`;
  byId("parking-map").append(container);
  layers[next] = container;
  if (next === "2d") {
    const lib = await maps.importLibrary("maps");
    views[next] = createMap2D({ maps, lib, container, center: version === state.authVersion ? center : CAMPUS_CENTER, dark: isDark(), onSelect: selectShape, onDropPin: showDroppedPin });
  } else {
    const lib = await maps.importLibrary("maps3d");
    views[next] = createMap3D({ lib, container, center: version === state.authVersion ? center : CAMPUS_CENTER, dark: isDark(), onSelect: selectShape, onDropPin: showDroppedPin, onError: () => void setMode("2d", "3D view unavailable on this device. Showing the 2D map.") });
  }
  views[next].setStyle(mapStyle);
  return views[next];
}

// In the map rail only the button for the OTHER view shows (shows "3D" while in 2D), so 2D/3D reads as
// one switch. If the button just used is now hidden, focus moves to the one that took its place.
function syncToggle() {
  for (const m of ["2d", "3d"]) {
    const button = byId(`map-mode-${m}`);
    if (!button) continue;
    button.setAttribute("aria-pressed", String(mode === m));
    button.title = mode === m ? `${m.toUpperCase()} view (current)` : `Switch to ${m.toUpperCase()} view`;
  }
  const current = byId(`map-mode-${mode}`), other = byId(`map-mode-${mode === "3d" ? "2d" : "3d"}`);
  if (current && document.activeElement === current && current.closest?.(".map-controls")) other?.focus();
}

export async function setMode(next, failureMessage = "") {
  if (!maps || (next === mode && views[next])) return;
  const version = state.authVersion;
  const center = activeView()?.getView() ?? CAMPUS_CENTER;
  try {
    const view = await ensureView(next, center, version);
    if (mode !== next) views[mode]?.hide();
    mode = next;
    view.show();
    view.setShapes(shapes);
    view.setUser(latestPosition ? { lat: latestPosition.latitude, lng: latestPosition.longitude } : null, latestPosition?.accuracy, latestPosition?.heading, latestPosition?.speed);
    if (next === "3d" && version === state.authVersion) view.focus(center, 16);
    hideCard();
    setMapStatus(failureMessage);
  } catch (error) {
    console.warn(`[map] ${next} view unavailable`, error);
    layers[next]?.remove();
    delete views[next];
    delete layers[next];
    // If 3D fails on first load, 2D may not exist yet — create it here.
    if (next === "3d") {
      await setMode("2d", failureMessage || "3D view unavailable on this device. Showing the 2D map.");
      return;
    }
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
  if (started) { centerOnDestination(); refreshMap(); hideCard(); syncAllLots(); if (!document.hidden && document.getElementById("auth-screen")?.hidden) tracker?.resume(); return; }
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
    syncToggle();
    new MutationObserver(() => { for (const view of Object.values(views)) view.setDark(isDark()); }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme-active"] });
    byId("map-card")?.addEventListener("click", (event) => { if (event.target.closest(".map-card-close")) { hideCard(); clearPins(); markSelected(null); el.focus({ preventScroll: true }); } });
    byId("map-card")?.addEventListener("keydown", (event) => { if (event.key === "Escape") { hideCard(); clearPins(); markSelected(null); el.focus({ preventScroll: true }); } });
    for (const m of ["2d", "3d"]) {
      const button = byId(`map-mode-${m}`);
      if (button) { button.disabled = false; button.addEventListener("click", () => void setMode(m)); }
    }

    // The permit color legend lives in the permit chip list (fullscreen-map.js), not here.
    const reset = document.getElementById("map-reset");
    if (reset) {
      reset.disabled = false;
      reset.addEventListener("click", () => activeView()?.focus(CAMPUS_CENTER, 15));
    }
    // Start 3D in the background so a slow maps3d/WebGL load does not delay
    // lot boundaries, the city layer, or the Find/list UI (initMap is already
    // fire-and-forget from the shell). Fall back to 2D if 3D cannot start.
    const defaultView = setMode(window.matchMedia?.("(max-width: 600px)").matches ? "2d" : "3d");
    void initCityLayer(cityHost);
    let boundaryError = false;
    try {
      const response = await fetch("data/byu-campus-parking.json");
      if (!response.ok) throw new Error(`Boundary request failed (${response.status})`);
      const geometry = await response.json();
      if (geometry.type !== "FeatureCollection" || !Array.isArray(geometry.features)) throw new Error("Invalid boundary snapshot");
      features = geometry.features;
    } catch (error) {
      console.warn("[map] boundary snapshot unavailable", error);
      boundaryError = true;
    }
    await defaultView;
    centerOnDestination();
    refreshMap();
    if (features.length) {
      syncAllLots();
      initLocation();
    } else if (boundaryError) {
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
  const all = showingAllLots();
  const next = all ? features : eligibleMapFeatures(features, areas);
  // The lot whose details are open always stays lit, even when the chosen permit doesn't cover it
  // (opened from All Lots or search), so it doesn't fade out under the faint "not your permit" layer.
  const open = openLotFeature();
  if (!all && open && !next.includes(open)) next.push(open);
  // Redraw when the BYU set changes, or when the screen switches in/out of All Lots (city lots follow it).
  if (all !== drewAllLots || next.length !== visibleFeatures.length || next.some((feature, index) => feature !== visibleFeatures[index])) {
    visibleFeatures = next;
    drewAllLots = all;
    // Every other BYU section stays on the map, faint, so changing permit visibly changes the highlight.
    const shown = new Set(next);
    dimFeatures = all ? [] : features.filter((feature) => !shown.has(feature));
    drawShapes();
  }
  if (!all) fitToMatches(selection, next);
  if (all) {
    // Same 102 as the All Lots list (sections with checked rules); the rest of BYU's map layer (housing,
    // service, reserved stalls) is outlined but has no rules here, so it's counted separately.
    const checked = new Set(state.areas.filter((a) => a.operator === "BYU" && !a.is_sample_data && a.source_feature_id != null).map((a) => a.source_feature_id)).size;
    const outlinedOnly = Math.max(0, visibleFeatures.length - checked);
    setMapStatus(`All lots: ${checked} BYU ${checked === 1 ? "section" : "sections"} with checked rules${outlinedOnly ? ` + ${outlinedOnly} other BYU areas outlined` : ""}${cityFacilities.length ? ` + ${cityFacilities.length} Provo lots` : ""}`);
    renderNearby();
    return;
  }
  setMapStatus(`${visibleFeatures.length} matching mapped ${visibleFeatures.length === 1 ? "boundary" : "boundaries"}`, { routine: true });
  renderNearby();
}

/** Read-only snapshot for tests and the QA harness: what the map is showing right now. */
export function mapSnapshot() {
  const lit = shapes.filter((shape) => !shape.dim && shape.source?.type === "byu");
  return { mode, view: state.currentView, highlighted: lit.length, dimmed: shapes.filter((s) => s.dim).length,
    bounds: unionBounds(lit.map((s) => s.bounds)), camera: activeView()?.getCamera?.() || activeView()?.getView?.() || null, lastFitKey };
}
