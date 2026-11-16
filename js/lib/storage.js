// A guest preference and each account’s device fallback must stay separate.
const LEGACY_PERMIT_KEY = "provoParking.permitId";
const permitKey = (userId) => userId == null ? `${LEGACY_PERMIT_KEY}.guest` : `${LEGACY_PERMIT_KEY}.user.${userId}`;

export function loadSavedPermit(userId) {
  try {
    // The old preference did not track its owner and cannot safely be assigned to anyone.
    localStorage.removeItem(LEGACY_PERMIT_KEY);
    const value = localStorage.getItem(permitKey(userId));
    return value ? Number(value) : null;
  } catch { return null; }
}

export function savePermit(id, userId) {
  try { localStorage.setItem(permitKey(userId), String(id)); } catch { /* private mode: keep it in memory only */ }
}
