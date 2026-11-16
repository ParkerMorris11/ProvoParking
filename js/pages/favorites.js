// Page: Favorites — areas saved with the heart (favorite_area).
// Kept deliberately simple, like saved places in Google/Apple Maps: one row per lot with the name,
// one short status line, a Directions button and the heart. Full rules live on the details page.
import { state } from "../state.js";
import { $, setStatus } from "../lib/dom.js";
import { escapeHtml, fmtDuration, directionsUrl, appleDirectionsUrl } from "../lib/format.js";
import { evaluateArea, heartHtml } from "../components/area-card.js";
import { formatDistance } from "../domain/area-list.js";
import { addFavorite, removeFavorite } from "../data/favorites.js";

// Short status words for the favorites row (the long eligibility sentence stays on the details page).
export function shortStatus(ev) {
  switch (ev.kind) {
    case "ok": return "Permit OK";
    case "limit": return ev.rule?.max_stay_minutes ? `${fmtDuration(ev.rule.max_stay_minutes)} limit` : "Time limit";
    case "no-permit": return "Not your permit";
    case "blocked": return "No parking now";
    case "pick": return "Pick a permit";
    default: return "Check rules";
  }
}

const ICONS = { ok: "✓", limit: "!", "no-permit": "✕", blocked: "✕", pick: "?", unknown: "?" };
const GO_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.8 21.2 12 12 21.2 2.8 12Z"/><path d="M9.5 14v-2.5h5M12.5 9l2 2.5-2 2.5"/></svg>`;

export function favoriteRowHtml(area) {
  const ev = evaluateArea(area);
  const name = escapeHtml(area.area_name);
  const details = [
    escapeHtml(area.operator ?? ""),
    area.is_free ? "Free" : "",
    Number.isFinite(area.distanceMeters) ? formatDistance(area.distanceMeters) : "",
    area.est_available_spaces != null ? `~${area.est_available_spaces} open` : "",
  ].filter(Boolean).join(" · ");
  const google = directionsUrl(area, "driving");
  const apple = appleDirectionsUrl(area, "driving");
  const go = google
    ? `<details class="fav-go">
        <summary class="fav-go-btn" aria-label="Directions to ${name}">${GO_ICON}<span>Go</span></summary>
        <div class="fav-go-menu">
          <a href="${escapeHtml(google)}" target="_blank" rel="noopener noreferrer" aria-label="Directions to ${name} in Google Maps (opens in a new tab)">Google Maps</a>
          <a href="${escapeHtml(apple)}" target="_blank" rel="noopener noreferrer" aria-label="Directions to ${name} in Apple Maps (opens in a new tab)">Apple Maps</a>
        </div>
      </details>`
    : "";
  return `
    <li class="fav-row">
      <a class="fav-main" href="#area/${area.area_id}" aria-label="${name}: ${escapeHtml(shortStatus(ev))}. Open rules and details">
        <span class="fav-pin ${ev.kind}" aria-hidden="true">P</span>
        <span class="fav-text">
          <span class="fav-name">${name}</span>
          <span class="fav-sub"><span class="fav-status ${ev.kind}"><span aria-hidden="true">${ICONS[ev.kind] ?? "?"}</span> ${escapeHtml(shortStatus(ev))}</span>${details ? ` · ${details}` : ""}</span>
        </span>
      </a>
      ${go}
      ${heartHtml(area)}
    </li>`;
}

export function renderFavorites() {
  const favs = state.areas.filter((a) => state.favoriteIds.has(a.area_id));
  $("fav-list").innerHTML = favs.map(favoriteRowHtml).join("");
  $("fav-empty").hidden = favs.length > 0;
  $("fav-count").textContent = favs.length;
}

// Only one Directions menu open at a time; a click anywhere else closes it.
if (typeof document !== "undefined" && document.addEventListener) {
  document.addEventListener("click", (e) => {
    for (const menu of document.querySelectorAll(".fav-go[open]")) {
      if (!menu.contains(e.target)) menu.open = false;
    }
  });
}
// The heart button appears on several pages, so the click handler lives here.
export async function toggleFavorite(areaId, button, { renderViews }) {
  const version = state.authVersion;
  button.disabled = true;
  const area = state.areas.find((a) => a.area_id === areaId);
  try {
    if (state.favoriteIds.has(areaId)) {
      await removeFavorite(areaId);
      if (version !== state.authVersion) return;
      state.favoriteIds.delete(areaId);
      setStatus(`Removed ${area.area_name} from favorites.`);
    } else {
      const row = await addFavorite(areaId);
      if (version !== state.authVersion) return;
      state.favoriteIds.add(row.area_id);
      setStatus(`Saved ${area.area_name} to favorites.`);
    }
    renderViews();
    document.querySelector(`#view-${state.currentView}:not([hidden]) .heart[data-area-id="${areaId}"]`)?.focus();
  } catch (err) {
    if (version !== state.authVersion) return;
    console.error(err);
    setStatus(`Could not update favorites: ${err.message}`, true);
    button.disabled = false;
  }
}
