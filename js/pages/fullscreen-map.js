// Full-screen map for the Areas screen (phone + laptop).
//
// Phone:  the map fills the screen under the header. A permit chip ("Y · Now") floats top left,
//         a round location button floats bottom right, and the lot list lives in a pull-up sheet
//         ("peek" = one line, "half", "full"). Drag or tap the bar to move it.
// Laptop: the same sheet is a side panel on the left and the map fills the rest.
//
// How it works: this file does NOT change index.html, map.js or areas.js. When the app starts it
// moves the existing Areas elements (same ids, same event listeners) into the new layout, then
// adds the "fs-home" class that turns on css/fullscreen-map.css. If anything here fails, nothing
// is moved and the Areas screen keeps the original layout.
import { state } from "../state.js";
import { DAY_NAMES, escapeHtml, fmtTime } from "../lib/format.js";
import { parkingSelection, eligibleAreas } from "../domain/parking-results.js";
import { refreshMap } from "./map.js";

const STATES = ["peek", "half", "full"];
const DESKTOP = "(min-width: 980px)";
const STYLESHEET = "css/fullscreen-map.css";

let view, sheet, handle, body, chip, ready = false, applyPermit = () => false;

const isDesktop = () => Boolean(window.matchMedia?.(DESKTOP).matches);

function el(tag, attrs = {}, html = "") {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  if (html) node.innerHTML = html;
  return node;
}

// ---- Sheet position -------------------------------------------------------------------------
export function setSheet(next) {
  if (!sheet || !STATES.includes(next)) return;
  sheet.dataset.state = next;
  sheet.style.removeProperty("--drag-y");
  const open = next !== "peek" || isDesktop();
  handle.setAttribute("aria-expanded", String(open));
  sheet.querySelector(".sheet-action").textContent = next === "peek" ? "Show list" : "Hide list";
  // A list that is out of sight should not be reachable with Tab on phones.
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
  return {
    code: permit ? permit.permit_code : "P",
    text: permit ? `${permit.permit_code} · ${when}` : `Choose permit · ${when}`,
    label: `${permit ? permit.permit_name : "No permit chosen"}, ${spoken}. Change permit or time`,
  };
}

export function sheetTitle(count, hasPermit) {
  const noun = count === 1 ? "area matches" : "areas match";
  return `${count} ${noun} ${hasPermit ? "your permit" : "for everyone"}`;
}

function updateChrome() {
  if (!chip) return;
  try {
    const info = chipText(state.find, state.permits || []);
    chip.querySelector(".chip-code").textContent = info.code;
    chip.querySelector(".chip-text").textContent = info.text;
    chip.setAttribute("aria-label", info.label);
    const selection = parkingSelection(state.find);
    const count = eligibleAreas(state.areas || [], state.rulesByArea || new Map(), selection).length;
    sheet.querySelector(".sheet-title").textContent = sheetTitle(count, Boolean(state.find.permitId));
  } catch (err) {
    console.error("[fullscreen-map] could not update the permit chip", err);
  }
}

// areas.js rewrites #areas-summary and #areas-count on every render (permit change, clock tick,
// search, favorites). Watching them keeps the chip and title in step without editing areas.js.
function observeRenders() {
  const watch = ["areas-summary", "areas-count"].map(id => document.getElementById(id)).filter(Boolean);
  const observer = new MutationObserver(updateChrome);
  for (const node of watch) observer.observe(node, { childList: true, characterData: true, subtree: true });
}

