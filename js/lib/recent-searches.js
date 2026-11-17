// The last few places a person picked from search, kept for this tab only (sessionStorage), so a shared
// phone or a different account never sees someone else's list. Only the picked result is stored, never typed text.
const KEY = "provoParking.recentSearches";
const LIMIT = 5;

export function loadRecents(storage = globalThis.sessionStorage) {
  try {
    const list = JSON.parse(storage.getItem(KEY) || "[]");
    return Array.isArray(list) ? list.filter(r => r && ["lot", "destination", "city"].includes(r.type) && r.title).slice(0, LIMIT) : [];
  } catch { return []; }
}

export function rememberRecent(result, storage = globalThis.sessionStorage) {
  if (!result?.title || !["lot", "destination", "city"].includes(result.type)) return loadRecents(storage);
  const entry = { type: result.type, id: result.id, title: String(result.title), subtitle: String(result.subtitle || "") };
  const next = [entry, ...loadRecents(storage).filter(r => !(r.type === entry.type && r.id === entry.id))].slice(0, LIMIT);
  try { storage.setItem(KEY, JSON.stringify(next)); } catch { /* private mode: nothing to keep */ }
  return next;
}

export function clearRecents(storage = globalThis.sessionStorage) {
  try { storage.removeItem(KEY); } catch { /* nothing stored */ }
}
