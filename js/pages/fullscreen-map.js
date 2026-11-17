import { searchMapCatalog } from "../domain/map-search.js";
import { cityFacilityNames } from "./city-layer.js";
import { findExactLot } from "../domain/lot-search.js";
// The map stays mounted while existing screens move through one floating drawer.
// Layout follows the familiar phone-maps pattern: a frosted bottom sheet whose top row is the search bar
// and account button, a Suggestions card (parked car, favorites, nearby legal lots), a row of round
// shortcuts to the other screens, a status tile in the top-left corner (permit + time + matching count)
// and small round map controls stacked in glass pills on the right.
// Desktop uses the same sheet as a floating left sidebar; phones drag it between peek / half / full.
// Moving the original nodes preserves their ids, form values and event listeners.
import { state, rulesFor } from "../state.js";
import { DAY_NAMES, escapeHtml, fmtTime } from "../lib/format.js";
import { parkingSelection, eligibleAreas } from "../domain/parking-results.js";
import { evaluate } from "../domain/eligibility.js";
import { parkingNow } from "../lib/server-clock.js";
import { initMap, refreshMap, toggleMapStyle, zoomMap } from "./map.js";

const STATES = ["peek", "half", "full"];
const DESKTOP = "(min-width: 601px)";
const STYLESHEET = "css/fullscreen-map.css";

let view, sheet, handle, head, body, chip, suggestions, routeBar, ready = false, applyPermit = () => false;

const isDesktop = () => Boolean(window.matchMedia?.(DESKTOP).matches);

function el(tag, attrs = {}, html = "") {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  if (html) node.innerHTML = html;
  return node;
}

// ---- Account menu (the round profile button beside the search bar) --------------------------------
// Like the profile button in other map apps, it holds the less-used things: sign up / log in (first, and
// styled as the main action for guests), the quick guide, the Guide & account page, and the admin dashboard
// (admin.html has its own admin sign-in, so the link alone grants nothing). The map rail stays map-only.
function buildAccountMenu(button) {
  const menu = el("div", { class: "map-settings-menu", id: "map-settings-menu", role: "group", "aria-label": "Account and settings" },
    '<p class="map-settings-who" id="map-settings-who"></p>' +
    '<button type="button" class="map-settings-item" id="map-settings-account"></button>' +
    '<button type="button" class="map-settings-item" data-help-open data-help-return="map-account" aria-haspopup="dialog">Quick guide</button>' +
    '<a class="map-settings-item" href="#help">Help &amp; account page</a>' +
    '<a class="map-settings-item" href="admin.html">Admin dashboard <span class="map-settings-note">team only</span></a>');
  menu.hidden = true;
  button.setAttribute("aria-expanded", "false");
  button.setAttribute("aria-controls", "map-settings-menu");
  // The menu lives outside the sheet (which clips its content), placed next to the button: above it when the
  // button is in the lower half of the screen (phone sheet lowered), otherwise below it.
  const place = () => {
    const r = button.getBoundingClientRect();
    const below = r.top < window.innerHeight / 2;
    menu.style.left = `${Math.max(8, Math.min(r.right - 248, window.innerWidth - 256))}px`;
    menu.style.top = below ? `${r.bottom + 8}px` : "auto";
    menu.style.bottom = below ? "auto" : `${window.innerHeight - r.top + 8}px`;
  };
  const setOpen = (open, { focusButton = false } = {}) => {
    menu.hidden = !open;
    button.setAttribute("aria-expanded", String(open));
    if (open) {
      // Account state comes from the existing account bar, so it is always the same as the Guide page.
      const name = document.getElementById("account-name")?.textContent.trim();
      const action = document.getElementById("account-action")?.textContent.trim() || "Sign up";
      menu.querySelector("#map-settings-who").textContent = name || "Browsing as guest";
      const accountItem = menu.querySelector("#map-settings-account");
      accountItem.textContent = action === "Sign up" ? "Sign up or log in" : action;
      accountItem.classList.toggle("primary-item", !state.user);
      place();
      accountItem.focus();
    } else if (focusButton) button.focus();
  };
  button.addEventListener("click", () => setOpen(menu.hidden));
  menu.addEventListener("click", (e) => {
    const item = e.target.closest(".map-settings-item");
    if (!item) return;
    if (item.id === "map-settings-account") document.getElementById("account-action")?.click();
    setOpen(false);
  });
  menu.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.stopPropagation(); setOpen(false, { focusButton: true }); } });
  document.addEventListener("click", (e) => { if (!menu.hidden && !menu.contains(e.target) && !button.contains(e.target)) setOpen(false); });
  window.addEventListener("resize", () => { if (!menu.hidden) place(); });
  return menu;
}

