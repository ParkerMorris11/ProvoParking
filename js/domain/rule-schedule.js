// One non-overlapping day for all drivers. Database schedule ends are inclusive;
// display boundaries are exclusive (06:59 becomes “until 7 AM”).
import { evaluate, hasValidSchedule, ruleAppliesOnDay, ruleCoversTime, ruleBlocksTime } from "./eligibility.js";
import { toMinutes } from "../lib/format.js";

export function dailyRuleSchedule(rules = [], day) {
  if (!Number.isInteger(day) || day < 0 || day > 6) return [];
  const valid = rules.filter(r => hasValidSchedule(r) && ruleAppliesOnDay(r, day));
  const boundaries = new Set([0, 1440]);
  for (const r of valid) {
    boundaries.add(toMinutes(r.start_time));
    boundaries.add(toMinutes(r.end_time) + 1);
    if (r.blocked_start != null) {
      boundaries.add(toMinutes(r.blocked_start));
      boundaries.add(toMinutes(r.blocked_end));
    }
  }
  const times = [...boundaries].sort((a, b) => a - b);
  const segments = [];
  for (let i = 0; i < times.length - 1; i++) {
    const start = times[i], end = times[i + 1];
    if (start === end) continue;
    const active = valid.filter(r => ruleCoversTime(r, start));
    const hhmm = `${String(Math.floor(start / 60)).padStart(2, "0")}:${String(start % 60).padStart(2, "0")}`;
    const publicResult = evaluate(active, null, day, hhmm);
    let summary = { kind: "unknown", permitLimits: [], limitMinutes: null };
    if (publicResult.kind === "blocked" || active.length && active.every(r => ruleBlocksTime(r, start))) {
      summary.kind = "closed";
    } else if (["ok", "limit"].includes(publicResult.kind)) {
      summary = { kind: "open", permitLimits: [], limitMinutes: publicResult.rule?.max_stay_minutes ?? null };
    } else {
      const ids = [...new Set(active.filter(r => r.permit_id != null).map(r => r.permit_id))].sort((a,b) => a-b);
      const permitLimits = ids.flatMap(permitId => {
        const result = evaluate(active, permitId, day, hhmm);
        return ["ok", "limit"].includes(result.kind)
          ? [{ permitId, limitMinutes: result.rule?.max_stay_minutes ?? null }] : [];
      });
      if (permitLimits.length) summary = { kind: "permit", permitLimits, limitMinutes: null };
    }
    const key = JSON.stringify(summary);
    const previous = segments.at(-1);
    if (previous?.key === key && previous.end === start) previous.end = end;
    else segments.push({ start, end, ...summary, key });
  }
  return segments.map(({ key, ...segment }) => segment);
}

export function scheduleTime(minutes) {
  if (minutes === 0 || minutes === 1440) return "Midnight";
  const h = Math.floor(minutes / 60), m = minutes % 60;
  return `${h % 12 || 12}${m ? ":" + String(m).padStart(2, "0") : ""} ${h < 12 ? "AM" : "PM"}`;
}
