// Loads everything the screens need from Supabase in one round trip.
import { state, DEMO_USER_ID } from "../state.js";

export async function loadData() {
  const db = state.db;
  const [areasRes, favRes, permitRes, ruleRes, towRes, sessRes] = await Promise.all([
    db.from("parking_area").select("area_id, area_name, lot_code, operator, latitude, longitude, total_spaces, est_available_spaces, availability_updated_at, is_free, tow_company_id").order("area_name"),
    db.from("favorite_area").select("area_id").eq("user_id", DEMO_USER_ID),
    db.from("permit").select("permit_id, permit_code, permit_name, description, cost_note, source_url, last_verified_on").order("permit_code"),
    db.from("parking_rule").select("rule_id, area_id, permit_id, days_of_week, start_time, end_time, max_stay_minutes, blocked_start, blocked_end, source_url, last_verified_on, rule_note"),
    db.from("tow_company").select("tow_company_id, company_name, phone, is_sample_data"),
    db.from("parking_session").select("*").eq("user_id", DEMO_USER_ID).eq("status", "active").order("started_at", { ascending: false }).limit(1),
  ]);
  for (const res of [areasRes, favRes, permitRes, ruleRes, towRes, sessRes]) if (res.error) throw res.error;

  // Lot shapes for the map. Asked for separately so the app still loads (as dots on the map)
  // if the map-fields migration has not been run on this database yet.
  const shapesRes = await db.from("parking_area").select("area_id, boundary, source_url, last_verified_on");
  if (shapesRes.error) console.warn("No lot shapes yet:", shapesRes.error.message);
  const shapeById = new Map((shapesRes.data || []).map((s) => [s.area_id, s]));
  for (const a of areasRes.data) {
    const s = shapeById.get(a.area_id);
    Object.assign(a, { boundary: s?.boundary || null, source_url: s?.source_url || null, last_verified_on: s?.last_verified_on || null });
  }

  state.areas = areasRes.data;
  state.permits = permitRes.data;
  state.favoriteIds = new Set(favRes.data.map((f) => f.area_id));
  state.towById = new Map(towRes.data.map((t) => [t.tow_company_id, t]));
  state.rulesByArea = new Map();
  for (const r of ruleRes.data) {
    if (!state.rulesByArea.has(r.area_id)) state.rulesByArea.set(r.area_id, []);
    state.rulesByArea.get(r.area_id).push(r);
  }
  state.activeSession = sessRes.data[0] || null;
}