// ---- Dragging --------------------------------------------------------------------------------
function initDrag() {
  let startY = null, startOffset = 0, moved = false, height = 0;
  const offsetFor = (s) => {
    const peek = handle.offsetHeight;
    return s === "full" ? 0 : s === "half" ? height * 0.45 : height - peek;
  };
  handle.addEventListener("pointerdown", (e) => {
    if (isDesktop() || e.button > 0) return;
    height = sheet.offsetHeight;
    startY = e.clientY;
    startOffset = offsetFor(sheet.dataset.state);
    moved = false;
    handle.setPointerCapture?.(e.pointerId);
  });
  handle.addEventListener("pointermove", (e) => {
    if (startY == null) return;
    const dy = e.clientY - startY;
    if (Math.abs(dy) > 6) moved = true;
    if (!moved) return;
    const y = Math.min(Math.max(startOffset + dy, 0), offsetFor("peek"));
    sheet.classList.add("dragging");
    sheet.style.setProperty("--drag-y", `${y}px`);
  });
  const end = (e) => {
    if (startY == null) return;
    const dy = e.clientY - startY;
    startY = null;
    sheet.classList.remove("dragging");
    if (!moved) return; // a tap: the click listener handles it
    const y = Math.min(Math.max(startOffset + dy, 0), offsetFor("peek"));
    const nearest = STATES.reduce((best, s) => (Math.abs(offsetFor(s) - y) < Math.abs(offsetFor(best) - y) ? s : best), "peek");
    setSheet(nearest);
    handle.dataset.dragged = "1"; // swallow the click that follows a drag
  };
  handle.addEventListener("pointerup", end);
  handle.addEventListener("pointercancel", end);
  handle.addEventListener("click", () => {
    if (handle.dataset.dragged) { delete handle.dataset.dragged; return; }
    if (isDesktop()) return;
    setSheet({ peek: "half", half: "full", full: "peek" }[sheet.dataset.state] || "half");
  });
}

// ---- Floating search bar -----------------------------------------------------------------------
// A compact front door to the plain-language / voice search on Find (#nl-form). It hands the text to
// that form and opens Find so the person can review the filled-in fields. It never searches for them.
const SEARCH_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="m16 16 4.5 4.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
const MIC_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="9" y="3" width="6" height="11" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
const GO_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 12h14M13 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

function buildSearch() {
  const nlForm = document.getElementById("nl-form"), nlText = document.getElementById("nl-text");
  const nlMic = document.getElementById("nl-mic"), nlStatus = document.getElementById("nl-status");
  if (!nlForm || !nlText) return null;
  const bar = el("form", { class: "map-search", id: "map-search", role: "search", "aria-label": "Search parking in plain language" },
    `<span class="map-search-icon">${SEARCH_ICON}</span>` +
    `<input type="text" id="map-search-text" maxlength="500" autocomplete="off" enterkeyhint="search" aria-label="Describe your trip" aria-describedby="map-search-status" placeholder="Class at 3 pm at the JKB…">` +
    `<button type="button" id="map-search-mic" class="map-search-btn map-search-mic" aria-pressed="false" aria-label="Speak your trip" title="Speak your trip" hidden>${MIC_ICON}</button>` +
    `<button type="submit" class="map-search-btn map-search-go" aria-label="Fill in the Find form" title="Fill in the Find form">${GO_ICON}</button>`);
  const status = el("p", { class: "map-search-status", id: "map-search-status", role: "status", "aria-live": "polite" });
  const input = bar.querySelector("#map-search-text"), mic = bar.querySelector("#map-search-mic");

  bar.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) { status.textContent = "Type or say something like “class at 3 pm at the JKB”."; input.focus(); return; }
    nlText.value = text;
    const send = () => nlForm.requestSubmit ? nlForm.requestSubmit() : nlForm.dispatchEvent(new Event("submit", { cancelable: true }));
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
  return { bar, status };
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
  pop.addEventListener("keydown", (e) => { if (e.key === "Escape") { setOpen(false); chip.focus(); } });
  document.addEventListener("click", (e) => { if (!pop.hidden && !e.target.closest("#permit-pop, #permit-chip")) setOpen(false); });
  pop.querySelector(".permit-pop-more").addEventListener("click", () => setOpen(false));
  return pop;
}

