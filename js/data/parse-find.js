// Plain-language / voice Find: asks the parse-find Edge Function to read a sentence, then fills the Find form.
// The model only suggests. This file re-checks every ID, and the person reviews the form and submits it,
// so eligibility is still decided by domain/eligibility.js and never by the AI.
import { DAY_NAMES, fmtTime } from "../lib/format.js";
import { localParseFind, mergeParsed } from "../domain/local-parse.js";

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

/** Shown when the sentence named nothing the form can hold (e.g. "free parking downtown for 2 hours"). */
export const OUT_OF_SCOPE = "I can fill in a BYU permit, a campus building, and an arrival day and time, but not price, neighborhood, or how long you'll stay. Try something like “Y permit near the Tanner Building Monday at 10 am”.";

export class ParseFindError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

const FRIENDLY = {
  not_configured: "Plain-language search isn't set up yet. Use the form below.",
  origin_not_allowed: "Plain-language search isn't available from this address. Use the form below.",
  quota_exhausted: "Plain-language search is busy. Try again later or use the form below.",
  quota_unavailable: "Plain-language search is temporarily unavailable. Use the form below.",
  too_large: "That recording was too long. Try a shorter one, or type it.",
};

/** Calls the Edge Function through the Supabase client. Resolves to a normalized result or throws ParseFindError. */
// Busy-model answers worth one more try from the page (the function also retries on its side).
const RETRY_CODES = new Set(["model_unavailable", "bad_model_output"]);
export const CLIENT_RETRY_DELAY_MS = 2500;
// A typed search waits this long for the AI before the backup reader answers instead (busy class Wi-Fi, slow model).
export const TYPED_TIMEOUT_MS = 9000;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function requestParseFind(db, input, lists, { sleep = wait, retries = 1, signal } = {}) {
  if (!db?.functions?.invoke) throw new ParseFindError("offline", "Plain-language search needs a connection. Use the form below.");
  const body = buildParseRequest({ ...input, ...lists });
  for (let attempt = 0; ; attempt++) {
    signal?.throwIfAborted();
    const { data, error } = await db.functions.invoke(PARSE_FIND_FUNCTION, { body });
    signal?.throwIfAborted();
    if (!error) return normalizeParsed(data, lists);
    let code = "failed";
    try { code = (await error.context?.json?.())?.error || code; } catch { /* body wasn't JSON */ }
    if (RETRY_CODES.has(code) && attempt < retries) { await sleep(CLIENT_RETRY_DELAY_MS); continue; }
    throw new ParseFindError(code, FRIENDLY[code] || "I couldn't read that. Try again, or use the form below.");
  }
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
  let keptPermit = null;
  if (permitId != null && permits.some((p) => p.permit_id === permitId)) {
    els.permit.value = String(permitId);
    const permit = permits.find((p) => p.permit_id === permitId);
    said.push(`${permit.permit_code} permit`);
  } else {
    // No permit in this sentence: keep the one already chosen (it is the person's permit), and say so.
    keptPermit = permits.find((p) => String(p.permit_id) === String(els.permit.value)) || null;
  }

  // Each search describes a new trip, so a building from the last search must not linger.
  if (parsed.destination_id != null) {
    els.destination.value = String(parsed.destination_id);
    said.push(destinations.find((d) => d.destination_id === parsed.destination_id)?.name ?? "your building");
  } else {
    els.destination.value = "";
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
    // Clear an old time rather than reuse it; the form falls back to the current time if left empty.
    els.time.value = parsed.time ?? "";
    if (parsed.time == null) warnings.push("I couldn't tell the time, so check it.");
    said.push(`${DAY_NAMES[parsed.day ?? Number(els.day.value)]}${parsed.time ? ` at ${fmtTime(parsed.time)}` : ""}`);
  }

  const needsReview = parsed.confidence < LOW_CONFIDENCE;
  const matchedNothing = permitId == null && !parsed.use_saved_permit && parsed.destination_id == null && parsed.live;
  if (needsReview && matchedNothing) warnings.push(OUT_OF_SCOPE);
  else if (needsReview) warnings.push("I wasn't sure about this, so check each field.");
  let summary = said.length ? `Filled in: ${said.join(", ")}.` : "I couldn't find anything to fill in.";
  if (keptPermit) summary += ` Kept your ${keptPermit.permit_code} permit.`;
  return { summary, warnings, needsReview };
}

/**
 * Asks the model, then lets the local reader fill in anything the model missed. When the model can't be
 * reached at all (busy, over its limit, offline), the local reader answers alone so the search still works.
 * Resolves to { parsed, fallback } where fallback is true when only the local reader answered.
 */
export async function parseFindWithFallback(db, input, lists, options = {}, now = new Date()) {
  const local = input.text ? localParseFind(input.text, lists, now) : null;
  const { timeoutMs = TYPED_TIMEOUT_MS, ...requestOptions } = options;
  let timer;
  try {
    const request = requestParseFind(db, input, lists, requestOptions);
    // Only typed text has a backup reader, so only typed text stops waiting on a slow or rate-limited AI.
    const parsed = await (local && local.found > 0 && timeoutMs > 0
      ? Promise.race([request, new Promise((_, reject) => { timer = setTimeout(() => reject(new ParseFindError("timeout", "The AI took too long.")), timeoutMs); })])
      : request);
    return { parsed: stripLocal(mergeParsed(parsed, local)), fallback: false };
  } catch (error) {
    if (error?.name === "AbortError") throw error;
    // Rate limited, busy, offline or slow: the backup reader answers so the search still works.
    if (local && local.found > 0) return { parsed: stripLocal(local), fallback: true, reason: error?.code || "failed" };
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

const stripLocal = ({ found, permit_explicit, ...parsed }) => parsed;
