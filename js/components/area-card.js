// One parking area card, used on the Areas and Favorites pages.
import { state, rulesFor } from "../state.js";
import { escapeHtml, directionsUrl, appleDirectionsUrl, entrancePoint } from "../lib/format.js";
import { evaluate } from "../domain/eligibility.js";
import { parkingSelection } from "../domain/parking-results.js";
import { formatDistance } from "../domain/area-list.js";

export function availabilityText(area) {
  if (area.est_available_spaces == null) return { text: "Availability unknown", cls: "" };
  const pct = area.total_spaces ? area.est_available_spaces / area.total_spaces : 0;
  return {
    text: `About ${area.est_available_spaces} of ${area.total_spaces} spaces open (estimate)`,
    cls: pct < 0.1 ? "low" : "ok",
  };
}

export function evaluateArea(area) {
  const { permitId, day, time } = parkingSelection(state.find);
  return evaluate(rulesFor(area.area_id), permitId, day, time);
}

// Drawn as SVG (not the ♡ text glyph) so it sits dead center and matches the directions button.
// Outline when not saved; CSS fills it when aria-pressed="true".
const HEART_ICON = `<svg class="icon" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false"><path d="M12 20.3s-7.6-4.6-9.2-9.4C1.7 7.6 3.9 4.5 7.2 4.5c2 0 3.6 1.1 4.8 2.8 1.2-1.7 2.8-2.8 4.8-2.8 3.3 0 5.5 3.1 4.4 6.4-1.6 4.8-9.2 9.4-9.2 9.4z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>`;
export const DIRECTIONS_ICON = `<svg class="icon" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false"><path d="M20.5 3.5 3.8 10.6c-.6.3-.6 1.2.1 1.4l6.6 1.5 1.5 6.6c.2.7 1.1.7 1.4.1z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>`;

export function heartHtml(area) {
  const saved = state.favoriteIds.has(area.area_id);
  const label = saved ? `Remove ${area.area_name} from favorites` : `Save ${area.area_name} to favorites`;
  return `<button type="button" class="heart" data-area-id="${area.area_id}"
              aria-pressed="${saved}" aria-label="${escapeHtml(label)}">${HEART_ICON}</button>`;
}

export function cardHtml(area, { showDirections = false, showOnMap = false } = {}) {
  const avail = availabilityText(area);
  const ev = evaluateArea(area);
  const directions = showDirections ? directionsUrl(area, "driving") : null;
  const appleDirections = showDirections ? appleDirectionsUrl(area, "driving") : null;
  return `
    <li class="card">
      <div class="card-body">
        <h3>${escapeHtml(area.area_name)}</h3>
        <p class="meta">${escapeHtml(area.operator)}${area.is_free ? " · Free" : ""}${Number.isFinite(area.distanceMeters) ? ` · <span class="distance">~${formatDistance(area.distanceMeters)} away</span>` : ""}</p>
        <p class="elig ${ev.kind}"><span aria-hidden="true">${ev.icon}</span> ${escapeHtml(ev.text)}</p>
        <p class="avail ${avail.cls}">${avail.text}</p>
        <div class="card-links">
          <a class="link" href="#area/${area.area_id}" aria-label="Rules &amp; details for ${escapeHtml(area.area_name)}">Rules &amp; details →</a>
          ${!area.is_sample_data ? `<a class="link" href="#car/${area.area_id}" aria-label="Park here: ${escapeHtml(area.area_name)}">Park here →</a>` : ""}
          ${showOnMap && Number.isInteger(area.source_feature_id) ? `<button type="button" class="link-button" data-map-area="${area.area_id}" aria-label="Show ${escapeHtml(area.area_name)} on map">Show on map</button>` : ""}
        </div>
        ${showDirections ? `<div class="favorite-directions">
          ${directions ? `<a class="secondary" href="${escapeHtml(directions)}" target="_blank" rel="noopener noreferrer" aria-label="Get Directions to ${escapeHtml(area.area_name)} in Google Maps (opens in a new tab)">Get Directions <span aria-hidden="true">↗</span></a>
          <a class="link directions-apple" href="${escapeHtml(appleDirections)}" target="_blank" rel="noopener noreferrer" aria-label="Get Directions to ${escapeHtml(area.area_name)} in Apple Maps (opens in a new tab)">Apple Maps ↗</a>
          <p class="hint">${area.is_sample_data ? "Sample location. " : ""}Driving directions in Google or Apple Maps · ${area.is_sample_data ? "Sample lot center" : entrancePoint(area) ? "Takes you to the lot entrance" : "Approximate section, not an entrance"}</p>` : `<p class="hint">Directions unavailable — this lot has no valid map location.</p>`}
        </div>` : ""}
      </div>
      ${heartHtml(area)}
    </li>`;
}
