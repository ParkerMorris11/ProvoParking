// Page: Find — pick permit, arrival day and arrival time.
import { state } from "../state.js";
import { $, setStatus } from "../lib/dom.js";
import { DAY_NAMES, escapeHtml, fmtTime, nowHHMM } from "../lib/format.js";
import { savePermit } from "../lib/storage.js";
import { parkingSelection } from "../domain/parking-results.js";
import { requestParseFind, applyParsedToForm } from "../data/parse-find.js";
import { createSpeech } from "../lib/speech.js";
import { setAccountPermit } from "../data/auth.js";

export function renderFind() {
  renderDestinationOptions("find-destination", state.find.destinationId, "No specific building");
  const sel = $("permit-select");
  sel.innerHTML = `<option value="">Choose a permit…</option>` +
    state.permits.map((p) => `<option value="${p.permit_id}">${escapeHtml(p.permit_code)} — ${escapeHtml(p.permit_name)}</option>`).join("");
  sel.value = state.find.permitId ?? "";
  renderAccountPermit();
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

// "Your permit" on the account page: the same choice as the map chip and Find, shown with the account.
export function renderAccountPermit() {
  const select = typeof document !== "undefined" ? document.getElementById("account-permit") : null;
  if (!select) return;
  select.innerHTML = `<option value="">Choose a permit…</option>` +
    state.permits.map((p) => `<option value="${p.permit_id}">${escapeHtml(p.permit_code)} — ${escapeHtml(p.permit_name)}</option>`).join("");
  select.value = state.find.permitId ?? "";
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
let resetPlainLanguage;
export function resetFindSearch() { resetPlainLanguage?.(); }

function initPlainLanguage({ choosePermit }) {
  const form = $("nl-form"), input = $("nl-text"), mic = $("nl-mic"), go = $("nl-go"), status = $("nl-status");
  if (!form) return;
  const say = (message, warn = false) => { status.textContent = message; status.classList.toggle("warn", warn); };
  let pending = null;

  async function run(request) {
    if (pending) return;
    const controller = pending = new AbortController();
    const version = state.authVersion;
    const current = () => pending === controller && version === state.authVersion;
    go.disabled = mic.disabled = true;
    say("Reading that…");
    try {
      const lists = { permits: state.permits, destinations: state.destinations };
      const parsed = await requestParseFind(state.db, request, lists, { signal: controller.signal });
      if (!current()) return;
      const els = { permit: $("permit-select"), destination: $("find-destination"), now: $("arrive-now"), day: $("arrive-day"), time: $("arrive-time") };
      const result = applyParsedToForm(parsed, els, { ...lists, choosePermit, getPermitId: () => state.find.permitId });
      syncTimeControls();
      renderPermitInfo();
      say([result.summary, ...result.warnings, "Check the fields below, then press Show parking areas."].join(" "), result.needsReview || result.warnings.length > 0);
    } catch (error) {
      if (current()) say(error.message || "I couldn't read that. Use the form below.", true);
    } finally {
      if (current()) {
        pending = null;
        go.disabled = mic.disabled = false;
        speech.done();
      }
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
      else if (next === "idle" && status.textContent.startsWith("Listening")) say("I didn't catch anything. Try again, or type it.", true);
    },
  });
  resetPlainLanguage = () => {
    pending?.abort();
    pending = null;
    speech.cancel();
    input.value = "";
    go.disabled = mic.disabled = false;
    say("");
  };
  mic.hidden = speech.mode === "none";
  mic.addEventListener("click", () => speech.toggle());
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) { say("Type or say something like “class at 3 pm at the JKB with my current permit”.", true); input.focus(); return; }
    void run({ text });
  });
}

// Picking a permit takes effect right away: the Areas list, the map and the permit chip all
// re-filter through domain/eligibility.js, without waiting for "Show parking areas".
export function applyPermitChoice(permitId, refresh = () => {}) {
  const id = Number(permitId);
  if (!state.permits.some((p) => p.permit_id === id)) return false;
  state.find.permitId = id;
  savePermit(id, state.user?.userId);
  // Keep the Find form in step when the permit is picked elsewhere (the map's permit chip), so
  // "Show parking areas" doesn't ask for a permit the person already chose.
  const select = typeof document !== "undefined" ? document.getElementById("permit-select") : null;
  if (select && select.value !== String(id)) { select.value = String(id); renderPermitInfo(); }
  const accountSelect = typeof document !== "undefined" ? document.getElementById("account-permit") : null;
  if (accountSelect && accountSelect.value !== String(id)) accountSelect.value = String(id);
  saveToAccount(id);
  refresh();
  return true;
}

// Signed in: keep the choice on the account too, so a reload or another device doesn't switch back to
// the permit picked at sign-up. The device copy (savePermit) already holds it if this fails.
export function saveToAccount(id, save = setAccountPermit) {
  const user = state.user;
  if (!user?.userId || (user.permitIds?.length === 1 && user.permitIds[0] === id)) return null;
  return save(user.userId, id)
    .then(() => { if (state.user === user) user.permitIds = [id]; return true; })
    .catch((err) => {
      console.error(err);
      if (state.user === user) {
        try { setStatus("Couldn't save your permit to your account. It's still set on this device.", true); } catch { /* no page */ }
      }
      return false;
    });
}

export function initFind({ go, choosePermit = () => {}, refresh = () => {} }) {
  initPlainLanguage({ choosePermit });
  $("account-permit")?.addEventListener("change", (e) => applyPermitChoice(e.target.value, refresh));
  $("permit-select").addEventListener("change", () => {
    renderPermitInfo();
    applyPermitChoice($("permit-select").value, refresh);
  });
  $("arrive-now").addEventListener("change", syncTimeControls);
  $("find-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const id = Number($("permit-select").value);
    if (!id) { setStatus("Choose your permit first so we can check which areas you can use.", true); $("permit-select").focus(); return; }
    // The building is optional here; the timer form still requires it before a timer can start.
    const destinationId = Number($("find-destination").value);
    state.find.destinationId = state.destinations.some(d => d.destination_id === destinationId) ? destinationId : null;
    if (state.find.destinationId) $("area-sort").value = "destination";
    applyPermitChoice(id);
    state.find.live = $("arrive-now").checked;
    state.find.day = Number($("arrive-day").value);
    state.find.time = $("arrive-time").value || nowHHMM();
    const selection = parkingSelection(state.find);
    setStatus(`Showing eligible areas ${selection.live ? "right now" : "for your planned arrival"}: ${DAY_NAMES[selection.day]} at ${fmtTime(selection.time)} (Provo time).`);
    go("#areas");
  });
}
