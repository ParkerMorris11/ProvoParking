// Page: Favorites — areas saved with the heart (favorite_area).
// Kept deliberately simple, like saved places in Google/Apple Maps: one row per lot with its name
// (or the user's nickname for it), one short status line, a Go button and a ⋯ menu (Rename, Remove).
// Removing a favorite anywhere shows an Undo bar, so a mis-tap never loses a saved lot.
import { state } from "../state.js";
import { $, setStatus } from "../lib/dom.js";
import { escapeHtml, fmtDuration, directionsUrl, appleDirectionsUrl } from "../lib/format.js";
import { evaluateArea } from "../components/area-card.js";
import { formatDistance } from "../domain/area-list.js";
import { addFavorite, removeFavorite, renameFavorite, cleanNickname } from "../data/favorites.js";

const UNDO_MS = 6000;
let renamingId = null; // the favorite whose name is being edited, if any
let undo = null;       // { areaId, nickname, timer } for the most recent removal

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
const MORE_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>`;

const displayName = (area) => state.favoriteNames.get(area.area_id) || area.area_name;

function renameFormHtml(area) {
  const nickname = state.favoriteNames.get(area.area_id) ?? "";
  return `
    <li class="fav-row fav-renaming">
      <form class="fav-rename" data-area-id="${area.area_id}">
        <label class="fav-rename-label" for="fav-name-${area.area_id}">Name for ${escapeHtml(area.area_name)}</label>
        <input id="fav-name-${area.area_id}" name="nickname" type="text" maxlength="30" autocomplete="off"
               value="${escapeHtml(nickname)}" placeholder="e.g. Class, Work, Gym">
        <div class="fav-rename-actions">
          <button type="submit" class="primary">Save</button>
          <button type="button" class="secondary" data-fav-cancel>Cancel</button>
          ${nickname ? `<button type="button" class="link-button" data-fav-clear>Use lot name</button>` : ""}
        </div>
      </form>
    </li>`;
}

export function favoriteRowHtml(area) {
  if (renamingId === area.area_id) return renameFormHtml(area);
  const ev = evaluateArea(area);
  const nickname = state.favoriteNames.get(area.area_id);
  const name = escapeHtml(displayName(area));
  const details = [
    escapeHtml(area.operator ?? ""),
    area.is_free ? "Free" : "",
    Number.isFinite(area.distanceMeters) ? formatDistance(area.distanceMeters) : "",
    area.est_available_spaces != null ? `~${area.est_available_spaces} open` : "",
  ].filter(Boolean).join(" · ");
  const google = directionsUrl(area, "driving");
  const apple = appleDirectionsUrl(area, "driving");
  const go = google
    ? `<details class="fav-go fav-pop">
        <summary class="fav-go-btn" aria-label="Directions to ${name}">${GO_ICON}<span>Go</span></summary>
        <div class="fav-menu">
          <a href="${escapeHtml(google)}" target="_blank" rel="noopener noreferrer" aria-label="Directions to ${name} in Google Maps (opens in a new tab)">Google Maps</a>
          <a href="${escapeHtml(apple)}" target="_blank" rel="noopener noreferrer" aria-label="Directions to ${name} in Apple Maps (opens in a new tab)">Apple Maps</a>
        </div>
      </details>`
    : "";
  return `
    <li class="fav-row">
      <a class="fav-main" href="#area/${area.area_id}" aria-label="${name}${nickname ? ` (${escapeHtml(area.area_name)})` : ""}: ${escapeHtml(shortStatus(ev))}. Open rules and details">
        <span class="fav-pin" aria-hidden="true">♥</span>
        <span class="fav-text">
          <span class="fav-name">${name}</span>
          ${nickname ? `<span class="fav-lot">${escapeHtml(area.area_name)}</span>` : ""}
          <span class="fav-sub"><span class="fav-status ${ev.kind}"><span aria-hidden="true">${ICONS[ev.kind] ?? "?"}</span> ${escapeHtml(shortStatus(ev))}</span>${details ? ` · ${details}` : ""}</span>
        </span>
      </a>
      ${go}
      <details class="fav-more fav-pop">
        <summary class="fav-more-btn" data-area-id="${area.area_id}" aria-label="More options for ${name}">${MORE_ICON}</summary>
        <div class="fav-menu">
          <button type="button" data-fav-rename="${area.area_id}">${nickname ? "Rename" : "Add a name"}</button>
          <button type="button" class="danger" data-fav-remove="${area.area_id}">Remove from favorites</button>
        </div>
      </details>
    </li>`;
}

export function renderFavorites() {
  const favs = state.areas.filter((a) => state.favoriteIds.has(a.area_id));
  // A redraw while renaming keeps what was typed; the box is focused only when it first opens.
  const typing = renamingId != null ? document.getElementById(`fav-name-${renamingId}`) : null;
  const typed = typing?.value;
  $("fav-list").innerHTML = favs.map(favoriteRowHtml).join("");
  $("fav-empty").hidden = favs.length > 0;
  $("fav-count").textContent = favs.length;
  const input = renamingId != null ? document.getElementById(`fav-name-${renamingId}`) : null;
  if (input && typed != null) input.value = typed;
  else if (input) { input.focus(); input.select?.(); }
}

// ---------- Undo bar ----------
function hideUndo() {
  if (!undo) return;
  clearTimeout(undo.timer);
  undo = null;
  const bar = $("undo-bar");
  if (bar) bar.hidden = true;
}

export function showUndo(area, nickname, { renderViews }) {
  hideUndo();
  const bar = $("undo-bar");
  if (!bar) return;
  $("undo-text").textContent = `Removed ${nickname || area.area_name}`;
  bar.hidden = false;
  undo = { areaId: area.area_id, nickname, renderViews, timer: setTimeout(hideUndo, UNDO_MS) };
}

async function undoRemove() {
  if (!undo) return;
  const { areaId, nickname, renderViews } = undo;
  const version = state.authVersion;
  const area = state.areas.find((a) => a.area_id === areaId);
  hideUndo();
  try {
    const row = await addFavorite(areaId, nickname);
    if (version !== state.authVersion) return;
    state.favoriteIds.add(row.area_id);
    if (row.nickname) state.favoriteNames.set(row.area_id, row.nickname);
    setStatus(`Restored ${nickname || area?.area_name} to favorites.`);
    renderViews();
  } catch (err) {
    if (version !== state.authVersion) return;
    console.error(err);
    setStatus(`Could not restore the favorite: ${err.message}`, true);
  }
}

// ---------- Rename ----------
async function saveName(areaId, text, { renderViews }) {
  const version = state.authVersion;
  const area = state.areas.find((a) => a.area_id === areaId);
  try {
    const row = await renameFavorite(areaId, text);
    if (version !== state.authVersion) return;
    if (row.nickname) state.favoriteNames.set(areaId, row.nickname);
    else state.favoriteNames.delete(areaId);
    renamingId = null;
    setStatus(row.nickname ? `Named ${area.area_name} “${row.nickname}”.` : `${area.area_name} uses its lot name again.`);
    renderViews();
    document.querySelector(`#fav-list .fav-more-btn[data-area-id="${areaId}"]`)?.focus();
  } catch (err) {
    if (version !== state.authVersion) return;
    console.error(err);
    setStatus(`Could not save the name: ${err.message}`, true);
  }
}

