// Parking timer sheet (opened by the floating car button): start a timer, car note, end session (parking_session).
import { parkingNow } from "../lib/server-clock.js";
import { stayWarnings, warningText } from "../domain/stay-warnings.js";
import { state, rulesFor } from "../state.js";
import { $, setStatus } from "../lib/dom.js";
import { escapeHtml, fmtClock, fmtDuration, deviceDirections } from "../lib/format.js";
import { evaluate } from "../domain/eligibility.js";
import * as sessions from "../data/sessions.js";
import { lotSuggestions, totalMinutes, fitReminder, HOUR_OPTIONS, MINUTE_OPTIONS, DEFAULT_DURATION } from "../domain/timer-picker.js";
import { createTimeWheel } from "../components/time-wheel.js";
import { renderCarFab } from "../components/car-fab.js";

let timerHandle = null;
let lastReminderState = "";
let warningKey = "", mutation = false, refreshSequence = 0, refreshing = false;
let backgroundInert = new Map();
function timerStatus(message,isError=false) {
  setStatus(message,isError);
  const notice=$("car-action-status");
  if(notice){notice.textContent=message;notice.hidden=false;notice.setAttribute("role",isError?"alert":"status");}
}

// ---------- the sheet itself ----------
let returnHash = "#areas"; // where Close takes the user back to
let returnFocus = null;
export function rememberCarPage(hash) { returnHash = hash || "#areas"; }

export function openCarSheet() {
  const sheet = $("car-sheet");
  if (!sheet.hidden) return;
  returnFocus = document.activeElement;
  backgroundInert = new Map();
  for (const node of [document.getElementById("app-header"),document.getElementById("app-footer"),...(document.getElementById("app-main")?.children || [])]) {
    if (node && node !== sheet) { backgroundInert.set(node,node.inert); node.inert=true; }
  }
  sheet.hidden = false;
  document.body.classList.add("car-sheet-open");
  $("h-car").focus({ preventScroll: true });
}

// Returns true if the sheet was open (so the caller keeps focus where the sheet put it).
export function closeCarSheet() {
  const sheet = $("car-sheet");
  if (!sheet || sheet.hidden) return false;
  sheet.hidden = true;
  for (const [node,inert] of backgroundInert) node.inert=inert;
  backgroundInert.clear();
  document.body.classList.remove("car-sheet-open");
  stopTimer();
  const target = returnFocus;
  returnFocus = null;
  if (target?.isConnected) target.focus({ preventScroll: true });
  else document.querySelector?.(`#view-${state.currentView} h2[tabindex]`)?.focus({ preventScroll: true });
  return true;
}

// Close = go back to the page the sheet was opened from (never back into #car).
function requestClose() {
  const hash = /^#car(\/|$)/.test(returnHash) ? "#areas" : returnHash;
  if (location.hash === hash) closeCarSheet(); else location.hash = hash;
}

export function stopTimer() { if (timerHandle) { clearInterval(timerHandle); timerHandle = null; } }

