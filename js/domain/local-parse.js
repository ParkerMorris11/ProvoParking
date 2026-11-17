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
  if (m) return `${pad(Number(m[1]))}:${m[2]}`;
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

function findBuilding(text, destinations) {
  let best = null;
  const consider = (destination, phrase, score) => {
    if (phrase && hasWord(text, phrase) && (!best || score > best.score)) best = { destination, phrase, score };
  };
  for (const destination of destinations) {
    const code = norm(destination.building_code);
    const name = norm(destination.name);
    consider(destination, name, 100 + name.length);
    for (const nick of BUILDING_NICKNAMES[String(destination.building_code || "").toUpperCase()] || []) {
      const phrase = norm(nick);
      consider(destination, phrase, 50 + phrase.length);
    }
    // 2-letter codes (MC, CB) are common words once lowercased, so only 3+ letter codes count.
    if (code.length >= 3) consider(destination, code, 60 + code.length);
    // "the knight building", "tanner": a distinctive first word of the name, 5+ letters.
    const first = name.split(" ").find((w) => w.length >= 5 && !["building", "center", "centre", "student", "brigham", "university"].includes(w));
    if (first) consider(destination, first, 20);
  }
  return best;
}

function findPermit(text, permits) {
  for (const permit of permits) {
    const code = norm(permit.permit_code);
    if (!code) continue;
    const c = escapeRe(code);
    if (new RegExp(`(^| )${c} (permit|pass|parking)( |$)`).test(text) || new RegExp(`(^| )permit ${c}( |$)`).test(text)) return permit;
  }
  // A permit named in words: "graduate permit", "faculty pass". Only when exactly one permit name has that word.
  const word = text.match(/\b([a-z]{5,}) (?:permit|pass)\b/)?.[1];
  if (word && !["current", "saved", "existing", "student", "parking"].includes(word)) {
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
  const clean = norm(text);
  const today = denverDay(now);
  const empty = { permit_id: null, use_saved_permit: false, destination_id: null, live: true, day: null, time: null, confidence: 0, found: 0 };
  if (!clean) return empty;

  const permit = findPermit(clean, permits);
  const building = findBuilding(clean, destinations);
  let time = readTime(clean);
  if (time == null && building) time = readBareAfterBuilding(clean, [building.phrase]);
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
  };
}

/**
 * Combines the model's answer with the local reading. The model wins whenever it answered; the local
 * reading only fills in what the model left empty (a building code it didn't recognize, a time it dropped).
 */
export function mergeParsed(ai, local) {
  if (!local || local.found === 0) return ai;
  const permit_id = ai.permit_id ?? local.permit_id;
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
