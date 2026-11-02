// Page: Areas — every parking area, usable ones first.
import { state } from "../state.js";
import { $ } from "../lib/dom.js";
import { DAY_NAMES, fmtTime } from "../lib/format.js";
import { KIND_ORDER } from "../domain/eligibility.js";
import { cardHtml, evaluateArea } from "../components/area-card.js";

export function renderAreas() {
  const sorted = [...state.areas].sort((a, b) => {
    const ka = KIND_ORDER[evaluateArea(a).kind];
    const kb = KIND_ORDER[evaluateArea(b).kind];
    return ka - kb || a.area_name.localeCompare(b.area_name);
  });
  $("area-list").innerHTML = sorted.map(cardHtml).join("");
  const { permitId, day, time } = state.find;
  const permit = state.permits.find((p) => p.permit_id === permitId);
  $("areas-summary").textContent = permit
    ? `${permit.permit_name} · ${DAY_NAMES[day]} at ${fmtTime(time)}`
    : "Explore the campus map, then choose your permit to check parking rules.";
}
