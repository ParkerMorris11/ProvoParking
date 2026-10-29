// One parking area card, used on the Areas and Favorites pages.
import { state, rulesFor } from "../state.js";
import { escapeHtml } from "../lib/format.js";
import { evaluate } from "../domain/eligibility.js";

export function availabilityText(area) {
  if (area.est_available_spaces == null) return { text: "Availability unknown", cls: "" };
  const pct = area.total_spaces ? area.est_available_spaces / area.total_spaces : 0;
  return {
    text: `About ${area.est_available_spaces} of ${area.total_spaces} spaces open (estimate)`,
    cls: pct < 0.1 ? "low" : "ok",
  };
}

export function evaluateArea(area) {
  const { permitId, day, time } = state.find;
  return evaluate(rulesFor(area.area_id), permitId, day, time);
}

export function heartHtml(area) {
  const saved = state.favoriteIds.has(area.area_id);
  const label = saved ? `Remove ${area.area_name} from favorites` : `Save ${area.area_name} to favorites`;
  return `<button type="button" class="heart" data-area-id="${area.area_id}"
              aria-pressed="${saved}" aria-label="${escapeHtml(label)}">${saved ? "♥" : "♡"}</button>`;
}

export function cardHtml(area) {
  const avail = availabilityText(area);
  const ev = evaluateArea(area);
  return `
    <li class="card">
      <div class="card-body">
        <h3>${escapeHtml(area.area_name)}</h3>
        <p class="meta">${escapeHtml(area.operator)}${area.is_free ? " · Free" : ""}</p>
        <p class="elig ${ev.kind}"><span aria-hidden="true">${ev.icon}</span> ${escapeHtml(ev.text)}</p>
        <p class="avail ${avail.cls}">${avail.text}</p>
        <a class="link" href="#area/${area.area_id}" aria-label="Rules and details for ${escapeHtml(area.area_name)}">Rules &amp; details →</a>
      </div>
      ${heartHtml(area)}
    </li>`;
}
