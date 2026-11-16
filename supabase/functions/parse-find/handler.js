// Request handler for parse-find, separated from index.ts so tests can run it with a fake fetch and env.
import { RequestError, validateRequest, denverNow, buildPrompt, readModelJson, sanitizeParse, RESPONSE_SCHEMA, corsHeaders, isAllowedOrigin } from "./sanitize.js";

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_MODEL = "gemini-flash-latest";

// Gemini's free tier answers 429 (rate limit) or 503 (busy) on bursts. Testing on 2026-11-16 saw this on about
// a third of quick searches, and a retry a few seconds later always worked, so retry those before giving up.
export const RETRY_STATUSES = new Set([429, 500, 503]);
export const RETRY_DELAYS_MS = [800, 2000];
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const json = (status, body, headers) => new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json" } });

/** Looks up the labels for the permit/destination IDs the page sent (reference tables are public to read). */
async function loadLabels({ ids, table, idColumn, select, label, env, fetchImpl, fallback }) {
  if (!ids.length) return [];
  if (env.SUPABASE_URL && env.SUPABASE_ANON_KEY) {
    try {
      const url = `${env.SUPABASE_URL}/rest/v1/${table}?select=${select}&${idColumn}=in.(${ids.join(",")})`;
      const response = await fetchImpl(url, { headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${env.SUPABASE_ANON_KEY}` } });
      if (response.ok) {
        const rows = await response.json();
        const labelled = rows.filter((r) => ids.includes(r[idColumn])).map((r) => ({ id: r[idColumn], label: label(r) }));
        if (labelled.length) return labelled;
      }
    } catch { /* fall back to what the page sent */ }
  }
  const sent = new Map(fallback.map((x) => [x.id, x.label]));
  return ids.map((id) => ({ id, label: sent.get(id) ?? `id ${id}` }));
}

/** Reserve one provider attempt against the shared database budget. Fail closed without the budget. */
async function reserveModelAttempt(request, env, fetchImpl) {
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!env.SUPABASE_URL || !key) throw new RequestError(503, "quota_unavailable", "Search is temporarily unavailable");
  let allowed;
  try {
    const response = await fetchImpl(`${env.SUPABASE_URL.replace(/\/+$/, "")}/rest/v1/rpc/consume_parse_find_budget`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      // Gateway-provided address is a fairness hint. The project-wide limit applies regardless.
      body: JSON.stringify({ p_address: request.headers.get("cf-connecting-ip")?.slice(0, 64) ?? null }),
      redirect: "error",
      signal: AbortSignal.timeout(4000),
    });
    if (response.ok) allowed = await response.json();
  } catch { /* The provider must not be contacted when quota state is unknown. */ }
  if (allowed === false) throw new RequestError(429, "quota_exhausted", "Search limit reached");
  if (allowed !== true) throw new RequestError(503, "quota_unavailable", "Search is temporarily unavailable");
}

/**
 * env: { GEMINI_API_KEY, GEMINI_MODEL?, SUPABASE_URL?, SUPABASE_ANON_KEY?, SUPABASE_SERVICE_ROLE_KEY?, ALLOWED_ORIGINS? }
 * Success body is exactly { permit_id, use_saved_permit, destination_id, live, day, time, confidence }.
 */
export async function handleRequest(request, { env, fetchImpl = fetch, now = new Date(), sleep = wait }) {
  const extraOrigins = (env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
  const origin = request.headers.get("Origin");
  const cors = corsHeaders(origin, extraOrigins);
  if (origin && !isAllowedOrigin(origin, extraOrigins)) return json(403, { error: "origin_not_allowed" }, cors);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (request.method !== "POST") return json(405, { error: "method_not_allowed" }, cors);
  if (!env.GEMINI_API_KEY) return json(503, { error: "not_configured" }, cors);

  try {
    let body;
    try { body = await request.json(); } catch { throw new RequestError(400, "bad_request", "Body must be JSON"); }
    const input = validateRequest(body);
    await reserveModelAttempt(request, env, fetchImpl);
    const [permits, destinations] = await Promise.all([
      loadLabels({ ids: input.permit_ids, table: "permit", idColumn: "permit_id", select: "permit_id,permit_code,permit_name", label: (r) => `${r.permit_code} - ${r.permit_name}`, env, fetchImpl, fallback: input.permit_labels }),
      loadLabels({ ids: input.destination_ids, table: "destination", idColumn: "destination_id", select: "destination_id,building_code,name", label: (r) => `${r.name} (${r.building_code})`, env, fetchImpl, fallback: input.destination_labels }),
    ]);
    const today = denverNow(now);
    const parts = [];
    if (input.audio) parts.push({ inline_data: { mime_type: input.audio.mime_type, data: input.audio.data_base64 } });
    parts.push({ text: buildPrompt({ text: input.text, permits, destinations, now: today }) });

    const model = encodeURIComponent(env.GEMINI_MODEL || DEFAULT_MODEL);
    const modelBody = JSON.stringify({
      contents: [{ role: "user", parts }],
      generationConfig: { temperature: 0, responseMimeType: "application/json", responseSchema: RESPONSE_SCHEMA },
    });
    let response;
    for (let attempt = 0; ; attempt++) {
      if (attempt > 0) await reserveModelAttempt(request, env, fetchImpl);
      try {
        response = await fetchImpl(`${GEMINI_BASE}/${model}:generateContent`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
          body: modelBody,
        });
      } catch {
        if (attempt < RETRY_DELAYS_MS.length) { await sleep(RETRY_DELAYS_MS[attempt]); continue; }
        throw new RequestError(502, "model_unavailable", "Could not reach the model");
      }
      if (response.ok || !RETRY_STATUSES.has(response.status) || attempt >= RETRY_DELAYS_MS.length) break;
      await sleep(RETRY_DELAYS_MS[attempt]);
    }
    if (!response.ok) throw new RequestError(502, "model_unavailable", `Model returned ${response.status}`);
    const parsed = readModelJson(await response.json().catch(() => null));
    if (!parsed) throw new RequestError(502, "bad_model_output", "The model returned nothing usable");

    return json(200, sanitizeParse(parsed, { permitIds: input.permit_ids, destinationIds: input.destination_ids, now: today }), cors);
  } catch (error) {
    if (error instanceof RequestError) return json(error.status, { error: error.code, message: error.message }, cors);
    console.error("[parse-find]", error);
    return json(500, { error: "internal" }, cors);
  }
}
