// Page: Area details. Top to bottom: lot name with directions + favorite, a colored status pill and time,
// a short grid of key facts, Park here, then the 24-hour rules timeline, sources and towing.
import { state, rulesFor } from "../state.js";
import { $ } from "../lib/dom.js";
import { DAY_NAMES, escapeHtml, fmtTime, timeAgo, deviceDirections } from "../lib/format.js";
import { availabilityText, evaluateArea, heartHtml, DIRECTIONS_ICON } from "../components/area-card.js";
import { parkingSelection } from "../domain/parking-results.js";
import { ruleScheduleHtml } from "../components/rule-schedule.js";
import { backTarget, lotFacts } from "../domain/lot-facts.js";
import { areaPoint } from "../domain/area-list.js";

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

// Short status for the pill; the full sentence (ev.text) stays in the pill for screen readers and tests.
const PILL_ICON = { ok: "✓", limit: "!", "no-permit": "✕", blocked: "✕", pick: "?", unknown: "?" };

function factsHtml(facts, area) {
  const rows = [];
  // Just the one permit this lot is for (e.g. Y in a Y lot); higher permits that also work are not listed.
  if (facts.permit) {
    const p = facts.permit, name = String(p.name || "").replace(new RegExp(`^${p.code}\\s+`), "");
    rows.push(["Permit", `<span class="fact-permit" title="${escapeHtml(p.name || p.code)}"><span class="permit-swatch" style="background:${p.color}" aria-hidden="true"></span><strong>${escapeHtml(p.code)}</strong>${name && name !== p.code ? ` <span class="fact-sub">${escapeHtml(name)}</span>` : ""}</span>`]);
  }
  rows.push(["Permit hours", facts.permitHours ? escapeHtml(facts.permitHours) : "None listed this day"]);
  if (facts.closedHours) rows.push(["No parking", escapeHtml(facts.closedHours)]);
  if (facts.distance) rows.push(["Distance", `${escapeHtml(facts.distance.text)} <span class="fact-sub">${escapeHtml(facts.distance.from)}</span>`]);
  if (facts.section) rows.push(["Section", `${facts.section.index} of ${facts.section.total}${facts.section.near ? ` <span class="fact-sub">near ${escapeHtml(facts.section.near)}</span>` : ""}`]);
  rows.push(["Cost", facts.free ? "Free with a valid permit" : area.is_sample_data ? "Sample data" : "Check posted signs"]);
  return `<dl class="lot-facts">${rows.map(([k, v]) => `<div class="lot-fact"><dt>${k}</dt><dd>${v}</dd></div>`).join("")}</dl>`;
}