// ---- Sheet position -------------------------------------------------------------------------
const HANDLE_LABELS = { peek: "Show suggestions", half: "Expand the parking sheet", full: "Lower the parking sheet" };
export function setSheet(next) {
  if (!sheet || !STATES.includes(next)) return;
  sheet.dataset.state = next;
  sheet.style.removeProperty("--drag-y");
  const open = next !== "peek";
  document.querySelector(".fs-shell")?.classList.toggle("sidebar-open", open);
  document.querySelectorAll("[data-sidebar-toggle]").forEach(button => button.setAttribute("aria-expanded", String(open)));
  handle.setAttribute("aria-expanded", String(open));
  handle.setAttribute("aria-label", HANDLE_LABELS[next]);
  // Collapsed content stays out of the keyboard focus order on every screen size.
  body.toggleAttribute("inert", !open);
}

// ---- Chip text and sheet title ---------------------------------------------------------------
// Re-read from the app's own state whenever the Areas screen re-renders (see observeRenders).
export function chipText(find, permits) {
  const selection = parkingSelection(find);
  const permit = permits.find(p => p.permit_id === find.permitId) || null;
  const valid = Number.isInteger(selection.day) && selection.day >= 0 && selection.time;
  const when = selection.live ? "Now" : valid ? `${DAY_NAMES[selection.day].slice(0, 3)} ${fmtTime(selection.time)}` : "Choose time";
  const spoken = selection.live ? "right now" : valid ? `${DAY_NAMES[selection.day]} at ${fmtTime(selection.time)}` : "no time chosen";
  const code = permit ? permit.permit_code : "P";
  const text = permit ? `${code} · ${when}` : `Choose permit · ${when}`;
  return {
    code,
    text,
    // Accessible name must include every visible word, including the chip-code letter
    // (it stays on screen even with aria-hidden, which Lighthouse still flags).
    label: `${code} ${text}. ${permit ? permit.permit_name : "No permit chosen"}, ${spoken}. Change permit or time`,
  };
}

/**
 * The drawer's one-line title on the map screen. Never a bare "0": with no permit it asks for one,
 * and with a permit but nothing matching it says why (BYU lists no weekend permit rules, so on
 * Saturday and Sunday nothing is confirmed).
 */
export function sheetTitle(count, hasPermit, selection = {}) {
  if (!count && !hasPermit) return "Choose your permit to see where you can park";
  if (!count) {
    const weekend = selection.day === 0 || selection.day === 6;
    return weekend ? "Weekend: no BYU permit rules listed. Check signs" : "No lots match your permit right now";
  }
  const noun = count === 1 ? "area matches" : "areas match";
  return `${count} ${noun} ${hasPermit ? "your permit" : "for everyone"}`;
}

// Second line of the status tile, e.g. "33 areas open". Never a bare "0" (same rule as sheetTitle).
export function matchText(count, hasPermit = true, selection = {}) {
  if (!count && !hasPermit) return "Choose a permit";
  if (!count) return selection.day === 0 || selection.day === 6 ? "Weekend: check signs" : "No lots match now";
  return `${count} matching ${count === 1 ? "section" : "sections"}`;
}

function updateChrome() {
  if (!chip) return;
  try {
    const info = chipText(state.find, state.permits || []);
    const selection = parkingSelection(state.find);
    const count = eligibleAreas(state.areas || [], state.rulesByArea || new Map(), selection).length;
    chip.querySelector(".chip-code").textContent = info.code;
    chip.querySelector(".chip-text").textContent = info.text;
    const hasPermit = Boolean(state.find.permitId);
    chip.querySelector(".chip-sub").textContent = matchText(count, hasPermit, selection);
    chip.querySelector(".chip-hint").textContent = `. ${info.label.slice(`${info.code} ${info.text}. `.length)}`;
    const home = state.currentView === "areas";
    routeBar.hidden = home;
    suggestions.hidden = !home;
    if (home) renderSuggestions(selection, sheetTitle(count, hasPermit, selection));
  } catch (err) {
    console.error("[fullscreen-map] could not update the map chrome", err);
  }
}

// ---- Suggestions card -------------------------------------------------------------------------
// Up to five rows: the parked car (when a timer runs), up to two favorites, then the first legal lots
// in the same order as the list below (which already sorts by distance when location or a building is set).
const ICONS = {
  car: '<path d="m5 11 1.6-4.3A2 2 0 0 1 8.5 5.4h7a2 2 0 0 1 1.9 1.3L19 11m-14 0h14m-14 0v6h14v-6M7.5 17v2m9-2v2M8 14h.01M16 14h.01" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  heart: '<path d="M12 20s-7-4.3-7-9.6A4 4 0 0 1 12 8a4 4 0 0 1 7 2.4C19 15.7 12 20 12 20Z" fill="currentColor"/>',
  lot: '<path d="M9.5 17V7h3.2a3 3 0 0 1 0 6H9.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>',
};
const CHEVRON = '<svg class="sg-chevron" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m9.5 6 6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function timeLeft(session) {
  const ms = new Date(session.leave_by).getTime() - parkingNow();
  if (!Number.isFinite(ms)) return "Timer running";
  if (ms <= 0) return "Time is up";
  const minutes = Math.ceil(ms / 60000), h = Math.floor(minutes / 60), m = minutes % 60;
  return `${h ? `${h} hr ` : ""}${m} min left`;
}

