// Reads a typed or spoken trip ("tnrb 9", "Y permit at the JKB tomorrow 2:30 pm") without any AI.
// It fills the same shape as the parse-find Edge Function, so it can back it up when Gemini is busy, and
// can fill in anything the model missed. It only picks permit and building IDs that exist in the lists given.
import { BUILDING_NICKNAMES } from "./map-search.js";

const norm = (value) => String(value || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "")
  .replace(/[^a-z0-9:]+/g, " ").trim().replace(/\s+/g, " ");
const escapeRe = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const hasWord = (text, phrase) => phrase && new RegExp(`(^| )${escapeRe(phrase)}( |$)`).test(text);

const WEEKDAYS = [
  ["sunday", "sun"], ["monday", "mon"], ["tuesday", "tues", "tue"], ["wednesday", "wed"],
  ["thursday", "thurs", "thur", "thu"], ["friday", "fri"], ["saturday", "sat"],
];

/** Today's weekday (0-6) in Provo, so "tomorrow" means the right day. */
export function denverDay(date = new Date()) {
  const name = new Intl.DateTimeFormat("en-US", { timeZone: "America/Denver", weekday: "short" }).format(date);
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(name);
}

const pad = (n) => String(n).padStart(2, "0");

function readTime(text) {
  if (/\bnoon\b/.test(text)) return "12:00";
  if (/\bmidnight\b/.test(text)) return "00:00";
  // 3 pm, 3:30pm, 3 p m
  let m = text.match(/(?:^|[^0-9:])(\d{1,2})(?::(\d{2}))?\s?(a|p)\s?m\b/);
  if (m) {
    let hour = Number(m[1]);
    const minute = Number(m[2] || 0);
    if (hour < 1 || hour > 12 || minute > 59) return null;
    if (m[3] === "p" && hour !== 12) hour += 12;
    if (m[3] === "a" && hour === 12) hour = 0;
    return `${pad(hour)}:${pad(minute)}`;
  }
  // 15:30 (24-hour)
  m = text.match(/(?:^|[^0-9])([01]?\d|2[0-3]):([0-5]\d)(?![0-9])/);
  if (m) {
    let hour = Number(m[1]);
    // "LSB 3:30" with no am/pm is a class time, so 1:00-6:59 means the afternoon (same rule as a bare hour).
    if (m[1].length === 1 && hour >= 1 && hour <= 6 && !/\b(morning|am)\b/.test(text)) hour += 12;
    return `${pad(hour)}:${m[2]}`;
  }
  // "at 3", "tnrb 9", "3 o'clock": a bare hour. Class hours are 7-11 morning, 12-6 afternoon.
  m = text.match(/\b(?:at|around|by|before|for)\s+(\d{1,2})\b(?!\s?(?:min|hour|hr|h\b|day|mile))/)
    || text.match(/\b(\d{1,2}) o clock\b/);
  const bare = m ? Number(m[1]) : null;
  if (bare == null || bare < 1 || bare > 12) return null;
  let hour = bare;
  if (/\b(morning|am)\b/.test(text)) hour = bare === 12 ? 0 : bare;
  else if (/\b(afternoon|evening|tonight|night|pm)\b/.test(text)) hour = bare === 12 ? 12 : bare + 12;
  else if (bare >= 1 && bare <= 6) hour = bare + 12;
  return `${pad(hour)}:00`;
}

/** A trailing number right after a building word ("tnrb 9", "jkb 330") when no time was otherwise found. */
function readBareAfterBuilding(text, buildingWords) {
  for (const word of buildingWords) {
    const m = text.match(new RegExp(`(?:^| )${escapeRe(word)} (\\d{1,2})(?::?(\\d{2}))?(?: |$)`));
    if (m) {
      let hour = Number(m[1]), minute = Number(m[2] || 0);
      if (m[2] == null && m[1].length >= 3) { minute = Number(m[1].slice(-2)); hour = Number(m[1].slice(0, -2)); }
      if (hour < 1 || hour > 12 || minute > 59) continue;
      if (hour <= 6) hour += 12;
      return `${pad(hour)}:${pad(minute)}`;
    }
  }
  return null;
}

function readDay(text, today) {
  if (/\bday after tomorrow\b/.test(text)) return (today + 2) % 7;
  if (/\btomorrow\b/.test(text)) return (today + 1) % 7;
  if (/\b(today|tonight|this morning|this afternoon|this evening)\b/.test(text)) return today;
  for (let day = 0; day < 7; day++) {
    if (WEEKDAYS[day].some((name) => hasWord(text, name))) return day;
  }
  return null;
}

