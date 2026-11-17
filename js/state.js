// Shared app state. Pages read from here; data/*.js and pages update it.
import { nowHHMM } from "./lib/format.js";

export const state = {
  visitTracker: null,
  db: null,               // Supabase client, set in main.js
  user: null,             // signed-in profile { userId, displayName, email, permitIds }, or null
  authId: null,
  authVersion: 0, // invalidates requests from a previous account
  guest: false,           // true after "Continue as guest"
  areas: [],
  permits: [],
  destinations: [],
  rulesByArea: new Map(), // area_id -> parking_rule rows
  towById: new Map(),
  favoriteIds: new Set(),
  favoriteNames: new Map(), // area_id -> nickname the user gave that favorite
  activeSession: null,
  currentView: null,
  lotOrigin: null, // { view, results } of the screen a lot page was opened from (for its back link)
  // What the user picked on the Find screen.
  find: { permitId: null, destinationId: null, customDestination: null, live: true, day: new Date().getDay(), time: nowHHMM() },
};

export function rulesFor(areaId) {
  return state.rulesByArea.get(areaId) || [];
}

// The signed-in user's app_user.user_id. Saving personal data requires an account.
export function currentUserId() {
  if (!state.user) throw new Error("Log in to save this.");
  return state.user.userId;
}