// ---- Building the layout ----------------------------------------------------------------------
function build() {
  view = document.getElementById("view-areas");
  const stage = view?.querySelector(".map-stage");
  const results = view?.querySelector(".parking-results");
  const mapEl = document.getElementById("parking-map");
  const locate = document.getElementById("locate-me");
  if (!view || !stage || !results || !mapEl || !locate) throw new Error("Areas screen markup not found");

  // Map area: the stage moves to the top of the screen; chip + location button float on it.
  const mapWrap = el("div", { class: "fs-map" });
  chip = el("a", { href: "#find", class: "permit-chip", id: "permit-chip", "aria-label": "Change permit or time" },
    `<span class="chip-code" aria-hidden="true">P</span><span class="chip-text">Choose permit</span>` +
    `<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M5 8l5 5 5-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`);
  locate.classList.add("map-fab");
  locate.setAttribute("aria-label", "Use my location");
  locate.title = "Use my location";
  stage.append(locate);
  // Floating controls over the map. Top stack: search bar, then a row with the permit chip and the 2D/3D
  // switch, then the search status and permit popover. Bottom right: "?" guide button above the location button.
  const search = buildSearch();
  const top = el("div", { class: "map-top", id: "map-top" });
  const row = el("div", { class: "map-top-row" });
  row.append(chip);
  const modeSwitch = stage.querySelector(".map-mode");
  if (modeSwitch) row.append(modeSwitch);
  if (search) top.append(search.bar);
  top.append(row);
  if (search) top.append(search.status);
  top.append(buildPermitPopover());
  const help = el("button", { type: "button", class: "map-help", id: "map-help", "data-help-open": "", "aria-haspopup": "dialog", "aria-label": "Quick guide: permit colors, 2D/3D, location", title: "Quick guide" },
    `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M9.6 9.4a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1.1.9-1.1 1.6M12 16.6v.1" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`);
  stage.append(top, help);
  mapWrap.append(stage);

  // Sheet: handle + body. Everything that was beside or under the map goes in the body, in order.
  sheet = el("div", { class: "home-sheet", id: "home-sheet", "data-state": "peek" });
  handle = el("button", { type: "button", class: "sheet-handle", id: "sheet-handle", "aria-expanded": "false", "aria-controls": "sheet-body" },
    `<span class="sheet-grip" aria-hidden="true"></span><span class="sheet-title">Loading parking…</span><span class="sheet-action">Show list</span>`);
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

  body.append(fine);
  if (toolbar) body.append(toolbar);
  if (toolbarStatus) body.append(toolbarStatus);
  // The results column keeps its own markup (nearby, search, sort, cards); only the notes moved out.
  body.append(results);
  if (heading) results.querySelector(".nearby-panel")?.after(heading);
  if (mapKey) body.append(mapKey);
  if (cityLots) body.append(cityLots);
  sheet.append(handle, body);

  const shell = el("div", { class: "fs-shell" });
  shell.append(mapWrap, sheet);
  view.append(shell);
  view.classList.add("fs-home");
  document.body.classList.add("has-fs-home");

  // The original page heading stays for screen readers and for focus when the screen opens.
  view.querySelector(".areas-heading")?.classList.add("fs-heading");
  view.querySelector(".parking-workspace")?.remove(); // now empty: its children moved above

  initDrag();

  // Going to a lot on the map: lower the sheet so the map is visible.
  body.addEventListener("click", (e) => {
    if (!isDesktop() && e.target.closest("[data-map-area], [data-nearby-index], #map-reset, #map-downtown, #map-provo, .map-tools button:not(#locate-me)")) setSheet("peek");
  });
  // Keyboard users tabbing toward the list open it.
  handle.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !isDesktop()) setSheet("peek");
  });
  sheet.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !isDesktop() && sheet.dataset.state !== "peek") { setSheet("peek"); handle.focus(); }
  });
  // A quick tap on the map (not a pan) lowers a full sheet, like other map apps.
  let down = null;
  mapEl.addEventListener("pointerdown", (e) => { down = { x: e.clientX, y: e.clientY, t: Date.now() }; });
  mapEl.addEventListener("pointerup", (e) => {
    if (!down || isDesktop()) return;
    const still = Math.hypot(e.clientX - down.x, e.clientY - down.y) < 8 && Date.now() - down.t < 350;
    down = null;
    if (still && sheet.dataset.state === "full") setSheet("peek");
  });
  // The map must redraw whenever the map's box changes size (rotation, phone ↔ laptop, sheet).
  if (typeof ResizeObserver === "function") new ResizeObserver(() => refreshMap()).observe(mapEl);
  window.matchMedia?.(DESKTOP).addEventListener?.("change", () => setSheet("peek"));
  // Each time Areas opens: start with the list lowered and the map sized to the screen.
  new MutationObserver(() => {
    if (!view.hidden) { setSheet(isDesktop() ? "half" : "peek"); updateChrome(); refreshMap(); }
  }).observe(view, { attributes: true, attributeFilter: ["hidden"] });

  observeRenders();
  setSheet(isDesktop() ? "half" : "peek");
  updateChrome();
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
