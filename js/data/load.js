// Loads everything the screens need from Supabase in one round trip.
// Reference data (areas, permits, rules, tow companies) is public. Favorites and the active
// My car session load only for a signed-in user, and row security returns only their rows.
import { state } from "../state.js";
import { syncParkingClock } from "../lib/server-clock.js";
import { labelAreas } from "../domain/lot-names.js";

// PP has only a legacy sample street, with no verified residential permit zones on the map.
// Hide it from both pickers without deleting permits, rules, or existing account links.
const selectablePermits = (permits) => permits.filter((p) => p.permit_code !== "PP");

// Nicknames come from a newer column. If the database has not been migrated yet (Postgres 42703,
// undefined column), load favorites without nicknames instead of failing the whole app.
async function loadFavoriteRows(db, userId) {
  const res = await db.from("favorite_area").select("area_id, nickname").eq("user_id", userId);
  if (res.error?.code === "42703") return db.from("favorite_area").select("area_id").eq("user_id", userId);
  return res;
}

export async function loadData() {
  const db = state.db;
  const version = state.authVersion;
  const userId = state.user?.userId ?? null;
  const none = Promise.resolve({ data: [], error: null });
  const [areasRes, favRes, permitRes, ruleRes, towRes, sessRes, destRes] = await Promise.all([
    db.from("parking_area").select("area_id, area_name, lot_code, operator, latitude, longitude, total_spaces, est_available_spaces, availability_updated_at, is_free, tow_company_id, is_sample_data, source_feature_id").order("area_name"),
    userId ? loadFavoriteRows(db, userId) : none,
    db.from("permit").select("permit_id, permit_code, permit_name, issuer, description, cost_note, source_url, last_verified_on").order("permit_code"),
    db.from("parking_rule").select("rule_id, area_id, permit_id, days_of_week, start_time, end_time, max_stay_minutes, blocked_start, blocked_end, source_url, last_verified_on, rule_note"),
    db.from("tow_company").select("tow_company_id, company_name, phone, is_sample_data"),
    userId ? db.rpc("parking_timer_snapshot") : none,
    db.from("destination").select("destination_id, building_code, name, latitude, longitude").order("name"),
  ]);
  if (version !== state.authVersion) return false;
  for (const res of [areasRes, favRes, permitRes, ruleRes, towRes, sessRes, destRes]) if (res.error) throw res.error;

  state.areas = labelAreas(areasRes.data, destRes.data);
  state.permits = selectablePermits(permitRes.data);
  state.destinations = destRes.data;
  state.favoriteIds = new Set(favRes.data.map((f) => f.area_id));
  state.favoriteNames = new Map(favRes.data.filter((f) => f.nickname).map((f) => [f.area_id, f.nickname]));
  state.towById = new Map(towRes.data.map((t) => [t.tow_company_id, t]));
  state.rulesByArea = new Map();
  for (const r of ruleRes.data) {
    if (!state.rulesByArea.has(r.area_id)) state.rulesByArea.set(r.area_id, []);
    state.rulesByArea.get(r.area_id).push(r);
  }
  state.activeSession = userId ? sessRes.data?.session || null : null;
  if (userId && sessRes.data?.server_now) syncParkingClock(sessRes.data.server_now);
  return true;
}

// Public reference data only, for the sign-up permit search before anyone is signed in.
export async function loadPermitChoices() {
  const { data, error } = await state.db.from("permit")
    .select("permit_id, permit_code, permit_name, issuer, description")
    .order("permit_id"); // table order: Y and G first
  if (error) throw error;
  return selectablePermits(data);
}