const KIND_TEXT = { ok: "Allowed now", limit: "Allowed, with limits", blocked: "Not allowed now", no: "Not allowed now" };
function ruleText(areaId, selection) {
  const kind = evaluate(rulesFor(areaId), selection.permitId, selection.day, selection.time).kind;
  return KIND_TEXT[kind] || "Check the rules";
}

export function suggestionRows({ session, favorites, nearby, areaById, describe }) {
  const rows = [];
  if (session) {
    const area = areaById.get(session.area_id);
    rows.push({ icon: "car", tone: "car", href: "#car", title: "Parked car", sub: [area?.area_name, timeLeft(session)].filter(Boolean).join(" · ") });
  }
  for (const fav of favorites.slice(0, 2)) {
    const area = areaById.get(fav.id);
    if (area) rows.push({ icon: "heart", tone: "fav", href: `#area/${area.area_id}`, title: fav.nickname || area.area_name, sub: `Favorite · ${describe(area.area_id)}`, id: area.area_id });
  }
  const shown = new Set(rows.map(r => r.id));
  for (const id of nearby) {
    if (rows.length >= 5 || rows.filter(r => r.icon === "lot").length >= 3) break;
    const area = areaById.get(id);
    if (!area || shown.has(id)) continue;
    shown.add(id);
    rows.push({ icon: "lot", tone: "lot", href: `#area/${id}`, title: area.area_name, sub: describe(id), id });
  }
  return rows;
}

function renderSuggestions(selection, emptyText) {
  const areaById = new Map((state.areas || []).map(a => [a.area_id, a]));
  const favorites = [...(state.favoriteIds || [])].map(id => ({ id, nickname: state.favoriteNames?.get(id) || "" }));
  const nearby = [...document.querySelectorAll('#area-list a[href^="#area/"]')].map(a => Number(a.getAttribute("href").split("/")[1]));
  const rows = suggestionRows({ session: state.activeSession, favorites, nearby, areaById, describe: id => ruleText(id, selection) });
  const html = rows.length ? rows.map(r =>
    `<li><a class="sg-row" href="${r.href}"><span class="sg-icon sg-${r.tone}" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false">${ICONS[r.icon]}</svg></span>` +
    `<span class="sg-text"><span class="sg-title">${escapeHtml(r.title)}</span><span class="sg-sub">${escapeHtml(r.sub)}</span></span>${CHEVRON}</a></li>`).join("")
    : `<li class="sg-empty">${escapeHtml(emptyText)}</li>`;
  const list = suggestions.querySelector(".sg-list");
  if (list.dataset.html !== html) { list.innerHTML = html; list.dataset.html = html; }
}

// areas.js rewrites #areas-summary and #areas-count on every render (permit change, clock tick,
// search, favorites). Watching them keeps the chip and title in step without editing areas.js.
function observeRenders() {
  const watch = ["areas-summary", "areas-count", "area-list"].map(id => document.getElementById(id)).filter(Boolean);
  const observer = new MutationObserver(updateChrome);
  for (const node of watch) observer.observe(node, { childList: true, characterData: true, subtree: true });
}

