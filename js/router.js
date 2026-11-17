// Hash routing: #find, #areas, #area/<id>, #lots, #favorites, #help.
// #car and #car/<areaId> are not pages: they open the parking timer sheet over the current page.
// To add a page: add a <section id="view-NAME"> in index.html, a tab button, the name here,
// and a render call in renderViews() or showView().
import { state } from "./state.js";
import { $ } from "./lib/dom.js";
import { renderAreas } from "./pages/areas.js";
import { renderAreaDetail } from "./pages/area-detail.js";
import { renderAllLots } from "./pages/all-lots.js";
import { renderFavorites } from "./pages/favorites.js";
import { renderCar, stopTimer, openCarSheet, closeCarSheet } from "./pages/car.js";

import { syncFullscreenRoute, isResultsMode } from "./pages/fullscreen-map.js";
import { nextOrigin } from "./domain/lot-facts.js";

import { initMap, pauseMapLocation, focusAreaOnMap } from "./pages/map.js";

export const VIEWS = ["find", "areas", "area", "lots", "favorites", "help"];

// Re-draws every page that shows area cards (after data changes, e.g. a favorite).
export function renderViews() {
  renderAreas();
  renderFavorites();
  // Only #area/<id> names an area; while the timer sheet (#car/<id>) is open the area page stays as it was.
  const area = location.hash.match(/^#area\/(\d+)/);
  if (state.currentView === "area" && area) renderAreaDetail(Number(area[1]));
}

let showRequestedResults = false;
document.addEventListener("parking:show-results", () => { showRequestedResults = true; });

export function showView() {
  if (!state.db || !state.areas.length && !state.permits.length) return; // data not loaded yet
  const [name, routeId] = (location.hash.replace(/^#/, "") || (state.find.permitId ? "areas" : "find")).split("/");
  const carSheet = name === "car";
  // The sheet opens over whatever page is already showing (or the default page on a direct link).
  const viewName = carSheet ? (state.currentView || (state.find.permitId ? "areas" : "find")) : name;
  const nextView = VIEWS.includes(viewName) ? viewName : "find";
  // Remember which screen a lot page was opened from, so its back link can return there.
  state.lotOrigin = nextOrigin(state.lotOrigin, { from: state.currentView, to: nextView, results: isResultsMode() });
  state.currentView = nextView;
  for (const v of VIEWS) $(`view-${v}`).hidden = v !== state.currentView;
  const tabFor = state.currentView === "area" ? "areas" : state.currentView;
  document.querySelectorAll(".tab").forEach((t) => {
    if (t.dataset.view === tabFor) t.setAttribute("aria-current", "page"); else t.removeAttribute("aria-current");
  });
  renderViews();
  const mapHome = syncFullscreenRoute(state.currentView, { showResults: state.currentView === "areas" && showRequestedResults });
  showRequestedResults = false;
  if (mapHome || state.currentView === "areas") void initMap(); else pauseMapLocation();
  // A lot's page: fly the map to that section and highlight it above the sheet (retried once while the map loads).
  if (state.currentView === "area" && mapHome && /^\d+$/.test(routeId || "")) {
    const id = Number(routeId);
    if (!focusAreaOnMap(id)) setTimeout(() => { if (location.hash === `#area/${id}`) focusAreaOnMap(id); }, 1200);
  }
  if (state.currentView === "lots") renderAllLots();
  if (carSheet) {
    renderCar(routeId);
    openCarSheet();
    return;
  }
  stopTimer();
  if (closeCarSheet()) return; // just closed the timer sheet: stay on the page, focus goes back to the car button
  document.querySelector(`#view-${state.currentView} h2[tabindex]`)?.focus({ preventScroll: true });
  window.scrollTo(0, 0);
}

export function go(hash) {
  if (location.hash === hash) showView(); else location.hash = hash;
}