// Places in Provo that share a word with a campus nickname ("Provo City Library" is not the HBLL).
const OFF_CAMPUS = /\b(provo (city )?library|city library|public library|provo high( school)?|provo rec(reation)? center|riverwoods|towne centre|provo towne|downtown provo|downtown)\b/g;
// Words that never name a building, so a typo match can't land on them.
const NOT_BUILDING_WORDS = new Set(["parking", "permit", "permits", "park", "pass", "tomorrow", "tonight", "today", "morning", "afternoon",
  "evening", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday", "where", "class", "near", "around", "please",
  "building", "center", "centre", "student", "tower", "university", "brigham", "campus", "office", "missionary", "training", "visitor", "graduate", "lunch", "right", "there", "about"]);
const typoLimit = (word) => (word.length >= 8 ? 2 : word.length >= 5 ? 1 : 0);

// Plain edit distance, stopped once it is clearly above `max`.
function editDistance(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      rowMin = Math.min(rowMin, cur[j]);
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

/** True when the words of `phrase` appear in a row in `words`, each spelled right or within a small typo. */
function fuzzyHas(words, phrase) {
  const want = phrase.split(" ");
  if (!want.some((w) => w.length >= 5 && !NOT_BUILDING_WORDS.has(w))) return false;
  for (let start = 0; start + want.length <= words.length; start++) {
    let typos = 0;
    const ok = want.every((w, k) => {
      const got = words[start + k];
      if (got === w) return true;
      if (NOT_BUILDING_WORDS.has(got) || typoLimit(w) === 0) return false;
      const d = editDistance(got, w, typoLimit(w));
      if (d > typoLimit(w)) return false;
      typos += d;
      return true;
    });
    if (ok && typos > 0) return true;
  }
  return false;
}

function findBuilding(text, destinations, raw = "") {
  const campus = text.replace(OFF_CAMPUS, " ").replace(/\s+/g, " ").trim();
  const words = campus.split(" ");
  // Two-letter codes (MC, CB, RB) are ordinary words in lowercase, so they count only when typed in capitals.
  const capitals = new Set(String(raw).split(/[^A-Za-z0-9]+/).filter((w) => /^[A-Z][A-Z0-9]$/.test(w)));
  let best = null, fuzzy = null;
  const consider = (destination, phrase, score) => {
    if (!phrase) return;
    if (hasWord(campus, phrase)) { if (!best || score > best.score) best = { destination, phrase, score }; }
    else if (!best && fuzzyHas(words, phrase) && (!fuzzy || score > fuzzy.score)) fuzzy = { destination, phrase: null, score };
  };
  for (const destination of destinations) {
    const rawCode = String(destination.building_code || "").toUpperCase();
    const code = norm(destination.building_code);
    const name = norm(destination.name);
    consider(destination, name, 100 + name.length);
    for (const nick of BUILDING_NICKNAMES[rawCode] || []) {
      const phrase = norm(nick);
      consider(destination, phrase, 50 + phrase.length);
    }
    if (code.length >= 3) consider(destination, code, 60 + code.length);
    else if (code.length === 2 && capitals.has(rawCode) && (!best || 62 > best.score)) best = { destination, phrase: code, score: 62 };
    // "the knight building", "tanner": a distinctive first word of the name, 5+ letters.
    const first = name.split(" ").find((w) => w.length >= 5 && !NOT_BUILDING_WORDS.has(w));
    if (first) consider(destination, first, 20);
  }
  return best || fuzzy;
}

// Words people use for a permit instead of its letter ("faculty pass", "visitor parking").
const PERMIT_WORDS = { faculty: "A", staff: "A", employee: "A", grad: "G", graduate: "G", undergrad: "Y", undergraduate: "Y",
  visitor: "V", visitors: "V", guest: "V", wymount: "YM", wyview: "YV", heritage: "B", helaman: "C", riviera: "D" };

/**
 * A permit the person named outright: "A permit", "an A pass", "permit G", "Y parking", "graduate permit".
 * A lowercase "a" right before "permit" is the article ("I need a permit"), so it only counts as the A permit
 * when typed as a capital or after "an". Returns the permit or null. Shared rule with the parse-find function.
 */
export function findExplicitPermit(raw, permits) {
  const text = String(raw || "").normalize("NFKD").replace(/[^A-Za-z0-9]+/g, " ").trim();
  const byCode = [...permits].filter((p) => p.permit_code).sort((a, b) => String(b.permit_code).length - String(a.permit_code).length);
  for (const permit of byCode) {
    const c = escapeRe(String(permit.permit_code).trim());
    const re = new RegExp(`(?:^| )(an )?(${c}) (?:permit|pass|parking|sticker|tag)(?= |$)|(?:^| )permit (${c})(?= |$)`, "gi");
    for (const m of text.matchAll(re)) {
      const said = m[2] ?? m[3];
      const isArticle = said === "a" && !m[1];
      if (!isArticle) return permit;
    }
  }
  const word = text.toLowerCase().match(/\b([a-z]{4,}) (?:permit|pass|parking|sticker)\b/)?.[1];
  if (word && PERMIT_WORDS[word]) return permits.find((p) => p.permit_code === PERMIT_WORDS[word]) || null;
  // Otherwise a word from exactly one permit's name: "wymount permit".
  if (word && !["current", "saved", "existing", "student", "parking", "street", "public", "campus", "free", "paid"].includes(word) && word.length >= 5) {
    const matches = permits.filter((p) => hasWord(norm(p.permit_name), word) || hasWord(norm(p.permit_name), word.replace(/s$/, "")));
    if (matches.length === 1) return matches[0];
  }
  return null;
}

const SAVED_PERMIT = /\b(my|current|saved|existing|own) (permit|pass)\b|\bwhat i have\b|\bwith my permit\b|\b(where|can|could|should) (can |do |could |should )?i (park|find parking)\b|\bwhere (to|do i) park\b|\bparking for me\b/;
const NOW = /\b(now|right now|currently|just arrived|asap|immediately)\b/;

/**
 * Reads `text` and returns { permit_id, use_saved_permit, destination_id, live, day, time, confidence, found }.
 * `found` counts how many parts of the trip (permit, building, time, day) were understood.
 */
export function localParseFind(text, { permits = [], destinations = [] } = {}, now = new Date()) {
  const clean = norm(text).replace(/\bbldg\b/g, "building").replace(/\bctr\b/g, "center");
  const today = denverDay(now);
  const empty = { permit_id: null, use_saved_permit: false, destination_id: null, live: true, day: null, time: null, confidence: 0, found: 0 };
  if (!clean) return empty;

  const permit = findExplicitPermit(text, permits);
  const building = findBuilding(clean, destinations, text);
  let time = readTime(clean);
  if (time == null && building?.phrase) time = readBareAfterBuilding(clean, [building.phrase]);
  const day = readDay(clean, today);
  const live = NOW.test(clean) || (time == null && day == null);
  const saved = !permit && SAVED_PERMIT.test(clean);

  const found = [permit || saved, building, time, day != null && !live].filter(Boolean).length;
  const confidence = found === 0 ? 0 : Math.min(0.85, 0.35 + found * 0.15);
  return {
    permit_id: permit ? permit.permit_id : null,
    use_saved_permit: saved,
    destination_id: building ? building.destination.destination_id : null,
    live,
    day: live ? null : (day ?? today),
    time: live ? null : time,
    confidence,
    found,
    // A permit typed outright ("A permit") beats the model's reading, which can mistake "A" for the article.
    permit_explicit: Boolean(permit),
  };
}

/**
 * Combines the model's answer with the local reading. The model wins whenever it answered; the local
 * reading only fills in what the model left empty (a building code it didn't recognize, a time it dropped).
 */
export function mergeParsed(ai, local) {
  if (!local || local.found === 0) return ai;
  // A permit typed outright ("A permit at the Wilk") is not a guess, so it wins over the model's reading.
  const permit_id = local.permit_explicit && local.permit_id != null ? local.permit_id : ai.permit_id ?? local.permit_id;
  const destination_id = ai.destination_id ?? local.destination_id;
  const use_saved_permit = permit_id == null && (ai.use_saved_permit || local.use_saved_permit);
  let { live, day, time } = ai;
  if (live && !local.live) { live = false; day = local.day; time = local.time; }
  else if (!live && time == null && local.time != null) time = local.time;
  const filled = permit_id !== ai.permit_id || destination_id !== ai.destination_id || use_saved_permit !== ai.use_saved_permit
    || live !== ai.live || time !== ai.time;
  const confidence = filled ? Math.max(ai.confidence, Math.min(local.confidence, 0.7)) : ai.confidence;
  return { permit_id, use_saved_permit, destination_id, live, day: live ? null : day, time: live ? null : time, confidence };
}