// ---- Dragging --------------------------------------------------------------------------------
function initDrag() {
  let startY = null, startOffset = 0, moved = false, height = 0;
  const offsetFor = (s) => {
    const peek = head.offsetTop + head.offsetHeight;
    return s === "full" ? 0 : s === "half" ? height * 0.45 : height - peek;
  };
  const grab = (e) => {
    if (isDesktop() || e.button > 0 || (e.currentTarget === head && e.target.closest("input, button, a"))) return;
    height = sheet.offsetHeight;
    startY = e.clientY;
    startOffset = offsetFor(sheet.dataset.state);
    moved = false;
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  handle.addEventListener("pointerdown", grab);
  head.addEventListener("pointerdown", grab);
  const drag = (e) => {
    if (startY == null) return;
    const dy = e.clientY - startY;
    if (Math.abs(dy) > 6) moved = true;
    if (!moved) return;
    const y = Math.min(Math.max(startOffset + dy, 0), offsetFor("peek"));
    sheet.classList.add("dragging");
    sheet.style.setProperty("--drag-y", `${y}px`);
  };
  handle.addEventListener("pointermove", drag);
  head.addEventListener("pointermove", drag);
  const end = (e) => {
    if (startY == null) return;
    const dy = e.clientY - startY;
    startY = null;
    sheet.classList.remove("dragging");
    if (!moved) return; // a tap: the click listener handles it
    const y = Math.min(Math.max(startOffset + dy, 0), offsetFor("peek"));
    const nearest = STATES.reduce((best, s) => (Math.abs(offsetFor(s) - y) < Math.abs(offsetFor(best) - y) ? s : best), "peek");
    setSheet(nearest);
    const node = e.currentTarget;
    node.dataset.dragged = "1"; // swallow the click that follows a drag
    if (node === head) setTimeout(() => delete head.dataset.dragged, 0);
  };
  for (const node of [handle, head]) { node.addEventListener("pointerup", end); node.addEventListener("pointercancel", end); }
  head.addEventListener("click", (e) => { if (head.dataset.dragged) { e.preventDefault(); e.stopPropagation(); } }, true);
  handle.addEventListener("click", () => {
    if (handle.dataset.dragged) { delete handle.dataset.dragged; return; }
    if (isDesktop()) { setSheet("peek"); document.getElementById("sidebar-toggle")?.focus(); return; }
    setSheet({ peek: "half", half: "full", full: "peek" }[sheet.dataset.state] || "half");
  });
}

// ---- Floating search bar -----------------------------------------------------------------------
// A compact front door to the plain-language / voice search on Find (#nl-form). It hands the text to
// that form and opens Find so the person can review the filled-in fields. It never searches for them.
const SEARCH_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="m16 16 4.5 4.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
const MIC_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="9" y="3" width="6" height="11" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
const GO_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 12h14M13 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

export function resetMapSearch() {
  const input = document.getElementById("map-search-text"), status = document.getElementById("map-search-status");
  if (input) input.value = "";
  const results = document.getElementById("map-search-results");
  if (results) { results.replaceChildren(); results.hidden = true; }
  if (status) {
    status.textContent = "";
    status.classList.remove("warn");
    status.hidden = true;
  }
}

// Phones get a placeholder short enough to show whole; laptops keep the longer hint. The label says it all either way.
const PHONE = "(max-width: 600px)";
const NL_PLACEHOLDER_PHONE = "e.g. Class at 3 pm at the JKB";
const searchPlaceholder = () => window.matchMedia?.("(max-width: 359px)").matches ? "Search"
  : window.matchMedia?.(PHONE).matches ? "Search parking" : "Search parking or describe your trip";

function buildSearch() {
  const nlForm = document.getElementById("nl-form"), nlText = document.getElementById("nl-text");
  const nlMic = document.getElementById("nl-mic"), nlStatus = document.getElementById("nl-status");
  if (!nlForm || !nlText) return null;
  const bar = el("form", { class: "map-search", id: "map-search", role: "search", "aria-label": "Search parking and campus buildings" },
    `<span class="map-search-icon">${SEARCH_ICON}</span>` +
    `<input type="text" id="map-search-text" maxlength="500" autocomplete="off" enterkeyhint="search" aria-label="Search lots, buildings, or describe your trip" aria-describedby="map-search-status" placeholder="${searchPlaceholder()}">` +
    `<button type="button" id="map-search-mic" class="map-search-btn map-search-mic" aria-pressed="false" aria-label="Speak your trip" title="Speak your trip" hidden>${MIC_ICON}</button>` +
    `<button type="submit" class="map-search-btn map-search-go" aria-label="Search" title="Search">${GO_ICON}</button>`);
  // Round account button beside the search bar: initials when signed in, a person icon for guests.
  const account = el("button", { type: "button", class: "map-account", id: "map-account", "aria-label": "Account and settings: sign up or log in" },
    '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="8" r="4" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M4 21a8 8 0 0 1 16 0" fill="none" stroke="currentColor" stroke-width="1.8"/></svg><span class="map-account-initials"></span>');
  const syncAccount = () => {
    const name = (state.user?.displayName || state.user?.email || "").trim();
    const initials = name.split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join("");
    account.classList.toggle("has-initials", Boolean(state.user && initials));
    account.querySelector(".map-account-initials").textContent = state.user ? initials : "";
    // The accessible name starts with the visible initials (Lighthouse "label-content-name-mismatch").
    account.setAttribute("aria-label", state.user ? `${initials ? `${initials}, ` : ""}account and settings${name ? ` for ${name}` : ""}` : "Account and settings: sign up or log in");
    account.title = state.user ? "Account and settings" : "Sign up or log in";
  };
  const accountName = document.getElementById("account-name");
  if (accountName) new MutationObserver(syncAccount).observe(accountName, { childList: true, characterData: true, subtree: true });
  syncAccount();
  const status = el("p", { class: "map-search-status", id: "map-search-status", role: "status", "aria-live": "polite" });
  const input = bar.querySelector("#map-search-text"), mic = bar.querySelector("#map-search-mic");
  for (const query of [PHONE, "(max-width: 359px)"]) window.matchMedia?.(query).addEventListener?.("change", () => { input.placeholder = searchPlaceholder(); });
  const results = el("div", { class: "map-search-results", id: "map-search-results", "aria-label": "Search suggestions", hidden: "" });
  const clearResults = () => { results.replaceChildren(); results.hidden = true; };
  const selectResult = (result) => {
    clearResults(); input.value = result.title; status.hidden = true;
    if (result.type === "lot") { location.hash = `#area/${result.id}`; return; }
    if (result.type === "city") {
      // The city list's own "Show on map" control turns the layer on, flies there and opens the card.
      if (!isDesktop()) setSheet("peek");
      document.querySelector(`[data-city-index="${result.id}"]`)?.click();
      return;
    }
    setSheet("half");
    const version = state.authVersion;
    const chooseDestination = () => {
      if (version !== state.authVersion) return;
      const select = document.getElementById("find-destination");
      if (select) select.value = String(result.id);
    };
    if (location.hash === "#find") chooseDestination();
    else { window.addEventListener("hashchange", chooseDestination, { once: true }); location.hash = "#find"; }
  };
  const suggest = () => {
    clearResults();
    const matches = searchMapCatalog(input.value, { areas: state.areas, destinations: state.destinations, facilities: cityFacilityNames() });
    for (const result of matches) {
      const button = document.createElement("button");
      button.type = "button"; button.className = "map-search-result";
      const title = document.createElement("strong"); title.textContent = result.title;
      const subtitle = document.createElement("span"); subtitle.textContent = result.subtitle;
      button.append(title, subtitle); button.addEventListener("click", () => selectResult(result));
      results.append(button);
    }
    results.hidden = matches.length === 0;
  };
  input.addEventListener("input", suggest);
  document.addEventListener("pointerdown", e => {
    if (!bar.contains(e.target) && !results.contains(e.target)) clearResults();
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape") clearResults();
    if (e.key === "ArrowDown" && !results.hidden) { e.preventDefault(); results.querySelector("button")?.focus(); }
  });
  results.addEventListener("keydown", e => { if (e.key === "Escape") { clearResults(); input.focus(); } });
  // Like other map apps, starting a search raises the sheet so suggestions and results have room.
  input.addEventListener("focus", () => { if (!isDesktop() && sheet?.dataset.state === "peek") setSheet("half"); if (input.value.trim()) suggest(); });

  bar.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) { status.hidden = false; status.textContent = "Type or say something like “class at 3 pm at the JKB”."; input.focus(); return; }
    clearResults();
    const exactLots = findExactLot(text, state.areas || []);
    if (exactLots.length === 1) {
      status.textContent = "";
      status.hidden = true;
      nlStatus.textContent = "";
      location.hash = `#area/${exactLots[0].area_id}`;
      return;
    }
    if (exactLots.length > 1) {
      const filter = document.getElementById("all-lots-search");
      filter.value = exactLots[0].lot_code;
      const version = state.authVersion;
      const applyFilter = () => {
        if (version !== state.authVersion) return;
        filter.value = exactLots[0].lot_code;
        filter.dispatchEvent(new Event("input", { bubbles: true }));
        setSheet("half");
      };
      if (location.hash === "#lots") applyFilter();
      else { window.addEventListener("hashchange", applyFilter, { once: true }); location.hash = "#lots"; }
      setSheet("half");
      status.textContent = `Choose a section of lot ${exactLots[0].lot_code}.`;
      status.hidden = false;
      return;
    }
    const matches = searchMapCatalog(text, { areas: state.areas, destinations: state.destinations, facilities: cityFacilityNames() });
    const exactDestination = matches.find(item => item.type === "destination" && (item.title.toLowerCase() === text.toLowerCase() || state.destinations.some(d => d.destination_id === item.id && String(d.building_code).toLowerCase() === text.toLowerCase())));
    if (exactDestination) { selectResult(exactDestination); return; }
    if (matches.length === 1) { selectResult(matches[0]); return; }
    if (matches.length > 1) {
      setSheet("half"); suggest();
      status.textContent = "Choose a matching location below.";
      status.hidden = false;
      return;
    }
    setSheet("half");
    nlText.value = text;
    const version = state.authVersion;
    const send = () => {
      if (version !== state.authVersion) return;
      if (nlForm.requestSubmit) nlForm.requestSubmit();
      else nlForm.dispatchEvent(new Event("submit", { cancelable: true }));
    };
    // Open Find first (it redraws its fields), then let the existing form read the text.
    if (location.hash === "#find") send(); else { window.addEventListener("hashchange", send, { once: true }); location.hash = "#find"; }
  });

  // Mirror the microphone and the status line of the Find form, so the one speech engine is shared.
  if (nlMic) {
    const syncMic = () => {
      mic.hidden = nlMic.hidden;
      mic.setAttribute("aria-pressed", nlMic.getAttribute("aria-pressed") || "false");
      mic.setAttribute("aria-label", nlMic.getAttribute("aria-label") || "Speak your trip");
    };
    new MutationObserver(syncMic).observe(nlMic, { attributes: true });
    mic.addEventListener("click", () => nlMic.click());
    syncMic();
  }
  if (nlStatus) {
    const syncStatus = () => {
      const text = nlStatus.textContent.trim();
      status.textContent = text;
      status.classList.toggle("warn", nlStatus.classList.contains("warn"));
      if (text.includes("Check the fields")) status.insertAdjacentHTML("beforeend", ` <a href="#find">Review</a>`);
      status.hidden = !text;
    };
    new MutationObserver(syncStatus).observe(nlStatus, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ["class"] });
    status.hidden = true;
  }
  return { bar, status, account, results };
}

