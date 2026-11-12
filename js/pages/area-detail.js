// Lot details: personal status first, followed by the same daily rules for every driver.
import { state, rulesFor } from "../state.js";
import { $ } from "../lib/dom.js";
import { DAY_NAMES, escapeHtml, fmtTime, timeAgo, directionsUrl } from "../lib/format.js";
import { availabilityText, heartHtml } from "../components/area-card.js";
import { evaluate } from "../domain/eligibility.js";
import { parkingSelection } from "../domain/parking-results.js";
import { ruleScheduleHtml } from "../components/rule-schedule.js";

let dayChoice = { areaId: null, day: null };
const fullDays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function sourcesHtml(rules) {
  const sources = new Map();
  for (const rule of rules) {
    if (!/^https?:\/\//i.test(rule.source_url || "")) continue;
    const key = `${rule.source_url}|${rule.last_verified_on}`;
    if (!sources.has(key)) sources.set(key, rule);
  }
  return sources.size ? `<ul class="detail-sources">${[...sources.values()].map(r => {
    const label = r.source_url.includes("security.byu.edu") ? "BYU parking regulations" : r.source_url.includes("arcgis.com") ? "Official lot map record" : "Parking rule source";
    return `<li><a href="${escapeHtml(r.source_url)}" target="_blank" rel="noopener">${label} <span aria-hidden="true">↗</span><span class="sr-text"> (opens in a new tab)</span></a><span>Recorded check: ${escapeHtml(r.last_verified_on || "not recorded")}</span></li>`;
  }).join("")}</ul>` : '<p class="hint">No source links on file.</p>';
}

export function renderAreaDetail(areaId) {
  const area = state.areas.find(a => a.area_id === areaId);
  const box = $("area-detail");
  if (!area) {
    box.innerHTML = '<h2 id="h-area" tabindex="-1">Area not found</h2><p class="empty">That parking area does not exist. Go back to the list.</p>';
    return;
  }
  const selection = parkingSelection(state.find);
  const rules = rulesFor(area.area_id);
  const ev = evaluate(rules, selection.permitId, selection.day, selection.time);
  const permit = state.permits.find(p => p.permit_id === selection.permitId);
  const canPark = ["ok", "limit"].includes(ev.kind);
  const cannotPark = ["blocked", "no-permit"].includes(ev.kind);
  const title = canPark ? "You can park at this time" : cannotPark ? "You cannot park at this time" : ev.kind === "pick" ? "Choose a permit to check" : "Parking eligibility not verified";
  const avail = availabilityText(area);
  const directions = directionsUrl(area);
  const tow = state.towById.get(area.tow_company_id);
  if (dayChoice.areaId !== areaId) dayChoice = { areaId, day: null };
  const day = dayChoice.day ?? selection.day;
  const controls = [...(box.querySelectorAll?.("a,button,select,summary") || [])];
  const focusIndex = controls.indexOf(document.activeElement);
  const disclosures = [...(box.querySelectorAll?.("details") || [])].map(el => el.open);
  const byu = area.operator === "BYU" && !area.is_sample_data;
  box.innerHTML = `
    <div class="detail-head">
      <div><h2 id="h-area" tabindex="-1">${escapeHtml(area.area_name)}</h2>
        <p class="meta">${escapeHtml(area.operator)}${area.lot_code ? ` · ${escapeHtml(area.lot_code)}` : ""}${area.is_free ? " · Free" : ""}</p>
      </div>${heartHtml(area)}
    </div>
    <section class="detail-status ${canPark ? "status-allowed" : cannotPark ? "status-denied" : "status-unknown"}" aria-labelledby="detail-status-title">
      <p class="detail-eyebrow">Your parking status</p>
      <h3 id="detail-status-title"><span aria-hidden="true">${ev.icon}</span> ${title}</h3>
      <p class="detail-status-context">${selection.live ? "Right now" : "Planned arrival"} · ${DAY_NAMES[selection.day]} ${fmtTime(selection.time)} · Provo time${permit ? ` · ${escapeHtml(permit.permit_code)} permit` : " · No permit selected"}</p>
      <p>${escapeHtml(ev.text)}${canPark ? ". Based on the listed rules; confirm signs before parking." : "."}</p>
      <a href="#find" class="detail-status-link">Change permit or arrival time</a>
    </section>
    <div class="detail-layout">
      <section class="detail-schedule" aria-labelledby="detail-schedule-title">
        <div class="schedule-heading"><div><p class="detail-eyebrow">Ordinary parking stalls</p><h3 id="detail-schedule-title">24-hour parking rules</h3></div>
          <div class="schedule-day-control"><label for="rules-day">Day</label><select id="rules-day">${fullDays.map((name,i) => `<option value="${i}"${i === day ? " selected" : ""}>${name}</option>`).join("")}</select></div>
        </div>
        <p class="schedule-intro">Same schedule for every driver. Permit requirements are listed below.</p>
        <div id="rules-day-schedule">${ruleScheduleHtml(rules, day, state.permits)}</div>
        ${byu ? '<p class="schedule-footnote">Regular fall/winter week. Unverified periods are not permission to park. Specialty stalls, events, holidays, finals and breaks may have different rules.</p>' : '<p class="schedule-footnote">Based on the rules recorded for this area. Check posted signs.</p>'}
      </section>
      <aside class="detail-reference" aria-labelledby="detail-reference-title">
        <h3 id="detail-reference-title">Before you park</h3>
        <p class="avail ${avail.cls}">${avail.text}.${area.availability_updated_at ? ` Updated ${timeAgo(area.availability_updated_at)}.` : ""} A matching permit does not guarantee a space.</p>
        ${byu ? '<p>BYU students, faculty and staff must keep their vehicle registered and active. Posted signs and special restrictions apply.</p><p>The overnight closure covers ordinary non-housing parking. BYU vehicles, housing lots and approved exceptions have separate rules.</p>' : ""}
        <p>Coordinates mark an approximate location, not a verified entrance or stall.</p>
        <div class="detail-actions">
          ${!area.is_sample_data ? `<a class="primary" href="#car/${area.area_id}">Set up parking timer</a>` : ""}
          ${directions ? `<a class="secondary" href="${escapeHtml(directions)}" target="_blank" rel="noopener">Get directions <span aria-hidden="true">↗</span><span class="sr-text"> (opens in a new tab)</span></a>` : '<p class="hint">Directions unavailable for this location.</p>'}
        </div>
        <details class="detail-source-disclosure"><summary>Sources and verification</summary>
          ${sourcesHtml(rules)}
          ${byu ? '<p><a href="https://map.byu.edu/?layer=parking" target="_blank" rel="noopener">Official campus parking map ↗</a></p>' : ""}
        </details>
        <details class="detail-source-disclosure"><summary>If you are towed</summary><p>${tow ? `${escapeHtml(tow.company_name)}: <a href="tel:${escapeHtml(tow.phone.replace(/[^\d+]/g, ""))}">${escapeHtml(tow.phone)}</a>${tow.is_sample_data ? " (sample number, not real)" : ""}` : "No tow company on file."}</p></details>
      </aside>
    </div>`;
  $("rules-day").addEventListener("change", event => {
    dayChoice.day = Number(event.target.value);
    renderAreaDetail(areaId);
    $("rules-day").focus({ preventScroll: true });
  });
  [...(box.querySelectorAll?.("details") || [])].forEach((el, index) => { el.open = disclosures[index] ?? false; });
  if (focusIndex >= 0) box.querySelectorAll("a,button,select,summary")[focusIndex]?.focus({ preventScroll: true });
}
