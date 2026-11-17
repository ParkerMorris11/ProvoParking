// Measures plain-language search accuracy on tests/fixtures/search-queries.js.
//   node scripts/eval-search.mjs            backup (rule-based) reader only
//   node scripts/eval-search.mjs --live 20  also send the first 20 queries to the deployed parse-find function (read-only)
import { normalizeParsed, buildParseRequest } from "../js/data/parse-find.js";
import { SEARCH_QUERIES as TUNED, SEARCH_HOLDOUT, SEARCH_NOW } from "../tests/fixtures/search-queries.js";
import { LIVE_PERMITS, LIVE_DESTINATIONS } from "../tests/fixtures/live-search-lists.js";
import { scoreParsed } from "../tests/helpers/search-score.js";

const { localParseFind } = await import(process.env.READER || "../js/domain/local-parse.js");
const SEARCH_QUERIES = [...TUNED, ...SEARCH_HOLDOUT];
const lists = { permits: LIVE_PERMITS, destinations: LIVE_DESTINATIONS };
const args = process.argv.slice(2);
const liveCount = args.includes("--live") ? Number(args[args.indexOf("--live") + 1] || 20) : 0;
const only = args.includes("--only") ? args[args.indexOf("--only") + 1].split(",").map(Number) : null;

function report(name, rows) {
  const ok = rows.filter((r) => !r.errors.length).length;
  console.log(`\n${name}: ${ok}/${rows.length} exact (${Math.round((100 * ok) / rows.length)}%)`);
  for (const r of rows) if (r.errors.length) console.log(`  ✗ [${r.i}] "${r.text}" — ${r.errors.join("; ")}`);
  return ok;
}

const local = SEARCH_QUERIES.map(([text, expected], i) => {
  const { found, ...parsed } = localParseFind(text, lists, SEARCH_NOW);
  return { i, text, errors: scoreParsed(parsed, expected) };
});
report("Backup reader (local), all", local);
report("  tuned set", local.slice(0, TUNED.length));
report("  held-out set", local.slice(TUNED.length));

if (liveCount) {
  const url = process.env.SUPABASE_URL || "https://rikekjksneoymybnehpo.supabase.co";
  const key = process.env.SUPABASE_ANON_KEY;
  if (!key) throw new Error("Set SUPABASE_ANON_KEY (the public anon key from config.js)");
  const rows = [];
  const picked = SEARCH_QUERIES.map((q, i) => [i, q]).filter(([i]) => (only ? only.includes(i) : i < liveCount));
  for (const [i, [text, expected]] of picked) {
    const response = await fetch(`${url}/functions/v1/parse-find`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: key, Authorization: `Bearer ${key}`, Origin: "https://provo-parking.vercel.app" },
      body: JSON.stringify(buildParseRequest({ text, ...lists })),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) { rows.push({ i, text, errors: [`HTTP ${response.status} ${body.error || ""}`] }); continue; }
    // Live answers use the real clock, so day/time words are compared against today in Provo.
    rows.push({ i, text, errors: scoreParsed(normalizeParsed(body, lists), expected), raw: body });
    await new Promise((r) => setTimeout(r, 1500));
  }
  report("Live parse-find (Gemini)", rows);
}
