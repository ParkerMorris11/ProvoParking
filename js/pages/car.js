// Parking timer sheet (opened by the floating car button): start a timer, car note, end session (parking_session).
import { parkingNow } from "../lib/server-clock.js";
import { stayWarnings, warningText } from "../domain/stay-warnings.js";
import { state, rulesFor } from "../state.js";
import { $, setStatus } from "../lib/dom.js";
import { escapeHtml, fmtClock, fmtDuration, directionsUrl } from "../lib/format.js";
import { evaluate } from "../domain/eligibility.js";
import * as sessions from "../data/sessions.js";
import { parkingSelection } from "../domain/parking-results.js";
import { renderDestinationOptions } from "./find.js";
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
  if (target && target.isConnected) target.focus({ preventScroll: true });
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
  if (!session && !state.user && guest) {
    form.hidden = true;
    active.hidden = true;
    active.innerHTML = "";
    return;
  }
  if (session) {
    form.hidden = true;
    active.hidden = false;
    const area = state.areas.find((a) => a.area_id === session.area_id);
    active.innerHTML = `
      <div class="panel session">
        <p class="meta">You parked at</p>
        <h3>${escapeHtml(area ? area.area_name : "Unknown area")}</h3>
        <p class="meta">Destination: ${escapeHtml(state.destinations.find(d => d.destination_id === session.destination_id)?.name || "Not recorded (older session)")}</p>
        <p class="countdown" id="countdown" aria-hidden="true"></p>
        <p id="countdown-text" class="sr-text"></p>
        <p id="reminder" class="reminder" hidden></p>
        <p id="car-active-rule-warning" class="reminder" role="status" hidden></p>
        <p class="hint">Saved to your account. You can close this popup, change pages, or reopen the app; the timer keeps its original end time.</p>
        <p class="meta">Started ${fmtClock(new Date(session.started_at))} · leave by <strong>${fmtClock(new Date(session.leave_by))}</strong> · reminder ${session.reminder_minutes_before} min before</p>

        <form id="note-form">
          <label for="note-edit">Where is your car?</label>
          <input type="text" id="note-edit" maxlength="200" value="${escapeHtml(session.car_note || "")}" placeholder="e.g. Row C near the stairs">
          <button type="submit" class="secondary">Save note</button>
        </form>

        <div class="actions">
          ${area && directionsUrl(area) ? `<a class="secondary" href="${escapeHtml(directionsUrl(area))}" target="_blank" rel="noopener">${area.is_sample_data ? "Walking directions (sample location)" : "Directions to approximate section"}</a>` : ""}
          <button type="button" class="primary" id="end-session">I left — end timer</button>
        </div>
      </div>`;
    tick();
    timerHandle = setInterval(tick, 1000);
  } else {
    active.hidden = true;
    active.innerHTML = "";
    form.hidden = false;
    const sel = $("car-area");
    const choices = state.areas.filter((a) => !a.is_sample_data);
    sel.innerHTML = '<option value="">Choose a parking lot…</option>' +
      choices.map((a) => `<option value="${a.area_id}">${escapeHtml(a.area_name)}</option>`).join("");
    const selected = String(selectedAreaId);
    sel.value = choices.some((area) => String(area.area_id) === selected) ? selected : "";
    renderDestinationOptions("car-destination", state.find.destinationId);
    updateCarWarning();
  }
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
  const area=state.areas.find(a=>a.area_id===Number($("car-area").value));
  if(!area){warn.hidden=true;return;}
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
  mutation=true; refreshSequence++;
  const version = state.authVersion;
  const btn = e.submitter;
  btn.disabled = true;
  try {
    const created = await sessions.startSession({
      areaId: Number($("car-area").value),
      minutes: Number($("car-minutes").value),
      reminderMinutes: Number($("car-reminder").value),
      carNote: $("car-note").value.trim(),
      destinationId: Number($("car-destination").value),
      permitId: state.find.permitId,
    });
    if (version !== state.authVersion) return;
    sessions.acceptTimerSnapshot(created);
    $("car-note").value = "";
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
  $("car-area").addEventListener("change", updateCarWarning);
  $("car-minutes").addEventListener("change", updateCarWarning);
  document.addEventListener("submit", (e) => {
    if (e.target.id === "car-form") onStart(e);
    if (e.target.id === "note-form") onSaveNote(e);
  });
  document.addEventListener("click", (e) => {
    const end = e.target.closest("#end-session");
    if (end) onEnd(end);
    if (e.target.closest("#car-fab")) returnFocus = $("car-fab");
    if (e.target.closest("#car-signup")) requireAccount("Create a free account to start a parking timer and save where you parked.");
  });
}