export function renderAreaDetail(areaId) {
  const area = state.areas.find((a) => a.area_id === areaId);
  const box = $("area-detail");
  // The back link names the screen the lot was opened from (Favorites, results, All Lots, or the map).
  const back = $("area-back");
  if (back && back !== box && typeof back.setAttribute === "function") {
    const target = backTarget(state.lotOrigin);
    back.setAttribute("href", target.href);
    back.textContent = `← ${target.label}`;
  }
  if (!area) {
    box.innerHTML = `<h2 id="h-area" tabindex="-1">Area not found</h2><p class="empty">That parking area does not exist. Go back to the list.</p>`;
    return;
  }
  const avail = availabilityText(area);
  const ev = evaluateArea(area);
  // One directions control, next to the heart: Apple Maps on iPhone/iPad, Google Maps elsewhere.
  const quickDirections = area.is_sample_data ? null : deviceDirections(area, "driving");
  const selection = parkingSelection(state.find);
  const tow = state.towById.get(area.tow_company_id);
  const rules = rulesFor(area.area_id);
  const sameLot = dayChoice.areaId === areaId;
  if (!sameLot) dayChoice = { areaId, day: null };
  const day = dayChoice.day ?? selection.day;
  const controls = [...(box.querySelectorAll?.("a,button,select,summary") || [])];
  const focusIndex = controls.indexOf(document.activeElement);
  const disclosures = sameLot ? [...(box.querySelectorAll?.("details") || [])].map((el) => el.open) : [];
  const byu = area.operator === "BYU" && !area.is_sample_data;
  const building = (state.destinations || []).find(d => d.destination_id === state.find.destinationId) || state.find.customDestination;
  const facts = lotFacts({ area, rules, permits: state.permits || [], day: selection.day, position: state.lastPosition, destination: building ? { point: areaPoint(building), name: building.name } : null });
  box.innerHTML = `
    <div class="detail-head">
      <div class="detail-title">
        <p class="mobile-detail-label">Lot details</p>
        <h2 id="h-area" tabindex="-1">${escapeHtml(area.area_name)}</h2>
        <p class="meta">${escapeHtml(area.operator)}${area.lot_code ? ` · Lot ${escapeHtml(area.lot_code)}` : ""}</p>
      </div>
      <div class="detail-head-actions">
        ${heartHtml(area)}
      </div>
    </div>
    <div class="detail-status-row">
      <p class="elig status-pill ${ev.kind}"><span class="pill-icon" aria-hidden="true">${PILL_ICON[ev.kind] || ev.icon}</span><span>${escapeHtml(ev.text)}</span></p>
      <p class="when">${DAY_NAMES[selection.day]} ${fmtTime(selection.time)} · Provo time</p>
    </div>
    ${facts.distance ? `<p class="detail-distance">${escapeHtml(facts.distance.text)} ${escapeHtml(facts.distance.from)}</p>` : ""}
    ${!area.is_sample_data ? `<div class="actions detail-primary-actions">
      ${quickDirections ? `<a class="primary directions-btn" href="${escapeHtml(quickDirections.url)}" target="_blank" rel="noopener" aria-label="Directions to ${escapeHtml(area.area_name)} in ${quickDirections.app} (opens in a new tab)">${DIRECTIONS_ICON} Directions</a>` : ""}
      <a class="secondary" href="#car/${area.area_id}">Park here</a>
    </div>` : ""}

    <details class="lot-rules">
    <summary>Parking rules</summary>
    ${factsHtml(facts, area)}
    <p class="avail detail-avail ${avail.cls}">${avail.text}.${area.availability_updated_at ? ` Updated ${timeAgo(area.availability_updated_at)}.` : ""} A valid permit does not guarantee an open space.</p>

    <section class="detail-schedule" aria-labelledby="detail-schedule-title">
      <div class="schedule-heading"><div><p class="detail-eyebrow">Ordinary parking stalls</p><h3 id="detail-schedule-title">24-hour parking rules</h3></div>
        <div class="schedule-day-control"><label for="rules-day">Day</label><select id="rules-day">${fullDays.map((name, i) => `<option value="${i}"${i === day ? " selected" : ""}>${name}</option>`).join("")}</select></div>
      </div>
      <p class="schedule-intro">Rules for this day, from midnight to midnight. This is not live space availability.</p>
      <div id="rules-day-schedule">${ruleScheduleHtml(rules, day, state.permits)}</div>
      ${byu ? '<p class="schedule-footnote">Regular fall/winter week. Unverified periods are not permission to park. Specialty stalls, events, holidays, finals and breaks may have different rules. Vehicle must be registered and active.</p>' : '<p class="schedule-footnote">Based on the rules recorded for this area. Check posted signs.</p>'}
    </section>

    <details class="detail-source-disclosure"><summary>Sources and verification</summary>
      ${sourcesHtml(rules)}
      ${byu ? '<p><a href="https://security.byu.edu/parking-regulations" target="_blank" rel="noopener">BYU permit and overnight regulations</a> · <a href="https://map.byu.edu/?layer=parking" target="_blank" rel="noopener">Official campus parking map</a></p>' : ""}
    </details>

    <details class="detail-source-disclosure"><summary>Towing information</summary>
    <p>${tow ? `${escapeHtml(tow.company_name)}: <a href="tel:${escapeHtml(tow.phone.replace(/[^\d+]/g, ""))}">${escapeHtml(tow.phone)}</a>${tow.is_sample_data ? " (sample number, not real)" : ""}` : "No tow company on file."}</p></details>
    </details>`;
  $("rules-day").addEventListener("change", (event) => {
    dayChoice.day = Number(event.target.value);
    renderAreaDetail(areaId);
    $("rules-day").focus({ preventScroll: true });
  });
  const desktop = globalThis.window?.matchMedia?.("(min-width: 601px)").matches;
  [...(box.querySelectorAll?.("details") || [])].forEach((el, index) => { el.open = disclosures[index] ?? Boolean(desktop && index === 0); });
  if (focusIndex >= 0) box.querySelectorAll("a,button,select,summary")[focusIndex]?.focus({ preventScroll: true });
}