// ---- Permit popover (the permit chip) --------------------------------------------------------------
// Tapping the chip opens a small list of permits; choosing one re-filters lots on the map and in the list
// at once. Without JavaScript the chip is still a plain link to Find.
function buildPermitPopover() {
  const pop = el("div", { class: "permit-pop", id: "permit-pop", role: "dialog", "aria-label": "Choose your permit", hidden: "" },
    `<label for="chip-permit">Your permit</label><select id="chip-permit"></select>` +
    `<a class="permit-pop-more" href="#find">Change time or building</a>`);
  const select = pop.querySelector("select");
  const fill = () => {
    select.innerHTML = `<option value="">Choose a permit…</option>` + (state.permits || []).map(p =>
      `<option value="${p.permit_id}">${escapeHtml(p.permit_code)} — ${escapeHtml(p.permit_name)}</option>`).join("");
    select.value = state.find.permitId ?? "";
  };
  const setOpen = (open) => {
    if (open) fill();
    pop.hidden = !open;
    chip.setAttribute("aria-expanded", String(open));
  };
  chip.setAttribute("aria-haspopup", "dialog");
  chip.setAttribute("aria-expanded", "false");
  chip.setAttribute("aria-controls", "permit-pop");
  chip.addEventListener("click", (e) => { e.preventDefault(); setOpen(pop.hidden); if (!pop.hidden) select.focus(); });
  select.addEventListener("change", () => { if (applyPermit(select.value)) setOpen(false); chip.focus(); });
  pop.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setOpen(false); chip.focus(); } });
  document.addEventListener("click", (e) => { if (!pop.hidden && !e.target.closest("#permit-pop, #permit-chip")) setOpen(false); });
  pop.querySelector(".permit-pop-more").addEventListener("click", () => setOpen(false));
  return pop;
}

