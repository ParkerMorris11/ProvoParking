// One parking area card, used on the Areas and Favorites pages.
import { state, rulesFor } from "../state.js";
import { escapeHtml } from "../lib/format.js";
import { evaluate } from "../domain/eligibility.js";
import { icon } from "../lib/icons.js";

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
              aria-pressed="${saved}" aria-label="${escapeHtml(label)}">${icon("heart")}</button>`;
}

// Short code for the lot tile, e.g. "Y-SAMPLE" -> "Y". Falls back to "P".
export function lotTile(area) {
  const code = (area.lot_code || "").split("-")[0].slice(0, 2);
  return `<span class="lot-tile" aria-hidden="true">${escapeHtml(code || "P")}</span>`;
}

// Eligibility answer: always icon + words, never color alone.
export function statusHtml(ev, extra = "") {
  return `<p class="elig ${ev.kind}${extra}"><span class="elig-icon" aria-hidden="true">${ev.icon}</span> <span>${escapeHtml(ev.text)}</span></p>`;
}

export function cardHtml(area) {
  const avail = availabilityText(area);
  const ev = evaluateArea(area);
  return `
    <li class="card">
      <div class="card-top">
        ${lotTile(area)}
        <div class="card-name">
          <h3>${escapeHtml(area.area_name)}</h3>
          <p class="meta">${escapeHtml(area.operator)}</p>
        </div>
        ${heartHtml(area)}
      </div>
      ${statusHtml(ev)}
      <div class="chips">
        <span class="chip avail ${avail.cls}">${avail.text}</span>
        ${area.is_free ? `<span class="chip">Free</span>` : ""}
      </div>
      <a class="card-link" href="#area/${area.area_id}" aria-label="Rules and details for ${escapeHtml(area.area_name)}">Rules &amp; details<span aria-hidden="true"> →</span></a>
    </li>`;
}
