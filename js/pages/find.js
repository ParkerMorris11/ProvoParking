// Page: Find — pick permit, arrival day and arrival time.
import { state } from "../state.js";
import { $, setStatus } from "../lib/dom.js";
import { DAY_NAMES, escapeHtml, fmtTime, nowHHMM } from "../lib/format.js";
import { savePermit } from "../lib/storage.js";
import { parkingSelection } from "../domain/parking-results.js";
import { requestParseFind, applyParsedToForm } from "../data/parse-find.js";
import { createSpeech } from "../lib/speech.js";

export function renderFind() {
  renderDestinationOptions("find-destination", state.find.destinationId, "No specific building");
  const sel = $("permit-select");
  sel.innerHTML = `<option value="">Choose a permit…</option>` +
    state.permits.map((p) => `<option value="${p.permit_id}">${escapeHtml(p.permit_code)} — ${escapeHtml(p.permit_name)}</option>`).join("");
  sel.value = state.find.permitId ?? "";
  const selection = parkingSelection(state.find);
  $("arrive-day").value = String(selection.day);
  $("arrive-time").value = selection.time;
  $("arrive-now").checked = Boolean(state.find.live);
  syncTimeControls();
  renderPermitInfo();
}

export function renderDestinationOptions(id, selected, placeholder = "Choose a BYU building…") {
  $(id).innerHTML = `<option value="">${escapeHtml(placeholder)}</option>` + state.destinations.map(d =>
    `<option value="${d.destination_id}">${escapeHtml(d.name)} (${escapeHtml(d.building_code)})</option>`).join("");
  $(id).value = selected ?? "";
}

export function syncTimeControls() {
  const live = $("arrive-now").checked;
  $("arrive-day").disabled = live;
  $("arrive-time").disabled = live;
}

function renderPermitInfo() {
  const p = state.permits.find((x) => x.permit_id === Number($("permit-select").value));
  $("permit-info").innerHTML = p
    ? `${escapeHtml(p.description || "")}${p.cost_note ? ` Cost: ${escapeHtml(p.cost_note)}.` : ""}` +
      (p.source_url ? ` <a href="${escapeHtml(p.source_url)}" target="_blank" rel="noopener">Source</a>${p.last_verified_on ? ` (checked ${escapeHtml(p.last_verified_on)})` : ""}` : "")
    : "";
}

// ---- Plain-language / voice search ---------------------------------------------------------------------
// Fills the form below and stops. The person reviews it and presses "Show parking areas" themselves.
function initPlainLanguage({ choosePermit }) {
  const form = $("nl-form"), input = $("nl-text"), mic = $("nl-mic"), go = $("nl-go"), status = $("nl-status");
  if (!form) return;
  const say = (message, warn = false) => { status.textContent = message; status.classList.toggle("warn", warn); };
  let busy = false;

  async function run(request) {
    if (busy) return;
    busy = true;
    go.disabled = true;
    say("Reading that…");
    try {
      const lists = { permits: state.permits, destinations: state.destinations };
      const parsed = await requestParseFind(state.db, request, lists);
      const els = { permit: $("permit-select"), destination: $("find-destination"), now: $("arrive-now"), day: $("arrive-day"), time: $("arrive-time") };
      const result = applyParsedToForm(parsed, els, { ...lists, choosePermit, getPermitId: () => state.find.permitId });
      syncTimeControls();
      renderPermitInfo();
      say([result.summary, ...result.warnings, "Check the fields below, then press Show parking areas."].join(" "), result.needsReview || result.warnings.length > 0);
    } catch (error) {
      say(error.message || "I couldn't read that. Use the form below.", true);
    } finally {
      busy = false;
      go.disabled = false;
      speech.done();
    }
  }

  const speech = createSpeech({
    onTranscript: (text, final) => { input.value = text; if (final && text) void run({ text }); },
    onAudio: (audio) => void run({ audio }),
    onError: (message) => say(message, true),
    onState: (next) => {
      mic.setAttribute("aria-pressed", String(next === "listening"));
      mic.setAttribute("aria-label", next === "listening" ? "Stop listening" : "Speak your trip");
      if (next === "listening") say("Listening… tap the microphone again when you're done.");
      else if (next === "processing") say("Reading that…");
    },
  });
  mic.hidden = speech.mode === "none";
  mic.addEventListener("click", () => speech.toggle());
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) { say("Type or say something like “class at 3 pm at the JKB with my current permit”.", true); input.focus(); return; }
    void run({ text });
  });
}

export function initFind({ go, choosePermit = () => {} }) {
  initPlainLanguage({ choosePermit });
  $("permit-select").addEventListener("change", renderPermitInfo);
  $("arrive-now").addEventListener("change", syncTimeControls);
  $("find-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const id = Number($("permit-select").value);
    if (!id) { setStatus("Choose your permit first so we can check which areas you can use.", true); $("permit-select").focus(); return; }
    // The building is optional here; the timer form still requires it before a timer can start.
    const destinationId = Number($("find-destination").value);
    state.find.destinationId = state.destinations.some(d => d.destination_id === destinationId) ? destinationId : null;
    if (state.find.destinationId) $("area-sort").value = "destination";
    state.find.permitId = id;
    state.find.live = $("arrive-now").checked;
    state.find.day = Number($("arrive-day").value);
    state.find.time = $("arrive-time").value || nowHHMM();
    savePermit(id);
    const selection = parkingSelection(state.find);
    setStatus(`Showing eligible areas ${selection.live ? "right now" : "for your planned arrival"}: ${DAY_NAMES[selection.day]} at ${fmtTime(selection.time)} (Provo time).`);
    go("#areas");
  });
}