export function renderCar(selectedAreaId = "") {
  const active = $("car-active"), form = $("car-form"), guest = $("car-guest");
  const session = state.activeSession;
  stopTimer();
  lastReminderState = "";
  warningKey = "";
  // Guests see why they need an account before filling the form, not after pressing Start.
  if (guest) guest.hidden = Boolean(session || state.user);
  const title = $("h-car");
  if (title) title.textContent = !session && !state.user ? "Sign in to start a timer" : "My Car";
  if (!session && !state.user && guest) {
    form.hidden = true;
    active.hidden = true;
    active.innerHTML = "";
    const selectedLot = state.areas.some(area => String(area.area_id) === String(selectedAreaId) && !area.is_sample_data);
    const copy = $("car-guest-copy"), back = $("car-guest-back");
    if (copy) copy.textContent = selectedLot ? "Your lot will be here when you return." : "Sign in to save where you park and set a timer.";
    if (back) back.textContent = selectedLot && /^#area\//.test(returnHash) ? "Back to lot" : "Keep browsing";
    return;
  }
  if (session) {
    form.hidden = true;
    active.hidden = false;
    const area = state.areas.find((a) => a.area_id === session.area_id);
    const directions = area ? deviceDirections(area, "walking") : null;
    const note = session.car_note || "";
    active.innerHTML = `
      <div class="panel session timer-running">
        <p class="meta">Parked at</p>
        <h3>${escapeHtml(area ? area.area_name : "Unknown area")}</h3>
        <p class="countdown" id="countdown" aria-hidden="true"></p>
        <p id="countdown-text" class="sr-text"></p>
        <p class="car-leave-by">Leave by <strong>${fmtClock(new Date(session.leave_by))}</strong></p>
        <p id="reminder" class="reminder" hidden></p>
        <p id="car-active-rule-warning" class="reminder" role="status" hidden></p>

        <div class="actions timer-actions">
          ${directions ? `<a class="secondary" href="${escapeHtml(directions.url)}" target="_blank" rel="noopener" aria-label="Find my car: walking directions in ${directions.app}">Find my car</a>` : ""}
          <button type="button" class="primary" id="end-session">End timer</button>
        </div>

        <details class="car-note">
          <summary>${note ? `Note: ${escapeHtml(note)}` : "Add a note about where you parked"}</summary>
          <form id="note-form">
            <label for="note-edit" class="sr-text">Where is your car?</label>
            <input type="text" id="note-edit" maxlength="200" value="${escapeHtml(note)}" placeholder="Row C near the stairs">
            <button type="submit" class="secondary">Save note</button>
          </form>
        </details>
        <p class="hint">Saved to your account, so the timer keeps going if you close the app.</p>
      </div>`;
    tick();
    timerHandle = setInterval(tick, 1000);
  } else {
    active.hidden = true;
    active.innerHTML = "";
    form.hidden = false;
    // "Park here" passes the lot; otherwise start with suggestions. Unknown or sample lots are never preselected.
    const selected = state.areas.find((a) => !a.is_sample_data && String(a.area_id) === String(selectedAreaId));
    if (selected) pickLot(selected.area_id, { focus: false });
    else clearLot({ focus: false });
    hideFormError();
    wheels?.hours.refresh();
    wheels?.minutes.refresh();
    syncDuration();
  }
}

// ---------- start form: lot search, duration wheels, reminder ----------
const LAST_AREA_KEY = "provoParking.timer.lastArea";
let wheels = null;
let activeOption = -1;

function lastAreaId() {
  try { return localStorage.getItem(LAST_AREA_KEY); } catch { return null; }
}
function rememberArea(areaId) {
  try { localStorage.setItem(LAST_AREA_KEY, String(areaId)); } catch { /* best effort */ }
}

function renderSuggestions() {
  const list = $("car-suggestions"), input = $("car-search"), empty = $("car-search-empty");
  if (!list || !input) return;
  const query = input.value;
  const rows = lotSuggestions({
    query, areas: state.areas || [], favoriteIds: state.favoriteIds || new Set(), favoriteNames: state.favoriteNames || new Map(),
    position: state.lastPosition, lastAreaId: lastAreaId(),
  });
  activeOption = -1;
  input.removeAttribute("aria-activedescendant");
  const icon = { last: "↺", favorite: "♥", near: "➤", match: "P" };
  list.innerHTML = rows.map((row, i) => `
    <li role="option" id="car-opt-${i}" data-area="${row.id}" aria-selected="false" class="car-option car-option-${row.kind}">
      <span class="car-option-icon" aria-hidden="true">${icon[row.kind]}</span>
      <span><span class="car-option-title">${escapeHtml(row.title)}</span><span class="car-option-sub">${escapeHtml(row.sub)}</span></span>
    </li>`).join("");
  input.setAttribute("aria-expanded", rows.length ? "true" : "false");
  empty.hidden = rows.length > 0;
  empty.textContent = query.trim()
    ? "No lots match that. Try the lot number, like “20” or “2V”."
    : "Type the lot name or number you parked in.";
}

