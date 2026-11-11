import { state } from "../state.js";
import { $ } from "../lib/dom.js";
import { escapeHtml } from "../lib/format.js";
import { byName, matchesQuery } from "../domain/area-list.js";
import { evaluateArea } from "../components/area-card.js";
import { facilitySummary } from "../domain/city-parking.js";
import { loadCitySnapshot } from "../data/city-snapshot.js";

const PAGE = 24;
let city = null, cityStatus = "idle", initialized = false;
let byuLimit = PAGE, cityLimit = PAGE;

function results() {
  const query = $("all-lots-search").value;
  const byu = state.areas.filter(a => a.operator === "BYU" && !a.is_sample_data && matchesQuery(a, query)).sort(byName);
  const facilities = (city || []).filter(s => matchesQuery({ area_name: s.name, lot_code: s.kind, operator: s.sourceLabel }, query));
  $("all-lots-count").textContent = `${byu.length} BYU ${byu.length === 1 ? "section" : "sections"} · ${cityStatus === "ready" ? `${facilities.length} city ${facilities.length === 1 ? "facility" : "facilities"}` : cityStatus === "error" ? "City facilities unavailable" : "Loading city facilities…"}`;
  $("all-byu-lots").innerHTML = byu.slice(0, byuLimit).map(area => `<li class="nearby-card">
    <h4>${escapeHtml(area.area_name)}</h4>
    <p class="nearby-description">${escapeHtml(evaluateArea(area).text)}</p>
    <a class="link" href="#area/${area.area_id}" aria-label="Rules &amp; details for ${escapeHtml(area.area_name)}">Rules &amp; details →</a>
  </li>`).join("") || '<li class="empty">No BYU sections match your search.</li>';
  $("all-city-lots").innerHTML = facilities.slice(0, cityLimit).map(s => `<li class="nearby-card">
    <h4>${escapeHtml(s.name)}</h4>
    <p class="nearby-description">${escapeHtml(s.kind)} · ${escapeHtml(s.hours)}</p>
    <p class="nearby-description">${escapeHtml(s.access || "City record; rules not verified")}</p>
    ${s.sourceUrl ? `<a class="link" href="${escapeHtml(s.sourceUrl)}" target="_blank" rel="noopener">Source: ${escapeHtml(s.sourceLabel)} ↗</a>` : ""}
  </li>`).join("") || (cityStatus === "ready" ? '<li class="empty">No city facilities match your search.</li>' : "");
  $("all-byu-more").hidden = byuLimit >= byu.length;
  $("all-city-more").hidden = cityLimit >= facilities.length;
}

export function renderAllLots() {
  if (!initialized) {
    initialized = true;
    $("all-lots-search").addEventListener("input", () => { byuLimit = cityLimit = PAGE; results(); });
    $("all-byu-more").addEventListener("click", () => { byuLimit += PAGE; results(); });
    $("all-city-more").addEventListener("click", () => { cityLimit += PAGE; results(); });
  }
  if (cityStatus === "idle" || cityStatus === "error") {
    cityStatus = "loading";
    void loadCitySnapshot().then(({ facilities, source }) => {
      city = facilities.map(feature => facilitySummary(feature, source)).sort((a, b) => a.name.localeCompare(b.name, "en", { numeric: true }));
      cityStatus = "ready";
    }, () => { cityStatus = "error"; }).then(results);
  }
  results();
}
