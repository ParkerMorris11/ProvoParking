// Page: Areas — every parking area, usable ones first.
import { state } from "../state.js";
import { $ } from "../lib/dom.js";
import { DAY_NAMES, fmtTime } from "../lib/format.js";
import { KIND_ORDER } from "../domain/eligibility.js";
import { cardHtml, evaluateArea } from "../components/area-card.js";
import { renderMap } from "./map.js";

export function renderAreas() {
  const sorted = [...state.areas].sort((a, b) => {
    const ka = KIND_ORDER[evaluateArea(a).kind];
    const kb = KIND_ORDER[evaluateArea(b).kind];
    return ka - kb || a.area_name.localeCompare(b.area_name);
  });
  $("area-list").innerHTML = sorted.map(cardHtml).join("");
  renderMap();
  const { permitId, day, time } = state.find;
  const permit = state.permits.find((p) => p.permit_id === permitId);
  $("areas-summary").textContent = permit
    ? `Showing ${DAY_NAMES[day]} at ${fmtTime(time)} with the ${permit.permit_name} permit. Change this on the Find screen.`
    : "No permit chosen yet. Go to Find to pick one and see which areas you can use.";
}
