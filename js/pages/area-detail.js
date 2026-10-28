// Page: Area details — plain-language rules, sources, tow contact, Park here.
import { state, rulesFor } from "../state.js";
import { $ } from "../lib/dom.js";
import { DAY_NAMES, escapeHtml, fmtTime, fmtDuration, toMinutes, timeAgo, directionsUrl } from "../lib/format.js";
import { availabilityText, evaluateArea, heartHtml } from "../components/area-card.js";

function groupRules(rules) {
  const groups = new Map();
  for (const r of rules) {
    const key = [r.days_of_week, r.start_time, r.end_time, r.max_stay_minutes, r.blocked_start, r.blocked_end, r.permit_id == null].join("|");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }
  return [...groups.values()];
}

function ruleGroupHtml(group) {
  const r = group[0];
  const open = r.permit_id == null;
  const codes = group.map((g) => state.permits.find((p) => p.permit_id === g.permit_id)?.permit_code).filter(Boolean);
  const days = /^all$/i.test(r.days_of_week.trim()) ? "Every day" : r.days_of_week;
  const hours = toMinutes(r.start_time) === 0 && toMinutes(r.end_time) >= 1439 ? "all day" : `${fmtTime(r.start_time)}–${fmtTime(r.end_time)}`;
  const bullets = [];
  bullets.push(open ? "Open to everyone." : `Valid permits: ${codes.map(escapeHtml).join(", ")}.`);
  if (r.blocked_start && r.blocked_end) bullets.push(`No parking ${fmtTime(r.blocked_start)}–${fmtTime(r.blocked_end)}.`);
  bullets.push(r.max_stay_minutes ? `Time limit: ${fmtDuration(r.max_stay_minutes)}.` : "No time limit listed.");
  if (group.length === 1 && r.rule_note) bullets.push(escapeHtml(r.rule_note));
  return `
    <li class="rule">
      <p class="rule-when">${escapeHtml(days)}, ${escapeHtml(hours)}</p>
      <ul>${bullets.map((b) => `<li>${b}</li>`).join("")}</ul>
      <p class="hint"><a href="${escapeHtml(r.source_url)}" target="_blank" rel="noopener">Source</a> · checked ${escapeHtml(r.last_verified_on)}</p>
    </li>`;
}

export function renderAreaDetail(areaId) {
  const area = state.areas.find((a) => a.area_id === areaId);
  const box = $("area-detail");
  if (!area) {
    box.innerHTML = `<h2 id="h-area" tabindex="-1">Area not found</h2><p class="empty">That parking area does not exist. Go back to the list.</p>`;
    return;
  }
  const avail = availabilityText(area);
  const ev = evaluateArea(area);
  const tow = state.towById.get(area.tow_company_id);
  const groups = groupRules(rulesFor(area.area_id));
  box.innerHTML = `
    <div class="detail-head">
      <div>
        <h2 id="h-area" tabindex="-1">${escapeHtml(area.area_name)}</h2>
        <p class="meta">${escapeHtml(area.operator)}${area.lot_code ? ` · ${escapeHtml(area.lot_code)}` : ""}${area.is_free ? " · Free" : ""}</p>
      </div>
      ${heartHtml(area)}
    </div>
    <p class="elig ${ev.kind} big"><span aria-hidden="true">${ev.icon}</span> ${escapeHtml(ev.text)}
      <span class="when">(${DAY_NAMES[state.find.day]} ${fmtTime(state.find.time)})</span></p>
    <p class="avail ${avail.cls}">${avail.text}. Updated ${timeAgo(area.availability_updated_at)}. A valid permit does not guarantee an open space.</p>

    <h3>Rules</h3>
    ${groups.length ? `<ul class="rules">${groups.map(ruleGroupHtml).join("")}</ul>` : `<p class="empty">No rules on file for this area yet.</p>`}

    <h3>If you are towed</h3>
    <p>${tow ? `${escapeHtml(tow.company_name)}: <a href="tel:${escapeHtml(tow.phone.replace(/[^\d+]/g, ""))}">${escapeHtml(tow.phone)}</a>${tow.is_sample_data ? " (sample number, not real)" : ""}` : "No tow company on file."}</p>

    <div class="actions">
      <button type="button" class="primary" data-park-area="${area.area_id}">Park here — start timer</button>
      <a class="secondary" href="${directionsUrl(area)}" target="_blank" rel="noopener">Walking directions (sample location)</a>
    </div>`;
}