export function initFavorites({ renderViews }) {
  document.addEventListener("click", (e) => {
    // Only one Go or ⋯ menu open at a time; a click anywhere else closes them.
    for (const menu of document.querySelectorAll(".fav-pop[open]")) {
      if (!menu.contains(e.target)) menu.open = false;
    }
    const rename = e.target.closest("[data-fav-rename]");
    if (rename) { renamingId = Number(rename.dataset.favRename); return renderFavorites(); }
    const remove = e.target.closest("[data-fav-remove]");
    if (remove) return toggleFavorite(Number(remove.dataset.favRemove), remove, { renderViews });
    const cancel = e.target.closest("[data-fav-cancel]");
    if (cancel) {
      const id = renamingId; renamingId = null; renderFavorites();
      return document.querySelector(`#fav-list .fav-more-btn[data-area-id="${id}"]`)?.focus();
    }
    const clear = e.target.closest("[data-fav-clear]");
    if (clear) return saveName(Number(clear.closest("form").dataset.areaId), "", { renderViews });
    if (e.target.closest("#undo-btn")) return undoRemove();
  });
  document.addEventListener("submit", (e) => {
    const form = e.target.closest?.(".fav-rename");
    if (!form) return;
    e.preventDefault();
    saveName(Number(form.dataset.areaId), form.elements.nickname.value, { renderViews });
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (renamingId != null && e.target.closest?.(".fav-rename")) { renamingId = null; renderFavorites(); return; }
    const open = document.querySelector(".fav-pop[open]");
    if (open) { open.open = false; open.querySelector("summary")?.focus(); }
  });
}

// The heart button appears on several pages, so the click handler lives here.
// The ⋯ menu's "Remove from favorites" uses it too. Every removal offers Undo.
export async function toggleFavorite(areaId, button, { renderViews }) {
  const version = state.authVersion;
  button.disabled = true;
  const area = state.areas.find((a) => a.area_id === areaId);
  try {
    if (state.favoriteIds.has(areaId)) {
      const nickname = state.favoriteNames.get(areaId) ?? null;
      await removeFavorite(areaId);
      if (version !== state.authVersion) return;
      state.favoriteIds.delete(areaId);
      state.favoriteNames.delete(areaId);
      if (renamingId === areaId) renamingId = null;
      setStatus(`Removed ${area.area_name} from favorites.`);
      showUndo(area, nickname, { renderViews });
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
