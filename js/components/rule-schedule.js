import { dailyRuleSchedule, scheduleTime } from "../domain/rule-schedule.js";
import { escapeHtml, fmtDuration } from "../lib/format.js";

export function scheduleSummary(segment, permits) {
  const code = id => permits.find(p => p.permit_id === id)?.permit_code || `Permit #${id}`;
  if (segment.kind === "closed") return { title: "No parking", detail: "Closed to ordinary parking, including permit holders.", icon: "×" };
  if (segment.kind === "unknown") return { title: "Not verified", detail: "This app has no confirmed parking permission for these hours. Check the official rules and signs.", icon: "?" };
  if (segment.kind === "open") return { title: "No permit restriction listed", detail: segment.limitMinutes ? `Posted rules apply · ${fmtDuration(segment.limitMinutes)} limit.` : "Ordinary stalls only. Check posted signs.", icon: "✓" };
  const codes = segment.permitLimits.map(p => code(p.permitId)).join(", ");
  const limits = segment.permitLimits.filter(p => p.limitMinutes).map(p => `${code(p.permitId)}: ${fmtDuration(p.limitMinutes)} limit`).join("; ");
  return { title: "Permit required", detail: `Accepted: ${codes}. Vehicle registration and active privileges required.${limits ? " " + limits + "." : ""}`, icon: "P" };
}

export function ruleScheduleHtml(rules, day, permits) {
  const segments = dailyRuleSchedule(rules, day);
  if (!segments.length) return '<p class="empty">Choose a day to see the schedule.</p>';
  return `
    <div class="day-strip" aria-hidden="true">${segments.map(s => `<span class="day-strip-segment schedule-${s.kind}" style="flex-grow:${s.end-s.start}"></span>`).join("")}</div>
    <div class="day-scale" aria-hidden="true"><span>12 AM</span><span>6 AM</span><span>12 PM</span><span>6 PM</span><span>12 AM</span></div>
    <p class="schedule-boundary-note">Each period ends when the next begins. All times are Provo time.</p>
    <ol class="day-periods">${segments.map(s => {
      const summary = scheduleSummary(s, permits);
      return `<li class="day-period schedule-${s.kind}">
        <p class="day-period-time">${scheduleTime(s.start)} <span aria-hidden="true">–</span><span class="sr-text">to</span> ${scheduleTime(s.end)}${s.end === 1440 ? '<span class="sr-text">, next day</span>' : ""}</p>
        <div class="day-period-description"><span class="period-icon" aria-hidden="true">${summary.icon}</span><div><p class="day-period-title">${summary.title}</p><p class="day-period-note">${escapeHtml(summary.detail)}</p></div></div>
      </li>`;
    }).join("")}</ol>`;
}