function moveOption(step) {
  const options = [...$("car-suggestions").querySelectorAll("[role=option]")];
  if (!options.length) return;
  activeOption = (activeOption + step + options.length) % options.length;
  options.forEach((o, i) => o.setAttribute("aria-selected", String(i === activeOption)));
  $("car-search").setAttribute("aria-activedescendant", options[activeOption].id);
  options[activeOption].scrollIntoView({ block: "nearest" });
}

function pickLot(areaId, { focus = true } = {}) {
  const area = state.areas.find((a) => String(a.area_id) === String(areaId));
  if (!area) return;
  $("car-area").value = String(area.area_id);
  $("car-picked-name").textContent = area.area_name;
  const nickname = state.favoriteNames?.get?.(area.area_id) ?? state.favoriteNames?.get?.(String(area.area_id));
  $("car-picked-sub").textContent = nickname ? `Saved as “${nickname}”` : "";
  $("car-picked").hidden = false;
  $("car-search-wrap").hidden = true;
  hideFormError();
  updateCarWarning();
  if (focus) $("car-change").focus();
}

function clearLot({ focus = true } = {}) {
  $("car-area").value = "";
  $("car-picked").hidden = true;
  $("car-search-wrap").hidden = false;
  $("car-search").value = "";
  renderSuggestions();
  updateCarWarning();
  if (focus) $("car-search").focus();
}

function syncDuration() {
  if (!wheels) return;
  const minutes = totalMinutes(wheels.hours.value, wheels.minutes.value);
  $("car-minutes").value = String(minutes);
  const reminder = $("car-reminder");
  for (const option of reminder.options) option.disabled = Number(option.value) > 0 && Number(option.value) >= minutes;
  reminder.value = String(fitReminder(reminder.value, minutes));
  $("car-leave-by").innerHTML = minutes
    ? `Leave by <strong>${fmtClock(new Date(parkingNow() + minutes * 60000))}</strong>`
    : "Choose at least 5 minutes.";
  updateCarWarning();
}

function showFormError(message, focusEl) {
  const err = $("car-form-error");
  err.textContent = message;
  err.hidden = false;
  focusEl?.focus();
}
function hideFormError() {
  const err = $("car-form-error");
  if (err) { err.hidden = true; err.textContent = ""; }
}

function setupForm() {
  const hours = $("car-hours"), mins = $("car-mins");
  if (!hours || !mins || wheels) return;
  wheels = {
    hours: createTimeWheel(hours, { values: HOUR_OPTIONS, value: DEFAULT_DURATION.hours, label: "Hours", unit: "hr", onChange: syncDuration }),
    minutes: createTimeWheel(mins, { values: MINUTE_OPTIONS, value: DEFAULT_DURATION.minutes, label: "Minutes", unit: "min", onChange: syncDuration }),
  };
  const input = $("car-search");
  input.addEventListener("input", renderSuggestions);
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); moveOption(1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); moveOption(-1); }
    else if (e.key === "Enter") {
      e.preventDefault();
      const options = $("car-suggestions").querySelectorAll("[role=option]");
      const choice = options[activeOption >= 0 ? activeOption : 0];
      if (choice) pickLot(choice.dataset.area);
    }
  });
  $("car-suggestions").addEventListener("click", (e) => {
    const option = e.target.closest("[role=option]");
    if (option) pickLot(option.dataset.area);
  });
  $("car-change").addEventListener("click", () => clearLot());
  $("car-reminder").addEventListener("change", hideFormError);
}