// ---- Building the layout ----------------------------------------------------------------------
const CLOSE_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M7 7l10 10M17 7 7 17" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>';
const LAYERS_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>';

function build() {
  view = document.getElementById("view-areas");
  const stage = view?.querySelector(".map-stage");
  const results = view?.querySelector(".parking-results");
  const mapEl = document.getElementById("parking-map");
  const locate = document.getElementById("locate-me");
  if (!view || !stage || !results || !mapEl || !locate) throw new Error("Areas screen markup not found");

  const mapWrap = el("div", { class: "fs-map" });

  // Top-left status tile (like a weather tile): permit code + time, and how many areas are open.
  // Its accessible name is its visible text plus a hidden hint, so spoken and visible words always match.
  chip = el("a", { href: "#find", class: "permit-chip", id: "permit-chip" },
    `<span class="chip-code">P</span> <span class="chip-lines"><span class="chip-text">Choose permit</span> <span class="chip-sub"></span></span><span class="visually-hidden chip-hint">. Change permit or time</span>` +
    `<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M5 8l5 5 5-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`);
  const tile = el("div", { class: "map-tile" });
  tile.append(chip, buildPermitPopover());

  // Right side: one glass pill of map-only controls (style, 2D/3D, location, zoom on laptops, dark mode).
  // Account, help and settings live behind the profile button beside the search bar.
  locate.classList.add("map-fab");
  locate.setAttribute("aria-label", "Use my location");
  locate.title = "Use my location";
  const style = el("button", { type: "button", id: "map-style", "aria-pressed": "false", "aria-label": "Switch to satellite with labels", title: "Switch to satellite with labels" }, LAYERS_ICON);
  style.addEventListener("click", () => void toggleMapStyle());
  const mapPill = el("div", { class: "map-controls", role: "group", "aria-label": "Map controls" });
  mapPill.append(style);
  // 2D / 3D is one round button: map.js shows only the view you can switch to and moves focus.
  const modeSwitch = stage.querySelector(".map-mode");
  if (modeSwitch) mapPill.append(modeSwitch);
  mapPill.append(locate);
  // Zoom icons are SVGs (not "+"/"−" text) so every button in the rail has the same icon size and weight.
  for (const [id, label, delta, path] of [["map-zoom-in", "Zoom in", 1, "M12 5v14M5 12h14"], ["map-zoom-out", "Zoom out", -1, "M5 12h14"]]) {
    const zoom = el("button", { type: "button", id, class: "map-zoom", "aria-label": label, title: label }, `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${path}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`);
    zoom.addEventListener("click", () => zoomMap(delta));
    mapPill.append(zoom);
  }
  // Dark mode lives in the rail too. js/theme.js handles the click (delegated on .theme-toggle) and saves the choice.
  const darkNow = document.documentElement.getAttribute("data-theme-active") === "dark";
  const theme = el("button", { type: "button", class: "theme-toggle", id: "map-theme", "aria-label": "Dark mode", "aria-pressed": darkNow ? "true" : "false", title: darkNow ? "Switch to light mode" : "Switch to dark mode" },
    '<svg class="icon-moon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>' +
    '<svg class="icon-sun" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>');
  mapPill.append(theme);
  const rail = el("div", { class: "map-rail" });
  rail.append(mapPill);
  stage.append(tile, rail);
  mapWrap.append(stage);

  // The sheet: grabber, then the search row (always visible), then everything else.
  const search = buildSearch();
  sheet = el("div", { class: "home-sheet", id: "home-sheet", "data-state": "peek" });
  handle = el("button", { type: "button", class: "sheet-handle", id: "sheet-handle", "aria-expanded": "false", "aria-controls": "sheet-body", "aria-label": HANDLE_LABELS.peek },
    `<span class="sheet-grip" aria-hidden="true"></span>`);
  head = el("div", { class: "sheet-head" });
  const searchRow = el("div", { class: "sheet-search-row" });
  if (search) { searchRow.append(search.bar, search.account); head.append(searchRow, search.status, search.results); }
  body = el("div", { class: "sheet-body", id: "sheet-body", role: "region", "aria-label": "Parking list" });

  // Fine print: the long notes fold into one line with an (i) button. Same text, same ids.
  const fine = el("details", { class: "fine-print" },
    `<summary><span>Always check posted signs.</span><span class="info-i" aria-hidden="true">i</span><span class="visually-hidden">More about this information</span></summary>`);
  const fineBody = el("div", { class: "fine-print-body" });
  const notes = [
    results.querySelector(".results-note"),
    document.getElementById("map-note"),
    results.querySelector(".location-privacy"),
    [...results.querySelectorAll(".nearby-panel > .nearby-note")].find(n => !n.id),
  ].filter(Boolean);
  fineBody.append(...notes);
  const footerNote = document.querySelector(".site-footer .sample-note");
  if (footerNote) fineBody.append(el("p", { class: "map-note" }, footerNote.innerHTML));
  fine.append(fineBody);

  const toolbar = view.querySelector(".map-toolbar");
  const toolbarStatus = document.getElementById("location-toolbar-status");
  const mapKey = view.querySelector(".map-key");
  const cityLots = view.querySelector(".city-lots");
  const heading = view.querySelector(".results-heading");
  toolbar?.classList.add("fs-tools");

  // The Areas screen keeps its own content (nearby, search, sort, cards); it just moves into the sheet.
  const areasContent = [results];
  if (heading) results.querySelector(".nearby-panel")?.after(heading);
  areasContent.push(...[toolbar, toolbarStatus, mapKey, cityLots, fine].filter(Boolean));
  view.querySelector(".parking-workspace")?.remove();
  view.append(...areasContent);

  // Suggestions card (home only).
  suggestions = el("section", { class: "sg-card", id: "sheet-suggestions", "aria-labelledby": "sg-heading" },
    `<h2 class="sheet-section-title" id="sg-heading">Suggestions</h2><ul class="sg-list"></ul>`);

  // Round shortcuts to the other screens (the original tab buttons, restyled). My Car joins them.
  const nav = document.getElementById("app-nav");
  const carTab = el("button", { type: "button", class: "tab", "data-view": "car" }, '<svg class="tab-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m4 10 2-5h12l2 5v8H4v-8Zm0 0h16M7 18v3m10-3v3M7 14h2m6 0h2" stroke-linecap="round" stroke-linejoin="round"/></svg><span class="tab-label">My Car</span>');
  document.getElementById("tab-list").append(carTab);
  const navTitle = el("h2", { class: "sheet-section-title", id: "nav-heading" }, "Browse");
  nav.setAttribute("aria-labelledby", "nav-heading");
  nav.prepend(navTitle);

  // Other screens get a bar with a round close button that returns to the map home.
  // (Each screen's own h2 is its title, so the bar only holds the button.)
  routeBar = el("div", { class: "route-bar", hidden: "" });
  const close = el("a", { href: "#areas", class: "route-close", "aria-label": "Close and go back to the map" }, CLOSE_ICON);
  routeBar.append(close);

  const accountBar = document.querySelector(".account-bar");
  const accountSection = el("section", { class: "drawer-account", "aria-label": "Your account" });
  accountSection.append(accountBar);
  document.getElementById("view-help").prepend(accountSection);
  body.append(routeBar, suggestions, nav, document.getElementById("status"));
  for (const name of ["find", "areas", "lots", "area", "favorites", "help"]) body.append(document.getElementById(`view-${name}`));
  sheet.append(handle, head, body);

  const shell = el("div", { class: "fs-shell fs-home" });
  // Laptops: the sidebar toggle sits inside the search row (left of the search bar), not as its own circle.
  const toggle = el("button", { type: "button", id: "sidebar-toggle", class: "sidebar-toggle", "data-sidebar-toggle": "", "aria-expanded": "false", "aria-controls": "sheet-body", "aria-label": "Show or hide the parking sidebar", title: "Show or hide the sidebar" }, '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M9 4v16" stroke="currentColor" stroke-width="1.8"/></svg>');
  searchRow.prepend(toggle);
  shell.append(mapWrap, sheet);
  if (search) shell.append(buildAccountMenu(search.account));
  document.getElementById("app-main").append(shell);
  shell.querySelectorAll("[data-sidebar-toggle]").forEach(button => button.addEventListener("click", () => setSheet(sheet.dataset.state === "peek" ? "half" : "peek")));
  view.classList.add("fs-home");
  document.body.classList.add("has-fs-home");

  // The original page heading stays for screen readers and for focus when the screen opens.
  view.querySelector(".areas-heading")?.classList.add("fs-heading");

  initDrag();

  // Going to a lot on the map: lower the sheet so the map is visible.
  body.addEventListener("click", (e) => {
    if (!isDesktop() && e.target.closest("[data-map-area], [data-nearby-index], #map-reset, #map-downtown, #map-provo, .map-tools button:not(#locate-me)")) setSheet("peek");
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !e.defaultPrevented && !document.querySelector("dialog[open]") && document.getElementById("car-sheet")?.hidden && sheet.dataset.state !== "peek") { setSheet("peek"); (isDesktop() ? toggle : handle).focus(); }
  });
  // A quick tap on the map (not a pan) lowers a raised sheet, like other map apps.
  let down = null;
  mapEl.addEventListener("pointerdown", (e) => { down = { x: e.clientX, y: e.clientY, t: Date.now() }; });
  mapEl.addEventListener("pointerup", (e) => {
    if (!down || isDesktop()) return;
    const still = Math.hypot(e.clientX - down.x, e.clientY - down.y) < 8 && Date.now() - down.t < 350;
    down = null;
    if (still && sheet.dataset.state !== "peek") setSheet("peek");
  });
  // The map must redraw whenever the map's box changes size (rotation, phone ↔ laptop, sheet).
  if (typeof ResizeObserver === "function") new ResizeObserver(() => refreshMap()).observe(mapEl);
  window.matchMedia?.(DESKTOP).addEventListener?.("change", () => setSheet(isDesktop() ? "half" : "peek"));

  // Errors are written inside the sheet. On phones with the sheet lowered nobody would see them, so a
  // load failure or a location error raises the sheet and scrolls the message into view.
  const raiseFor = (node) => {
    if (isDesktop() || sheet.dataset.state !== "peek") return;
    setSheet("half");
    requestAnimationFrame(() => node.scrollIntoView?.({ block: "nearest" }));
  };
  const appStatus = document.getElementById("status");
  if (appStatus) new MutationObserver(() => { if (appStatus.classList.contains("error") && appStatus.textContent.trim()) raiseFor(appStatus); })
    .observe(appStatus, { attributes: true, attributeFilter: ["class"], childList: true, characterData: true, subtree: true });
  if (toolbarStatus) new MutationObserver(() => { if (toolbarStatus.dataset.status === "error") raiseFor(toolbarStatus); })
    .observe(toolbarStatus, { attributes: true, attributeFilter: ["data-status"], childList: true });
  observeRenders();
  syncFullscreenRoute(state.currentView || "areas");
  if (state.currentView) void initMap();
}


// Called after the router selects a screen. The canvas is a sibling of the drawer, never a route.
export function syncFullscreenRoute(name, { showResults = false } = {}) {
  if (!sheet) return false;
  // Phones open on the map with the sheet lowered; laptops keep the sidebar open.
  setSheet(name === "areas" && !isDesktop() && !showResults ? "peek" : "half");
  if (name === "area" && body) body.scrollTop = 0;
  updateChrome();
  refreshMap();
  return true;
}

function loadStylesheet() {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`link[href="${STYLESHEET}"]`)) { resolve(); return; }
    const link = el("link", { rel: "stylesheet", href: STYLESHEET });
    link.onload = () => resolve();
    link.onerror = () => reject(new Error(`could not load ${STYLESHEET}`));
    document.head.append(link);
  });
}

// Called once from main.js. Waits for the stylesheet so the screen never shows a half-built layout.
export async function initFullscreenMap({ applyPermit: choose } = {}) {
  if (ready || typeof document === "undefined") return;
  ready = true;
  if (choose) applyPermit = choose;
  try {
    await loadStylesheet();
    build();
    if (!view.hidden) refreshMap();
  } catch (err) {
    console.error("[fullscreen-map] kept the original Areas layout:", err);
  }
}
