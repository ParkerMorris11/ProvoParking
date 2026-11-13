// Pure helpers for the parse-find Edge Function. Plain JS (no Deno or Node APIs) so the exact same
// code runs in Supabase and in `npm test`. Nothing here talks to the network.

export const MAX_TEXT_LENGTH = 500;
export const MAX_IDS = 300;
export const MAX_AUDIO_BASE64 = 2_800_000; // about 2 MB of audio, plenty for a 30 second clip
const AUDIO_TYPES = new Set(["audio/mp4", "audio/m4a", "audio/x-m4a", "audio/aac", "audio/webm", "audio/ogg", "audio/wav", "audio/x-wav", "audio/mpeg", "audio/mp3", "audio/flac"]);
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** What Gemini must return. Everything the page fills in, nothing else. */
export const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    permit_id: { type: "INTEGER", nullable: true, description: "A permit_id from the allowed list the user named, else null" },
    use_saved_permit: { type: "BOOLEAN", description: "True when the user means the permit they already have, without naming one" },
    destination_id: { type: "INTEGER", nullable: true, description: "A destination_id from the allowed list, else null" },
    live: { type: "BOOLEAN", description: "True for parking right now or when no time was mentioned" },
    day: { type: "INTEGER", nullable: true, description: "0=Sunday ... 6=Saturday when live is false" },
    time: { type: "STRING", nullable: true, description: "24-hour HH:MM arrival time when live is false" },
    confidence: { type: "NUMBER", description: "0 to 1: how sure you are about the whole answer" },
  },
  required: ["permit_id", "use_saved_permit", "destination_id", "live", "day", "time", "confidence"],
};

export class RequestError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}

const cleanIds = (value, name) => {
  if (!Array.isArray(value)) throw new RequestError(400, "bad_request", `${name} must be an array of integers`);
  const ids = [...new Set(value.filter((n) => Number.isInteger(n) && n > 0))];
  if (ids.length > MAX_IDS) throw new RequestError(400, "bad_request", `${name} has too many entries`);
  return ids;
};

/** Optional human labels the page may send ({ id, label }) in case the database lookup is unavailable. */
const cleanLabels = (value) => Array.isArray(value)
  ? value.filter((x) => x && Number.isInteger(x.id) && typeof x.label === "string").slice(0, MAX_IDS).map((x) => ({ id: x.id, label: x.label.slice(0, 120) }))
  : [];

export function normalizeAudioType(type) {
  const base = String(type || "").split(";")[0].trim().toLowerCase();
  return AUDIO_TYPES.has(base) ? base : null;
}

/** Validates the request body. Throws RequestError; otherwise returns clean values. */
export function validateRequest(body) {
  if (!body || typeof body !== "object") throw new RequestError(400, "bad_request", "Send a JSON object");
  const text = typeof body.text === "string" ? body.text.trim().slice(0, MAX_TEXT_LENGTH) : "";
  let audio = null;
  if (body.audio != null) {
    const mime = normalizeAudioType(body.audio.mime_type);
    const data = typeof body.audio.data_base64 === "string" ? body.audio.data_base64 : "";
    if (!mime) throw new RequestError(400, "bad_request", "Unsupported audio type");
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(data) || data.length < 100) throw new RequestError(400, "bad_request", "Audio must be base64");
    if (data.length > MAX_AUDIO_BASE64) throw new RequestError(413, "too_large", "Audio is too long");
    audio = { mime_type: mime, data_base64: data };
  }
  if (!text && !audio) throw new RequestError(400, "bad_request", "Send text or audio");
  return {
    text, audio,
    permit_ids: cleanIds(body.permit_ids, "permit_ids"),
    destination_ids: cleanIds(body.destination_ids, "destination_ids"),
    permit_labels: cleanLabels(body.permit_labels),
    destination_labels: cleanLabels(body.destination_labels),
  };
}

/** Provo's current day (0-6) and HH:MM, so "tomorrow" and "this afternoon" mean the right thing. */
export function denverNow(date = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Denver", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(date).map((p) => [p.type, p.value]));
  return { day: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.weekday), time: `${parts.hour}:${parts.minute}` };
}

