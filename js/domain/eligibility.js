// Can this permit park in this area at this day and time?
// Pure functions: they take rule rows and return a result, so they can be unit tested
// without a browser or database (see tests/eligibility.test.js).
import { DAY_NAMES, toMinutes, fmtTime, fmtDuration } from "../lib/format.js";

export function ruleAppliesOnDay(rule, dayIdx) {
  const spec = rule.days_of_week.trim();
  if (/^all$/i.test(spec)) return true;
  return spec.split(",").some((part) => {
    const [a, b] = part.split("-").map((s) => DAY_NAMES.indexOf(s.trim().slice(0, 3)));
    if (a < 0 || (b !== undefined && b < 0)) return true; // unreadable: assume it applies (safer)
    if (b === undefined) return dayIdx === a;
    return a <= b ? dayIdx >= a && dayIdx <= b : dayIdx >= a || dayIdx <= b;
  });
}

export function inWindow(minutes, start, end) { // end exclusive; handles overnight windows
  return start <= end ? minutes >= start && minutes < end : minutes >= start || minutes < end;
}

export function ruleCoversTime(rule, minutes) { // start_time..end_time inclusive of 23:59
  return minutes >= toMinutes(rule.start_time) && minutes <= toMinutes(rule.end_time);
}

export function ruleBlocksTime(rule, minutes) {
  return Boolean(rule.blocked_start && rule.blocked_end && inWindow(minutes, toMinutes(rule.blocked_start), toMinutes(rule.blocked_end)));
}

// rules = every parking_rule row for one area.
// Returns { kind: ok | limit | no-permit | blocked | pick | unknown, icon, text, rule }.
export function evaluate(rules, permitId, dayIdx, hhmm) {
  const minutes = toMinutes(hhmm);
  const active = (rules || []).filter((r) => ruleAppliesOnDay(r, dayIdx) && ruleCoversTime(r, minutes));
  if (!active.length) return { kind: "unknown", icon: "?", text: "No rules on file for that time" };

  const mine = active.filter((r) => r.permit_id == null || r.permit_id === permitId);
  if (!mine.length) {
    return permitId == null
      ? { kind: "pick", icon: "?", text: "Choose a permit to check this area" }
      : { kind: "no-permit", icon: "✕", text: "Not covered by your permit" };
  }
  const usable = mine.filter((r) => !ruleBlocksTime(r, minutes));
  if (!usable.length) {
    const r = mine[0];
    return { kind: "blocked", icon: "✕", text: `No parking ${fmtTime(r.blocked_start)}–${fmtTime(r.blocked_end)}`, rule: r };
  }
  const best = usable.find((r) => !r.max_stay_minutes) || usable[0];
  const open = best.permit_id == null;
  if (best.max_stay_minutes) {
    return { kind: "limit", icon: "!", text: `${open ? "Open to everyone" : "Your permit works here"}, ${fmtDuration(best.max_stay_minutes)} limit`, rule: best };
  }
  return { kind: "ok", icon: "✓", text: open ? "Open to everyone" : "Your permit works here", rule: best };
}

// Sort order for the Areas list: usable areas first.
export const KIND_ORDER = { ok: 0, limit: 1, pick: 2, unknown: 3, blocked: 4, "no-permit": 5 };