// The countdown is always derived from the saved leave_by, so a refresh keeps it correct.
function tick() {
  const session = state.activeSession;
  if (!session) return;
  const msLeft = new Date(session.leave_by).getTime() - parkingNow();
  const el = $("countdown");
  if (!el) return stopTimer();
  const over = msLeft < 0;
  const total = Math.abs(Math.floor(msLeft / 1000));
  const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
  const clock = `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  el.textContent = over ? `Over by ${clock}` : clock;
  el.classList.toggle("over", over);
  $("countdown-text").textContent = over ? `Time is up. You are over by ${fmtDuration(Math.max(1, Math.round(total / 60)))}.` : `${fmtDuration(Math.max(1, Math.ceil(total / 60)))} left.`;

  const key = session.session_id + ":" + Math.floor(parkingNow()/60000);
  if (warningKey !== key) {
    warningKey=key;
    const notices=stayWarnings(rulesFor(session.area_id),("permit_id_at_start" in session ? session.permit_id_at_start : state.find.permitId),
      Math.max(Date.parse(session.started_at),parkingNow()-86400000+60000),Math.max(Date.parse(session.leave_by),parkingNow()+60000));
    const notice=$("car-active-rule-warning");
    notice.hidden=!notices.length;
    notice.textContent=notices.map(warningText).join(" ");
  }
  const remindMs = session.reminder_minutes_before * 60000;
  const reminderState = over ? "over" : msLeft <= remindMs ? "soon" : "ok";
  const rem = $("reminder");
  if (reminderState !== lastReminderState) { // only touch the live text when the state changes
    lastReminderState = reminderState;
    rem.hidden = reminderState === "ok";
    rem.setAttribute("role", reminderState === "ok" ? "" : "alert");
    rem.textContent = reminderState === "over"
      ? "Time is up — move your car now to avoid a ticket or tow."
      : reminderState === "soon" ? `Heads up: ${fmtDuration(Math.max(1, Math.ceil(msLeft / 60000)))} left. Head back to your car.` : "";
    rem.classList.toggle("over", reminderState === "over");
  }
}

export function updateCarWarning() {
  const warn=$("car-warning");
  if(!warn)return;
  const area=state.areas.find(a=>a.area_id===Number($("car-area").value));
  if(!area||!Number($("car-minutes").value)){warn.hidden=true;return;}
  const start=parkingNow(),end=start+Number($("car-minutes").value)*60000;
  const notices=stayWarnings(rulesFor(area.area_id),state.find.permitId,start,end);
  warn.textContent=notices.map(warningText).join(" ");
  warn.hidden=!notices.length;
}
export async function refreshSavedTimer() {
  if (!state.user || !state.db || mutation || refreshing || !$("auth-screen").hidden) return;
  const version=state.authVersion,sequence=++refreshSequence;
  const previous=JSON.stringify(state.activeSession);
  refreshing=true;
  try {
    const snapshot=await sessions.getTimerSnapshot();
    if(version!==state.authVersion||sequence!==refreshSequence||mutation)return;
    sessions.acceptTimerSnapshot(snapshot);
    renderCarFab();
    if(!$("car-sheet").hidden && previous!==JSON.stringify(state.activeSession)) renderCar();
  } catch {
    if(version===state.authVersion && state.activeSession) timerStatus("Your timer could not be refreshed. Showing the last saved timer; check your connection.",true);
  } finally {refreshing=false;}
}

let requireAccount = () => true;

async function onStart(e) {
  e.preventDefault();
  if (!requireAccount("Create a free account to start a parking timer and save where you parked.")) return;
  if (mutation) return;
  const areaId = Number($("car-area").value), minutes = Number($("car-minutes").value);
  if (!areaId) return showFormError("Choose the lot you parked in.", $("car-search"));
  if (!minutes) return showFormError("Choose how long you'll park (at least 5 minutes).", $("car-hours"));
  mutation=true; refreshSequence++;
  const version = state.authVersion;
  const btn = e.submitter || $("car-form").querySelector("button[type=submit]");
  btn.disabled = true;
  try {
    const created = await sessions.startSession({
      areaId,
      minutes,
      reminderMinutes: fitReminder($("car-reminder").value, minutes),
      carNote: "",
      destinationId: state.find.destinationId ?? null, // kept only if the driver already picked a building in Find
      permitId: state.find.permitId,
    });
    if (version !== state.authVersion) return;
    sessions.acceptTimerSnapshot(created);
    rememberArea(areaId);
    timerStatus("Parking timer started.");
    renderCar();
    renderCarFab();
    $("h-car").focus();
  } catch (err) {
    if (version !== state.authVersion) return;
    console.error(err);
    try {
      const snapshot=await sessions.getTimerSnapshot();
      if(version!==state.authVersion)return;
      if(snapshot.session) {
        sessions.acceptTimerSnapshot(snapshot); renderCar(); renderCarFab();
        timerStatus("Your saved timer is already running. End it before starting another.");
        return;
      }
    } catch { /* Keep the original failure and entered preferences visible. */ }
    if (version !== state.authVersion) return;
    timerStatus(`Could not start the timer: ${err.message}`, true);
  } finally {
    mutation=false;
    btn.disabled = false;
  }
}

async function onEnd(btn) {
  if(mutation)return;
  mutation=true;refreshSequence++;
  const version = state.authVersion;
  btn.disabled = true;
  try {
    const expired = parkingNow() > new Date(state.activeSession.leave_by).getTime();
    const snapshot = await sessions.endSession(state.activeSession);
    if (version !== state.authVersion) return;
    sessions.acceptTimerSnapshot(snapshot);
    timerStatus(expired ? "Timer ended. You were over your planned time." : "Timer ended. Safe travels!");
    renderCar();
    renderCarFab();
    $("h-car").focus();
  } catch (err) {
    if (version !== state.authVersion) return;
    console.error(err);
    timerStatus(`Could not end the timer: ${err.message}`, true);
    btn.disabled = false;
  } finally { mutation=false; }
}

async function onSaveNote(e) {
  e.preventDefault();
  if(mutation)return;
  mutation=true;refreshSequence++;
  const version = state.authVersion;
  const btn = e.submitter;
  btn.disabled = true;
  try {
    const saved = await sessions.saveCarNote(state.activeSession, $("note-edit").value.trim() || null);
    if (version !== state.authVersion) return;
    if(state.activeSession?.session_id === saved.session_id) state.activeSession = saved;
    const details = document.querySelector?.(".car-note");
    if (details) {
      details.querySelector("summary").textContent = saved.car_note ? `Note: ${saved.car_note}` : "Add a note about where you parked";
      details.open = false;
    }
    timerStatus("Saved your car note.");
  } catch (err) {
    if (version !== state.authVersion) return;
    console.error(err);
    timerStatus(`Could not save the note: ${err.message}`, true);
  } finally {
    mutation=false;
    btn.disabled = false;
  }
}

export function initCar(options = {}) {
  if (options.requireAccount) requireAccount = options.requireAccount;
  $("car-close").addEventListener("click", requestClose);
  $("car-backdrop").addEventListener("click", requestClose);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !$("car-sheet").hidden) requestClose();
  });
  document.addEventListener("keydown",event=>{
    if(event.key!=="Tab"||$("car-sheet").hidden)return;
    const nodes=[...$("car-sheet").querySelectorAll('a[href],button,input,select,textarea,[tabindex="0"]')].filter(el=>!el.disabled&&el.getClientRects().length);
    const first=nodes[0],last=nodes.at(-1);
    if(!first){event.preventDefault();$("h-car").focus();return;}
    if(event.shiftKey&&(document.activeElement===first||!nodes.includes(document.activeElement))){event.preventDefault();last.focus();}
    else if(!event.shiftKey&&(document.activeElement===last||!nodes.includes(document.activeElement))){event.preventDefault();first.focus();}
  });
  const resume=()=>{if(!document.hidden)void refreshSavedTimer();};
  window.addEventListener("focus",resume);
  window.addEventListener("pageshow",resume);
  window.addEventListener("online",resume);
  document.addEventListener("visibilitychange",resume);
  window.addEventListener("storage",event=>{if(sessions.isTimerChange(event.key))resume();});
  setInterval(resume,30000);
  // Remember the page the sheet was opened from, so Close goes back there.
  window.addEventListener("hashchange", () => {
    if (!/^#car(\/|$)/.test(location.hash)) returnHash = location.hash || "#areas";
  });
  returnHash = /^#car(\/|$)/.test(location.hash) ? "#areas" : (location.hash || "#areas");
  $("car-guest-back")?.addEventListener("click", requestClose);
  setupForm();
  document.addEventListener("submit", (e) => {
    if (e.target.id === "car-form") onStart(e);
    if (e.target.id === "note-form") onSaveNote(e);
  });
  document.addEventListener("click", (e) => {
    const end = e.target.closest("#end-session");
    if (end) onEnd(end);
    if (e.target.closest("#car-fab")) returnFocus = $("car-fab");
  });
}
