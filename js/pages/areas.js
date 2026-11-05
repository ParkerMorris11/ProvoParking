// Page: Areas — only verified lots allowed for this permit and parking time.
import { state } from "../state.js";
import { $ } from "../lib/dom.js";
import { DAY_NAMES, fmtTime } from "../lib/format.js";
import { cardHtml } from "../components/area-card.js";
import { eligibleAreas, parkingSelection } from "../domain/parking-results.js";
import { arrangeAreas, groupByLot } from "../domain/area-list.js";
import { renderDestinationOptions } from "./find.js";
import { refreshMapEligibility, currentPosition, showAreaOnMap } from "./map.js";

export const PAGE_SIZE = 12;
let renderedList, renderedHtml, expanded = false, toolsReady = false;

function chosenDestination() {
  return state.destinations.find((d) => d.destination_id === state.find.destinationId) || null;
}

function listOptions() {
  const destination = chosenDestination();
  return {
    query: $("area-search")?.value || "",
    sort: $("area-sort")?.value || "walk",
    position: currentPosition(),
    destination: destination ? { latitude: Number(destination.latitude), longitude: Number(destination.longitude) } : null,
  };
}

function initTools() {
  if (toolsReady || typeof document.addEventListener !== "function") return;
  const search = $("area-search"), sort = $("area-sort"), more = $("areas-more"), list = $("area-list"), dest = $("area-destination");
  if (!search || !sort || !more || !list || !dest) return;
  toolsReady = true;
  // Same choice as "Where are you going?" on Find; picking a building here sorts by walk to it.
  dest.addEventListener("change", () => {
    const id = Number(dest.value);
    state.find.destinationId = state.destinations.some((d) => d.destination_id === id) ? id : null;
    if (state.find.destinationId) sort.value = "walk";
    expanded = false;
    renderAreas();
  });
  search.addEventListener("input", () => { expanded = false; renderAreas(); });
  sort.addEventListener("change", () => {
    expanded = false;
    if (sort.value === "distance" && !currentPosition()) $("locate-me")?.click(); // ask for location once
    renderAreas();
  });
  more.addEventListener("click", () => {
    expanded = true;
    const firstNew = list.children.length;
    renderAreas();
    list.children[firstNew]?.querySelector(".link")?.focus();
  });
  list.addEventListener("click", (event) => {
    const button = event.target.closest("[data-map-area]");
    if (!button) return;
    const area = state.areas.find((a) => a.area_id === Number(button.dataset.mapArea));
    if (area) showAreaOnMap(area);
  });
  document.addEventListener("map:location", () => { if (state.currentView === "areas" && sort.value === "distance") renderAreas(); });
}

export function renderAreas() {
  initTools();
  const selection = parkingSelection(state.find);
  const eligible = eligibleAreas(state.areas, state.rulesByArea, selection);
  const options = listOptions();
  const dest = $("area-destination");
  if (dest && document.activeElement !== dest) renderDestinationOptions("area-destination", state.find.destinationId);
  const arranged = arrangeAreas(eligible, options);
  const { sortedBy } = arranged;
  // One card per lot, keeping the section that came first (the closest one for walk/distance sorts).
  const items = groupByLot(arranged.items), total = items.length;
  const walkTo = chosenDestination()?.building_code || "";
  const searching = options.query.trim() !== "";
  const shown = expanded || searching ? items : items.slice(0, PAGE_SIZE);

  const activeHeart = document.activeElement?.closest?.("#area-list .heart");
  const focusedId = activeHeart?.dataset.areaId;
  const focusedLink = document.activeElement?.matches?.("#area-list .link") ? document.activeElement.getAttribute("href") : null;
  const list = $("area-list"), html = shown.map((area) => cardHtml(area, { showOnMap: true, walkTo })).join("");
  // Keep pending heart requests and keyboard focus intact when only the clock changes.
  if (list !== renderedList || html !== renderedHtml) {
    list.innerHTML = html;
    renderedList = list; renderedHtml = html;
    if (focusedId) {
      const replacement = list.querySelector(`.heart[data-area-id="${focusedId}"]`);
      (replacement || $("results-heading")).focus({ preventScroll: true });
    }
    if (focusedLink) {
      const replacement = [...list.querySelectorAll(".link")].find(link => link.getAttribute("href") === focusedLink);
      (replacement || $("results-heading")).focus({ preventScroll: true });
    }
  }

  const more = $("areas-more");
  if (more) {
    more.hidden = shown.length >= items.length;
    more.textContent = `Show all ${items.length} lots`;
  }
  const count = $("areas-count");
  if (count) {
    const order = sortedBy === "walk" ? `shortest walk to ${walkTo} first (estimate)` : sortedBy === "distance" ? "nearest first" : "by lot number";
    const sortNote = options.sort === "distance" && sortedBy !== "distance" ? " Turn on “Use my location” to sort by distance."
      : options.sort === "walk" && sortedBy !== "walk" ? " Choose where you're going to sort by walk." : "";
    count.textContent = total
      ? `Showing ${shown.length} of ${total} ${total === 1 ? "lot" : "lots"}${searching ? ` matching “${options.query.trim()}”` : ""}, ${order}.${sortNote}`
      : searching && eligible.length ? `No lots match “${options.query.trim()}”.` : "";
  }

  const empty = $("areas-empty");
  if (empty) {
    empty.hidden = eligible.length > 0;
    empty.textContent = selection.permitId == null
      ? "No verified lots are confirmed open to everyone at this time. Choose your permit to see more options."
      : "No verified parking areas match your permit at this time. Check your permit or choose another arrival time.";
  }
  const { permitId, day, time } = selection;
  const lotCount = groupByLot(eligible).length;
  const permit = state.permits.find((p) => p.permit_id === permitId);
  $("areas-summary").textContent = `${permit ? permit.permit_name : "No permit selected"} · ${selection.live ? "Right now" : "Planned arrival"}: ${DAY_NAMES[day]} at ${fmtTime(time)} (Provo time) · ${lotCount} matching ${lotCount === 1 ? "lot" : "lots"}`;
  refreshMapEligibility(selection, eligible);
}
