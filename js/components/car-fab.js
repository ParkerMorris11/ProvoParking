// Floating car button. A small blue bubble with a white car icon; while a parking timer is
// running it turns into an oval pill showing the time left as h:mm. Tapping it opens the
// parking timer sheet (#car). The countdown comes from the saved leave_by, like the sheet's.
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

let lastKey = "";

export function renderCarFab() {
  const fab = $("car-fab");
  const time = $("car-fab-time");
  if (!fab || !time) return;
  const session = state.activeSession;
  if (!session) {
    if (lastKey !== "idle") {
      lastKey = "idle";
      fab.classList.remove("running", "soon", "over");
      time.hidden = true;
      time.textContent = "";
      fab.setAttribute("aria-label", "Parking timer: start a timer");
    }
    return;
  }
  const msLeft = new Date(session.leave_by).getTime() - Date.now();
  const text = fmtHourMinute(msLeft);
  const over = msLeft < 0;
  const soon = !over && msLeft <= session.reminder_minutes_before * 60000;
  const key = `${text}|${over}|${soon}`;
  if (key === lastKey) return; // nothing visible changed since the last second
  lastKey = key;
  fab.classList.add("running");
  fab.classList.toggle("soon", soon);
  fab.classList.toggle("over", over);
  time.hidden = false;
  time.textContent = text;
  const minutes = Math.max(1, over ? Math.floor(-msLeft / 60000) : Math.ceil(msLeft / 60000));
  fab.setAttribute("aria-label", over
    ? `Parking timer: time is up, over by ${fmtDuration(minutes)}. Open details.`
    : `Parking timer: ${fmtDuration(minutes)} left. Open details.`);
}

export function initCarFab({ go }) {
  $("car-fab").addEventListener("click", () => go("#car"));
  renderCarFab();
  // One light tick for the whole app; it only touches the page when the h:mm text changes.
  setInterval(renderCarFab, 1000);
}
