// Shared app state. Pages read from here; data/*.js and pages update it.
import { nowHHMM } from "./lib/format.js";

// No login yet: the app acts as the demo user seeded in schema.sql (Emma Carter, user_id 1).
// Sprint 2 replaces this with the signed-in Supabase Auth user.
export const DEMO_USER_ID = 1;

export const state = {
  db: null,               // Supabase client, set in main.js
  areas: [],
  permits: [],
  rulesByArea: new Map(), // area_id -> parking_rule rows
  towById: new Map(),
  favoriteIds: new Set(),
  activeSession: null,
  currentView: null,
  // What the user picked on the Find screen.
  find: { permitId: null, day: new Date().getDay(), time: nowHHMM() },
};

export function rulesFor(areaId) {
  return state.rulesByArea.get(areaId) || [];
}
