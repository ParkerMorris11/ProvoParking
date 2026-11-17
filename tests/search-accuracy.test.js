// Plain-language search accuracy on 80 realistic queries (tests/fixtures/search-queries.js), plus the
// "A permit" rule shared by the backup reader and the parse-find function, and the busy-AI fallback.
import test from "node:test";
import assert from "node:assert/strict";
import { localParseFind, findExplicitPermit, mergeParsed } from "../js/domain/local-parse.js";
import { parseFindWithFallback } from "../js/data/parse-find.js";
import { explicitPermitId, sanitizeParse } from "../supabase/functions/parse-find/sanitize.js";
import { SEARCH_QUERIES, SEARCH_HOLDOUT, SEARCH_NOW } from "./fixtures/search-queries.js";
import { LIVE_PERMITS, LIVE_DESTINATIONS } from "./fixtures/live-search-lists.js";
import { scoreParsed } from "./helpers/search-score.js";

const lists = { permits: LIVE_PERMITS, destinations: LIVE_DESTINATIONS };
const labels = LIVE_PERMITS.map((p) => ({ id: p.permit_id, label: `${p.permit_code} - ${p.permit_name}` }));
const id = (code) => LIVE_PERMITS.find((p) => p.permit_code === code).permit_id;

test("backup reader answers every query in the search set exactly", () => {
  const all = [...SEARCH_QUERIES, ...SEARCH_HOLDOUT];
  assert.ok(all.length >= 40);
  const misses = all.map(([text, expected]) => [text, scoreParsed(localParseFind(text, lists, SEARCH_NOW), expected)]).filter(([, e]) => e.length);
  assert.deepEqual(misses, []);
});

test('"A permit" is the A permit; "a permit" is the article', () => {
  assert.equal(findExplicitPermit("A permit at the Wilkinson Center Wednesday 12:30 pm", LIVE_PERMITS)?.permit_code, "A");
  assert.equal(findExplicitPermit("an a pass", LIVE_PERMITS)?.permit_code, "A");
  assert.equal(findExplicitPermit("I need a permit near the JKB", LIVE_PERMITS), null);
  assert.equal(findExplicitPermit("y permit tmcb 3", LIVE_PERMITS)?.permit_code, "Y");
  assert.equal(findExplicitPermit("YM permit", LIVE_PERMITS)?.permit_code, "YM");
});

test("parse-find function and backup reader agree on which permit was named", () => {
  for (const [text] of [...SEARCH_QUERIES, ...SEARCH_HOLDOUT]) {
    assert.equal(explicitPermitId(text, labels), findExplicitPermit(text, LIVE_PERMITS)?.permit_id ?? null, text);
  }
});

test("server overrides a model that read 'A permit' as the article", () => {
  const out = sanitizeParse({ permit_id: null, use_saved_permit: true, destination_id: 7, live: false, day: 3, time: "12:30", confidence: 0.9 },
    { permitIds: labels.map((l) => l.id), destinationIds: [7], now: { day: 2, time: "10:00" }, text: "A permit at the Wilkinson Center Wednesday 12:30 pm", permits: labels });
  assert.equal(out.permit_id, id("A"));
  assert.equal(out.use_saved_permit, false);
});

test("page overrides the model's saved-permit guess with a permit typed outright", () => {
  const ai = { permit_id: null, use_saved_permit: true, destination_id: 7, live: false, day: 3, time: "12:30", confidence: 0.9 };
  const local = localParseFind("A permit at the Wilkinson Center Wednesday 12:30 pm", lists, SEARCH_NOW);
  assert.equal(mergeParsed(ai, local).permit_id, id("A"));
  assert.equal(mergeParsed(ai, local).use_saved_permit, false);
});

const errorWith = (code) => ({ context: { json: async () => ({ error: code }) } });

test("rate-limited AI search falls back to the backup reader instead of an error", async () => {
  const db = { functions: { invoke: async () => ({ data: null, error: errorWith("quota_exhausted") }) } };
  const { parsed, fallback } = await parseFindWithFallback(db, { text: "A permit at the Wilk at 2pm" }, lists, {}, SEARCH_NOW);
  assert.equal(fallback, true);
  assert.equal(parsed.permit_id, id("A"));
  assert.equal(parsed.time, "14:00");
  assert.equal("found" in parsed || "permit_explicit" in parsed, false);
});

test("a slow AI search gives up after the timeout and the backup reader answers", async () => {
  const db = { functions: { invoke: () => new Promise(() => {}) } };
  const { parsed, fallback } = await parseFindWithFallback(db, { text: "jkb 3pm" }, lists, { timeoutMs: 20 }, SEARCH_NOW);
  assert.equal(fallback, true);
  assert.equal(parsed.time, "15:00");
});
