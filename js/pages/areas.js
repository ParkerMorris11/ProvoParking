// Page: Areas — only verified lots allowed for this permit and parking time.
import { state } from "../state.js";
import { $ } from "../lib/dom.js";
import { DAY_NAMES, fmtTime } from "../lib/format.js";
import { cardHtml } from "../components/area-card.js";
import { eligibleAreas, parkingSelection } from "../domain/parking-results.js";
import { refreshMapEligibility } from "./map.js";

let renderedList, renderedHtml;

export function renderAreas() {
  const selection = parkingSelection(state.find);
  const sorted = eligibleAreas(state.areas, state.rulesByArea, selection);
  const activeHeart = document.activeElement?.closest?.("#area-list .heart");
  const focusedId = activeHeart?.dataset.areaId;
  const focusedLink = document.activeElement?.matches?.("#area-list .link") ? document.activeElement.getAttribute("href") : null;
  const list = $("area-list"), html = sorted.map(cardHtml).join("");
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
  const empty = $("areas-empty");
  if (empty) {
    empty.hidden = sorted.length > 0;
    empty.textContent = selection.permitId == null
      ? "No verified lots are confirmed open to everyone at this time. Choose your permit to see more options."
      : "No verified parking areas match your permit at this time. Check your permit or choose another arrival time.";
  }
  const { permitId, day, time } = selection;
  const permit = state.permits.find((p) => p.permit_id === permitId);
  $("areas-summary").textContent = `${permit ? permit.permit_name : "No permit selected"} · ${selection.live ? "Right now" : "Planned arrival"}: ${DAY_NAMES[day]} at ${fmtTime(time)} (Provo time) · ${sorted.length} matching ${sorted.length === 1 ? "section" : "sections"}`;
  refreshMapEligibility(selection, sorted);
}
