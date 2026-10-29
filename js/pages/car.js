// Page: My car — parking timer, car note, end session (parking_session).
import { state, rulesFor } from "../state.js";
import { $, setStatus } from "../lib/dom.js";
import { escapeHtml, fmtClock, fmtDuration, nowHHMM, directionsUrl } from "../lib/format.js";
import { evaluate } from "../domain/eligibility.js";
import * as sessions from "../data/sessions.js";
import { lotTile } from "../components/area-card.js";
import { icon } from "../lib/icons.js";

const RING_R = 108;
const RING_C = 2 * Math.PI * RING_R;

let timerHandle = null;
let lastReminderState = "";

export function stopTimer() { if (timerHandle) { clearInterval(timerHandle); timerHandle = null; } }

export function renderCar() {
  const active = $("car-active"), form = $("car-form");
  const session = state.activeSession;
  stopTimer();
  lastReminderState = "";
  if (session) {
    form.hidden = true;
    active.hidden = false;
    const area = state.areas.find((a) => a.area_id === session.area_id);
    const started = new Date(session.started_at), leaveBy = new Date(session.leave_by);
    active.innerHTML = `
      <div class="session">
        <div class="timer-card">
          <div class="ring">
            <svg viewBox="0 0 240 240" aria-hidden="true" focusable="false">
              <circle class="ring-track" cx="120" cy="120" r="${RING_R}"/>
              <circle class="ring-fill" id="ring-fill" cx="120" cy="120" r="${RING_R}"
                      stroke-dasharray="${RING_C.toFixed(1)}" stroke-dashoffset="0" transform="rotate(-90 120 120)"/>
            </svg>
            <div class="ring-center">
              <p class="overline">Time left</p>
              <p class="countdown" id="countdown" aria-hidden="true"></p>
              <p id="countdown-text" class="sr-text"></p>
              <p class="leave-by">Leave by ${fmtClock(leaveBy)}</p>
            </div>
          </div>
          <p id="reminder" class="reminder" hidden></p>
        </div>

        <div class="session-side">
          <div class="panel">
            <div class="card-top">
              ${area ? lotTile(area) : ""}
              <div class="card-name">
                <p class="meta">You parked at</p>
                <h3>${escapeHtml(area ? area.area_name : "Unknown area")}</h3>
              </div>
            </div>
            <div class="stats">
              <div class="stat"><strong>${fmtClock(started)}</strong><span>Started</span></div>
              <div class="stat"><strong>${fmtDuration(session.planned_minutes || Math.round((leaveBy - started) / 60000))}</strong><span>Planned stay</span></div>
              <div class="stat"><strong>${fmtClock(leaveBy)}</strong><span>Leave by</span></div>
            </div>
          </div>

          <p class="note-pill">${icon("bell", 18)}<span>Reminder ${session.reminder_minutes_before} min before you need to leave, shown on this page while it is open.</span></p>

          <form id="note-form" class="panel">
            <label for="note-edit">Where is your car?</label>
            <input type="text" id="note-edit" maxlength="200" value="${escapeHtml(session.car_note || "")}" placeholder="e.g. Row C near the stairs">
            <button type="submit" class="secondary">Save note</button>
          </form>

          <div class="actions two">
            ${area ? `<a class="secondary" href="${directionsUrl(area)}" target="_blank" rel="noopener">Walking directions (sample location)</a>` : ""}
            <button type="button" class="primary danger" id="end-session">I left — end timer</button>
          </div>
          <p class="hint center">A reminder, not a guarantee against tickets.</p>
        </div>
      </div>`;
    tick();
    timerHandle = setInterval(tick, 1000);
  } else {
    active.hidden = true;
    active.innerHTML = "";
    form.hidden = false;
    const sel = $("car-area");
    const keep = sel.value;
    sel.innerHTML = state.areas.map((a) => `<option value="${a.area_id}">${escapeHtml(a.area_name)}</option>`).join("");
    if (keep) sel.value = keep;
    updateCarWarning();
  }
}

