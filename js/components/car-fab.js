// Floating car button. A small blue bubble with a white car icon; while a parking timer is
// running it turns into an oval pill showing the time left as h:mm. Tapping it opens the
// parking timer sheet (#car). The countdown comes from the saved leave_by, like the sheet's.
import { parkingNow } from "../lib/server-clock.js";
import { state } from "../state.js";
import { $ } from "../lib/dom.js";
import { fmtDuration } from "../lib/format.js";

// h:mm of the same countdown the timer sheet shows in h:mm:ss, so both agree at every moment:
// 3:59:21 on the sheet is 3:59 here. Whole minutes only, rounded down. Past leave_by it counts
// the overage with a minus sign ("-0:12").
export function fmtHourMinute(msLeft) {
  const over = msLeft < 0;
  const minutes = Math.floor(Math.abs(msLeft) / 60000);
  const text = `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`;
  return over && minutes > 0 ? `-${text}` : text;
}

/**
 * What the floating pill shows. While time is left: h:mm. Once leave_by has passed by a full minute
 * the pill says "Time's up" instead of counting a negative number forever (a timer left running for
 * days used to read "-146:28"). The exact overage stays in the accessible label and the timer sheet.
 */
export function fabText(msLeft) {
  return msLeft <= -60000 ? "Time's up" : fmtHourMinute(Math.max(0, msLeft));
}

/** Spoken label for the pill. `msLeft` is negative once leave_by has passed. */
export function fabLabel(msLeft) {
  if (msLeft < 0) {
    const minutes = Math.max(1, Math.floor(-msLeft / 60000));
    return `Parking timer: time is up, ended ${fmtDuration(minutes)} ago. Open to end the timer.`;
  }
  return `Parking timer: ${fmtDuration(Math.max(1, Math.ceil(msLeft / 60000)))} left. Open details.`;
}

let lastKey = "";

export function renderCarFab() {
  const fab = $("car-fab");
  const time = $("car-fab-time");
  if (!fab || !time) return;
  const session = state.activeSession;
  if (!session) {
    if (lastKey !== "idle") {
      lastKey = "idle";
      fab.hidden = true; // no timer: nothing floats over the map
      fab.classList.remove("running", "soon", "over");
      time.hidden = true;
      time.textContent = "";
      fab.setAttribute("aria-label", "Parking timer: start a timer");
    }
    return;
  }
  const msLeft = new Date(session.leave_by).getTime() - parkingNow();
  const text = fabText(msLeft);
  const over = msLeft < 0;
  const soon = !over && msLeft <= session.reminder_minutes_before * 60000;
  // Over-time labels change every minute even though the pill text stays "Time's up".
  const key = `${text}|${over}|${soon}|${over ? Math.floor(-msLeft / 60000) : ""}`;
  if (key === lastKey) return; // nothing visible changed since the last second
  lastKey = key;
  fab.hidden = false;
  fab.classList.add("running");
  fab.classList.toggle("soon", soon);
  fab.classList.toggle("over", over);
  time.hidden = false;
  time.textContent = text;
  fab.setAttribute("aria-label", fabLabel(msLeft));
}

// The idle car button stays off the map (2026-11-16 decision); the pill appears only while a timer runs.
export function initCarFab({ go }) {
  const fab = $("car-fab");
  if (!fab) return;
  fab.addEventListener("click", () => go("#car"));
  renderCarFab();
  // One light tick for the whole app; it only touches the page when the h:mm text changes.
  setInterval(renderCarFab, 1000);
}