export function buildPrompt({ text, permits, destinations, now }) {
  const list = (items) => items.map((i) => `- ${i.id}: ${i.label}`).join("\n") || "(none)";
  return [
    "You fill in a BYU / Provo parking search form from what a driver said or typed.",
    "Return ONLY JSON matching the schema. Never invent IDs: permit_id and destination_id must come from the lists below, or be null.",
    "",
    "Rules:",
    "- permit_id: set only when the driver names a permit (for example \"my Y permit\", \"graduate permit\"). Otherwise null.",
    "- use_saved_permit: true when they mean the permit they already have (\"my permit\", \"my current permit\", \"what I have\") without naming one. If permit_id is set, this is false.",
    "- destination_id: the building they are going to, matched by name or building code (JKB is a building code). Null if none or unsure.",
    "- live: true when they are parking now / just arrived, or gave no time at all. False when they gave a time or a day.",
    "- day and time apply only when live is false: day is 0=Sunday through 6=Saturday, time is 24-hour HH:MM. Resolve words like \"tomorrow\" or \"Friday\" from today. Otherwise null.",
    "- confidence: 0 to 1 for the whole answer. Use below 0.5 when the request is unclear.",
    "",
    `Today in Provo, Utah is ${DAY_NAMES[now.day]} (day ${now.day}) and the time is ${now.time}.`,
    "",
    "Allowed permits:", list(permits), "",
    "Allowed destinations:", list(destinations), "",
    text ? `Driver said: """${text}"""` : "The driver's request is in the attached audio.",
  ].join("\n");
}

/** Pulls the JSON object out of a Gemini generateContent response. Returns null when it is unusable. */
export function readModelJson(response) {
  const text = response?.candidates?.[0]?.content?.parts?.map((p) => p?.text ?? "").join("") ?? "";
  if (!text.trim()) return null;
  try {
    const value = JSON.parse(text.trim().replace(/^```(?:json)?\s*|\s*```$/g, ""));
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
  } catch { return null; }
}

/**
 * Turns whatever the model said into the strict answer, restricted to the permit and destination IDs the
 * page said are real. Anything out of range becomes null/false. `now` fills a missing day.
 */
export function sanitizeParse(raw, { permitIds, destinationIds, now }) {
  const input = raw && typeof raw === "object" ? raw : {};
  const permit_id = Number.isInteger(input.permit_id) && permitIds.includes(input.permit_id) ? input.permit_id : null;
  const destination_id = Number.isInteger(input.destination_id) && destinationIds.includes(input.destination_id) ? input.destination_id : null;
  const use_saved_permit = permit_id == null && input.use_saved_permit === true;
  const time = typeof input.time === "string" && TIME_RE.test(input.time.trim()) ? input.time.trim() : null;
  const day = Number.isInteger(input.day) && input.day >= 0 && input.day <= 6 ? input.day : null;
  // A stated time or day means a planned arrival; "live" is only for right now / unspecified.
  const planned = time != null || day != null;
  const live = planned ? false : true;
  let confidence = Number(input.confidence);
  confidence = Number.isFinite(confidence) ? Math.min(1, Math.max(0, confidence)) : 0;
  if (planned && time == null) confidence = Math.min(confidence, 0.4); // a day with no time is a guess
  return {
    permit_id, use_saved_permit, destination_id, live,
    day: live ? null : (day ?? now.day),
    time: live ? null : time,
    confidence: Math.round(confidence * 100) / 100,
  };
}

// ---- CORS ---------------------------------------------------------------------------------------
export const DEFAULT_ORIGINS = ["https://parkermorris11.github.io"];

export function isAllowedOrigin(origin, extra = []) {
  if (!origin) return false;
  if (DEFAULT_ORIGINS.includes(origin) || extra.includes(origin)) return true;
  try {
    const url = new URL(origin);
    return url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1");
  } catch { return false; }
}

export function corsHeaders(origin, extra = []) {
  const headers = { "Vary": "Origin", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Max-Age": "86400" };
  if (isAllowedOrigin(origin, extra)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}
