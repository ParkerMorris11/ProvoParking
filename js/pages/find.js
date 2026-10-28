// Page: Find — pick permit, arrival day and arrival time.
import { state } from "../state.js";
import { $, setStatus } from "../lib/dom.js";
import { DAY_NAMES, escapeHtml, fmtTime, nowHHMM } from "../lib/format.js";
import { savePermit } from "../lib/storage.js";

export function renderFind() {
  const sel = $("permit-select");
  sel.innerHTML = `<option value="">Choose a permit…</option>` +
    state.permits.map((p) => `<option value="${p.permit_id}">${escapeHtml(p.permit_code)} — ${escapeHtml(p.permit_name)}</option>`).join("");
  sel.value = state.find.permitId ?? "";
  $("arrive-day").value = String(state.find.day);
  $("arrive-time").value = state.find.time;
  renderPermitInfo();
}

function renderPermitInfo() {
  const p = state.permits.find((x) => x.permit_id === Number($("permit-select").value));
  $("permit-info").innerHTML = p
    ? `${escapeHtml(p.description || "")}${p.cost_note ? ` Cost: ${escapeHtml(p.cost_note)}.` : ""}` +
      (p.source_url ? ` <a href="${escapeHtml(p.source_url)}" target="_blank" rel="noopener">Source</a>${p.last_verified_on ? ` (checked ${escapeHtml(p.last_verified_on)})` : ""}` : "")
    : "";
}

export function initFind({ go }) {
  $("permit-select").addEventListener("change", renderPermitInfo);
  $("find-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const id = Number($("permit-select").value);
    if (!id) { setStatus("Choose your permit first so we can check which areas you can use.", true); $("permit-select").focus(); return; }
    state.find.permitId = id;
    state.find.day = Number($("arrive-day").value);
    state.find.time = $("arrive-time").value || nowHHMM();
    savePermit(id);
    setStatus(`Showing areas for ${DAY_NAMES[state.find.day]} at ${fmtTime(state.find.time)}.`);
    go("#areas");
  });
}
