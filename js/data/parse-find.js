// Plain-language / voice Find: asks the parse-find Edge Function to read a sentence, then fills the Find form.
// The model only suggests. This file re-checks every ID, and the person reviews the form and submits it,
// so eligibility is still decided by domain/eligibility.js and never by the AI.
import { DAY_NAMES, fmtTime } from "../lib/format.js";

export const PARSE_FIND_FUNCTION = "parse-find";
export const LOW_CONFIDENCE = 0.5;

/** Body for the Edge Function: the question plus the only IDs it may answer with. Labels are a fallback. */
export function buildParseRequest({ text = "", audio = null, permits = [], destinations = [] }) {
  const body = {
    text: String(text).trim(),
    permit_ids: permits.map((p) => p.permit_id),
    destination_ids: destinations.map((d) => d.destination_id),
    permit_labels: permits.map((p) => ({ id: p.permit_id, label: `${p.permit_code} - ${p.permit_name}` })),
    destination_labels: destinations.map((d) => ({ id: d.destination_id, label: `${d.name} (${d.building_code})` })),
  };
  if (audio) body.audio = { data_base64: audio.data_base64, mime_type: audio.mime_type };
  return body;
}

/** Same checks as the server, repeated here because the response crosses the network. */
export function normalizeParsed(result, { permits = [], destinations = [] } = {}) {
  const r = result && typeof result === "object" ? result : {};
  const permit_id = permits.some((p) => p.permit_id === r.permit_id) ? r.permit_id : null;
  const destination_id = destinations.some((d) => d.destination_id === r.destination_id) ? r.destination_id : null;
  const time = typeof r.time === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(r.time) ? r.time : null;
  const day = Number.isInteger(r.day) && r.day >= 0 && r.day <= 6 ? r.day : null;
  const live = r.live === false && (time != null || day != null) ? false : true;
  const confidence = Number.isFinite(Number(r.confidence)) ? Math.min(1, Math.max(0, Number(r.confidence))) : 0;
  return {
    permit_id, use_saved_permit: permit_id == null && r.use_saved_permit === true, destination_id, live,
    day: live ? null : day, time: live ? null : time, confidence,
  };
}

export class ParseFindError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

const FRIENDLY = {
  not_configured: "Plain-language search isn't set up yet. Use the form below.",
  origin_not_allowed: "Plain-language search isn't available from this address. Use the form below.",
  too_large: "That recording was too long. Try a shorter one, or type it.",
};

/** Calls the Edge Function through the Supabase client. Resolves to a normalized result or throws ParseFindError. */
export async function requestParseFind(db, input, lists) {
  if (!db?.functions?.invoke) throw new ParseFindError("offline", "Plain-language search needs a connection. Use the form below.");
  const { data, error } = await db.functions.invoke(PARSE_FIND_FUNCTION, { body: buildParseRequest({ ...input, ...lists }) });
  if (error) {
    let code = "failed";
    try { code = (await error.context?.json?.())?.error || code; } catch { /* body wasn't JSON */ }
    throw new ParseFindError(code, FRIENDLY[code] || "I couldn't read that. Try again, or use the form below.");
  }
  return normalizeParsed(data, lists);
}

/**
 * Puts a parsed answer into the Find form controls and says what it did.
 * els: { permit, destination, now, day, time } (the form elements, or anything with value/checked/disabled).
 * choosePermit(): the app's existing permit chooser; it sets state.find.permitId from the account or saved choice.
 * getPermitId(): reads that choice back.
 * Returns { summary, warnings, needsReview }.
 */
export function applyParsedToForm(parsed, els, { permits = [], destinations = [], choosePermit = () => {}, getPermitId = () => null } = {}) {
  const said = [], warnings = [];

  let permitId = parsed.permit_id;
  if (permitId == null && parsed.use_saved_permit) {
    choosePermit();
    permitId = getPermitId();
    if (permitId == null) warnings.push("You don't have a saved permit yet, so choose one.");
  }
  if (permitId != null && permits.some((p) => p.permit_id === permitId)) {
    els.permit.value = String(permitId);
    const permit = permits.find((p) => p.permit_id === permitId);
    said.push(`${permit.permit_code} permit`);
  }

  if (parsed.destination_id != null) {
    els.destination.value = String(parsed.destination_id);
    said.push(destinations.find((d) => d.destination_id === parsed.destination_id)?.name ?? "your building");
  }

  if (parsed.live) {
    els.now.checked = true;
    els.day.disabled = true;
    els.time.disabled = true;
    said.push("right now");
  } else {
    els.now.checked = false;
    els.day.disabled = false;
    els.time.disabled = false;
    if (parsed.day != null) els.day.value = String(parsed.day);
    if (parsed.time != null) els.time.value = parsed.time;
    else warnings.push("I couldn't tell the time, so check it.");
    said.push(`${DAY_NAMES[parsed.day ?? Number(els.day.value)]}${parsed.time ? ` at ${fmtTime(parsed.time)}` : ""}`);
  }

  const needsReview = parsed.confidence < LOW_CONFIDENCE;
  if (needsReview) warnings.push("I wasn't sure about this, so check each field.");
  const summary = said.length ? `Filled in: ${said.join(", ")}.` : "I couldn't find anything to fill in.";
  return { summary, warnings, needsReview };
}
