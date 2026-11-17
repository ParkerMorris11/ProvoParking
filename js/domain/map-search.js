// Suggestions come from the app's loaded parking and campus records.
const normalize = value => String(value || '').toLowerCase().normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');

// What students actually call a building. Keyed by building code; a match counts like the official name.
export const BUILDING_NICKNAMES = {
  JRCB: ['law school', 'law building', 'law library', 'clark building'], MC: ['marriott center', 'the marriott', 'marriott', 'basketball arena'],
  HBLL: ['library', 'hbll', 'lee library', 'harold b lee library'], WSC: ['wilk', 'wilkinson center', 'student center', 'the wilk'],
  JKB: ['jkb', 'jesse knight', 'knight building'], TNRB: ['tanner', 'tanner building', 'marriott school', 'business school'],
  JFSB: ['jfsb', 'smith building', 'joseph f smith'], JSB: ['jsb', 'joseph smith building'], KMBL: ['kimball tower', 'kimball'],
  TMCB: ['tmcb', 'talmage', 'math building', 'math sciences'], MSRB: ['maeser', 'msrb'], BNSN: ['benson', 'benson building'],
  LVES: ['stadium', 'football stadium', 'lavell edwards'], CB: ['clyde building', 'engineering building'], BRMB: ['brimhall', 'brmb'],
  ELLB: ['ellsworth'], SFLD: ['fieldhouse', 'smith fieldhouse', 'gym'],
};

// Plain edit distance, stopped early once it is clearly above `max`.
function distance(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}
// A typed word can be a misspelling of a real word (or its start) once it is long enough to be unambiguous.
const typoLimit = word => (word.length >= 8 ? 2 : word.length >= 4 ? 1 : 0);
const closeTo = (word, tokens) => {
  const limit = typoLimit(word);
  return tokens.some(token => token.startsWith(word) || (limit > 0 && (distance(word, token, limit) <= limit || distance(word, token.slice(0, word.length), limit) <= limit)));
};

export function searchMapCatalog(query, { areas = [], destinations = [], facilities = [] } = {}) {
  const term = normalize(query);
  if (term.length < 2) return [];
  const words = term.split(' ');
  const results = [], fuzzy = [];
  const add = (entry, code, name, extra = []) => {
    const normalizedCode = normalize(code), normalizedName = normalize(name);
    const nicknames = extra.map(normalize);
    const haystack = `${normalizedCode} ${normalizedName} ${nicknames.join(' ')}`;
    if (words.every(word => haystack.includes(word))) {
      const rank = normalizedCode === term || nicknames.includes(term) ? 0 : normalizedName === term ? 1
        : normalizedCode.startsWith(term) || nicknames.some(n => n.startsWith(term)) ? 2 : normalizedName.startsWith(term) ? 3 : 4;
      results.push({ ...entry, rank });
      return;
    }
    const tokens = haystack.split(' ');
    if (words.every(word => haystack.includes(word) || closeTo(word, tokens))) fuzzy.push({ ...entry, rank: 6 });
  };
  for (const area of areas) {
    add({ type: 'lot', id: area.area_id, title: String(area.area_name || ''), subtitle: 'Parking area' }, area.lot_code, area.area_name);
  }
  for (const d of destinations) {
    add({ type: 'destination', id: d.destination_id, title: String(d.name || ''), subtitle: `BYU building · ${d.building_code || ''}` }, d.building_code, d.name, BUILDING_NICKNAMES[String(d.building_code || '').toUpperCase()] || []);
  }
  for (const f of facilities) {
    add({ type: 'city', id: f.index, title: String(f.name || ''), subtitle: `Provo · ${f.kind || 'Parking'}` }, '', f.name);
  }
  // Misspellings only fill in when the exact search found little, so they never push real matches down.
  const merged = results.length >= 3 ? results : [...results, ...fuzzy];
  return merged.sort((a, b) => a.rank - b.rank || a.title.localeCompare(b.title) || String(a.id).localeCompare(String(b.id)))
    .slice(0, 8).map(({ rank, ...entry }) => entry);
}


export const QUICK_FILTERS = [
  { id: 'near-me', label: 'Near me', hint: 'Sort lots closest to your GPS location' },
  { id: 'visitor', label: 'Visitor', hint: 'Show BYU visitor parking options' },
  { id: 'free-now', label: 'Free now', hint: 'Open-to-all & Provo city parking' },
];

const NL_TIME_PATTERN = /\b(\d{1,2}(:\d{2})?\s*(am|pm)|tomorrow|tonight|today|this\s+(morning|afternoon|evening)|monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)\b/i;
const NL_INTENT_PATTERN = /\b(permit|class|classes|exam|until|till|for\s+\d+\s*(h|hr|hrs|hour|hours|min|mins|minutes)|where\s+can\s+i|allowed|with\s+my)\b/i;

/** Returns true when a query reads like a trip sentence best handled by the AI trip finder (#nl-form). */
export function isNaturalLanguageTripQuery(query) {
  const raw = String(query || '').trim();
  const words = normalize(raw).split(' ').filter(Boolean);
  if (words.length < 2) return false;
  return NL_TIME_PATTERN.test(raw) || NL_INTENT_PATTERN.test(raw) || words.length >= 5;
}
