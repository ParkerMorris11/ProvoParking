// Hash routing: #find, #areas, #area/<id>, #favorites, #help.
// #car and #car/<areaId> are not pages: they open the parking timer sheet over the current page.
// To add a page: add a <section id="view-NAME"> in index.html, a tab button, the name here,
// and a render call in renderViews() or showView().
import { state } from "./state.js";
import { $ } from "./lib/dom.js";
import { renderAreas } from "./pages/areas.js";
import { renderAreaDetail } from "./pages/area-detail.js";
import { renderFavorites } from "./pages/favorites.js";
import { renderCar, stopTimer, openCarSheet, closeCarSheet } from "./pages/car.js";

import { initMap, pauseMapLocation } from "./pages/map.js";

export const VIEWS = ["find", "areas", "area", "favorites", "help"];

// Re-draws every page that shows area cards (after data changes, e.g. a favorite).
export function renderViews() {
  renderAreas();
  renderFavorites();
  // Only #area/<id> names an area; while the timer sheet (#car/<id>) is open the area page stays as it was.
  const area = location.hash.match(/^#area\/(\d+)/);
  if (state.currentView === "area" && area) renderAreaDetail(Number(area[1]));
}

export function showView() {
  if (!state.db || !state.areas.length && !state.permits.length) return; // data not loaded yet
  const [name, routeId] = (location.hash.replace(/^#/, "") || (state.find.permitId ? "areas" : "find")).split("/");
  const carSheet = name === "car";
  // The sheet opens over whatever page is already showing (or the default page on a direct link).
  const viewName = carSheet ? (state.currentView || (state.find.permitId ? "areas" : "find")) : name;
  state.currentView = VIEWS.includes(viewName) ? viewName : "find";
  for (const v of VIEWS) $(`view-${v}`).hidden = v !== state.currentView;
  const tabFor = state.currentView === "area" ? "areas" : state.currentView;
  document.querySelectorAll(".tab").forEach((t) => {
    if (t.dataset.view === tabFor) t.setAttribute("aria-current", "page"); else t.removeAttribute("aria-current");
  });
  renderViews();
  if (state.currentView === "areas") void initMap(); else pauseMapLocation();
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
