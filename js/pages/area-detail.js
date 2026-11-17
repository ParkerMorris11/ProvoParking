// Page: Area details — parking status, 24-hour rules timeline, sources, tow contact, Park here.
import { state, rulesFor } from "../state.js";
import { $ } from "../lib/dom.js";
import { DAY_NAMES, escapeHtml, fmtTime, timeAgo, directionsUrl, appleDirectionsUrl, deviceDirections } from "../lib/format.js";
import { availabilityText, evaluateArea, heartHtml, DIRECTIONS_ICON } from "../components/area-card.js";
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
  return sources.size ? `<ul class="detail-sources">${[...sources.values()].map((r) => {
    const label = r.source_url.includes("security.byu.edu") ? "BYU parking regulations" : r.source_url.includes("arcgis.com") ? "Official lot map record" : "Parking rule source";
    return `<li><a href="${escapeHtml(r.source_url)}" target="_blank" rel="noopener">${label} <span aria-hidden="true">↗</span><span class="sr-text"> (opens in a new tab)</span></a><span>Recorded check: ${escapeHtml(r.last_verified_on || "not recorded")}</span></li>`;
  }).join("")}</ul>` : '<p class="hint">No source links on file.</p>';
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
  const directions = directionsUrl(area, "driving");
  const appleDirections = appleDirectionsUrl(area, "driving");
  const quickDirections = area.is_sample_data ? null : deviceDirections(area, "driving");
  const selection = parkingSelection(state.find);
  const tow = state.towById.get(area.tow_company_id);
  const rules = rulesFor(area.area_id);
  if (dayChoice.areaId !== areaId) dayChoice = { areaId, day: null };
  const day = dayChoice.day ?? selection.day;
  const controls = [...(box.querySelectorAll?.("a,button,select,summary") || [])];
  const focusIndex = controls.indexOf(document.activeElement);
  const disclosures = [...(box.querySelectorAll?.("details") || [])].map((el) => el.open);
  const byu = area.operator === "BYU" && !area.is_sample_data;
  box.innerHTML = `
    <div class="detail-head">
      <div>
        <h2 id="h-area" tabindex="-1">${escapeHtml(area.area_name)}</h2>
        <p class="meta">${escapeHtml(area.operator)}${area.lot_code ? ` · ${escapeHtml(area.lot_code)}` : ""}${area.is_free ? " · Free" : ""}${area.section_note ? ` · ${escapeHtml(area.section_note)}` : ""}</p>
      </div>
      <div class="detail-head-actions">
        ${quickDirections ? `<a class="icon-btn directions-btn" href="${escapeHtml(quickDirections.url)}" target="_blank" rel="noopener" aria-label="Directions to ${escapeHtml(area.area_name)} in ${quickDirections.app} (opens in a new tab)">${DIRECTIONS_ICON}</a>` : ""}
        ${heartHtml(area)}
      </div>
    </div>
    <p class="elig ${ev.kind} big"><span aria-hidden="true">${ev.icon}</span> ${escapeHtml(ev.text)}
      <span class="when">(${DAY_NAMES[selection.day]} ${fmtTime(selection.time)} · Provo time)</span></p>
    <p class="avail ${avail.cls}">${avail.cls ? `${avail.text}.${area.availability_updated_at ? ` Updated ${timeAgo(area.availability_updated_at)}.` : ""}` : "Open spaces unknown."}</p>

    <div class="actions detail-primary-actions">
      ${!area.is_sample_data ? `<a class="primary" href="#car/${area.area_id}">Park here · set timer</a>` : ""}
      ${quickDirections ? `<a class="secondary" href="${escapeHtml(quickDirections.url)}" target="_blank" rel="noopener">Directions · ${escapeHtml(quickDirections.app)}</a>` : ""}
    </div>
    <section class="detail-schedule" aria-labelledby="detail-schedule-title">
      <div class="schedule-heading"><div><h3 id="detail-schedule-title">24-hour rules</h3></div>
        <div class="schedule-day-control"><label for="rules-day">Day</label><select id="rules-day">${fullDays.map((name, i) => `<option value="${i}"${i === day ? " selected" : ""}>${name}</option>`).join("")}</select></div>
      </div>
      <div id="rules-day-schedule">${ruleScheduleHtml(rules, day, state.permits)}</div>
    </section>

    <details class="detail-source-disclosure"><summary>Sources and fine print</summary>
      ${byu ? '<p class="schedule-footnote">Regular fall/winter week. Unverified periods are not permission to park. Specialty stalls, events, holidays, finals and breaks may have different rules. Vehicle must be registered and active.</p>' : '<p class="schedule-footnote">Based on the rules recorded for this area. Check posted signs.</p>'}
      ${sourcesHtml(rules)}
      ${byu ? '<p><a href="https://security.byu.edu/parking-regulations" target="_blank" rel="noopener">BYU permit and overnight regulations</a> · <a href="https://map.byu.edu/?layer=parking" target="_blank" rel="noopener">Official campus parking map</a></p>' : ""}
    </details>

    <details class="detail-source-disclosure"><summary>Towing information</summary>
    <p>${tow ? `${escapeHtml(tow.company_name)}: <a href="tel:${escapeHtml(tow.phone.replace(/[^\d+]/g, ""))}">${escapeHtml(tow.phone)}</a>${tow.is_sample_data ? " (sample number, not real)" : ""}` : "No tow company on file."}</p></details>

    <details class="detail-source-disclosure"><summary>Other directions options</summary><div class="actions detail-more-directions">
      ${directions ? `<a class="secondary" href="${escapeHtml(directions)}" target="_blank" rel="noopener">${area.is_sample_data ? "Driving directions (sample location)" : "Driving directions · Google Maps"}</a><a class="secondary directions-apple" href="${escapeHtml(appleDirections)}" target="_blank" rel="noopener">Apple Maps</a>` : `<p class="hint">Directions unavailable — this lot has no valid map location.</p>`}
    </div></details>`;
  $("rules-day").addEventListener("change", (event) => {
    dayChoice.day = Number(event.target.value);
    renderAreaDetail(areaId);
    $("rules-day").focus({ preventScroll: true });
  });
  [...(box.querySelectorAll?.("details") || [])].forEach((el, index) => { el.open = disclosures[index] ?? false; });
  if (focusIndex >= 0) box.querySelectorAll("a,button,select,summary")[focusIndex]?.focus({ preventScroll: true });
}