// The countdown is always derived from the saved leave_by, so a refresh keeps it correct.
function tick() {
  const session = state.activeSession;
  if (!session) return;
  const msLeft = new Date(session.leave_by).getTime() - Date.now();
  const el = $("countdown");
  if (!el) return stopTimer();
  const over = msLeft < 0;
  const total = Math.abs(Math.floor(msLeft / 1000));
  const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
  const clock = `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  el.textContent = over ? `Over by ${clock}` : clock;
  el.classList.toggle("over", over);
  const span = new Date(session.leave_by).getTime() - new Date(session.started_at).getTime();
  const left = over || span <= 0 ? 0 : Math.min(1, msLeft / span);
  const ring = $("ring-fill");
  ring.setAttribute("stroke-dashoffset", (RING_C * (1 - left)).toFixed(1));
  ring.classList.toggle("over", over);
  $("countdown-text").textContent = over ? `Time is up. You are over by ${fmtDuration(Math.max(1, Math.round(total / 60)))}.` : `${fmtDuration(Math.max(1, Math.ceil(total / 60)))} left.`;

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
  const warn = $("car-warning");
  const area = state.areas.find((a) => a.area_id === Number($("car-area").value));
  const mins = Number($("car-minutes").value);
  if (!area) { warn.hidden = true; return; }
  const ev = evaluate(rulesFor(area.area_id), state.find.permitId, new Date().getDay(), nowHHMM());
  let msg = "";
  if (ev.kind === "no-permit") msg = `Heads up: your selected permit does not cover this area right now, so you could be ticketed.`;
  else if (ev.kind === "blocked") msg = `Heads up: ${ev.text.toLowerCase()} here.`;
  else if (ev.rule && ev.rule.max_stay_minutes && mins > ev.rule.max_stay_minutes) msg = `Heads up: this area has a ${fmtDuration(ev.rule.max_stay_minutes)} limit, shorter than ${fmtDuration(mins)}.`;
  warn.textContent = msg;
  warn.hidden = !msg;
}

// Called by the "Park here" button on Area details.
export function preselectArea(areaId) {
  if (state.activeSession) return;
  $("car-area").value = areaId;
  updateCarWarning();
}

async function onStart(e) {
  e.preventDefault();
  const btn = e.submitter;
  btn.disabled = true;
  try {
    state.activeSession = await sessions.startSession({
      areaId: Number($("car-area").value),
      minutes: Number($("car-minutes").value),
      reminderMinutes: Number($("car-reminder").value),
      carNote: $("car-note").value.trim(),
    });
    $("car-note").value = "";
    setStatus("Parking timer started.");
    renderCar();
    $("h-car").focus();
  } catch (err) {
    console.error(err);
    setStatus(`Could not start the timer: ${err.message}`, true);
  } finally {
    btn.disabled = false;
  }
}

async function onEnd(btn) {
  btn.disabled = true;
  try {
    const expired = Date.now() > new Date(state.activeSession.leave_by).getTime();
    await sessions.endSession(state.activeSession, expired);
    state.activeSession = null;
    setStatus(expired ? "Timer ended. You were over your planned time." : "Timer ended. Safe travels!");
    renderCar();
    $("h-car").focus();
  } catch (err) {
    console.error(err);
    setStatus(`Could not end the timer: ${err.message}`, true);
    btn.disabled = false;
  }
}

async function onSaveNote(e) {
  e.preventDefault();
  const btn = e.submitter;
  btn.disabled = true;
  try {
    state.activeSession = await sessions.saveCarNote(state.activeSession, $("note-edit").value.trim() || null);
    setStatus("Saved your car note.");
  } catch (err) {
    console.error(err);
    setStatus(`Could not save the note: ${err.message}`, true);
  } finally {
    btn.disabled = false;
  }
}

export function initCar() {
  $("car-area").addEventListener("change", updateCarWarning);
  $("car-minutes").addEventListener("change", updateCarWarning);
  document.addEventListener("submit", (e) => {
    if (e.target.id === "car-form") onStart(e);
    if (e.target.id === "note-form") onSaveNote(e);
  });
  document.addEventListener("click", (e) => {
    const end = e.target.closest("#end-session");
    if (end) onEnd(end);
  });
}
