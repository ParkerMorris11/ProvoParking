// favorite_area reads and writes. Each call returns only what the database confirmed.
import { state, currentUserId } from "../state.js";

export async function addFavorite(areaId, nickname = null) {
  // .select() makes Supabase return the saved row, so we only show what the database confirmed.
  // nickname is only sent when restoring a renamed favorite (Undo), so plain saves work before the migration.
  const row = { user_id: currentUserId(), area_id: areaId, ...(nickname ? { nickname } : {}) };
  const { data, error } = await state.db.from("favorite_area").insert(row).select().single();
  if (error) throw error;
  return data;
}

export async function removeFavorite(areaId) {
  const { data, error } = await state.db.from("favorite_area").delete()
    .eq("user_id", currentUserId()).eq("area_id", areaId).select();
  if (error) throw error;
  if (!data.length) throw new Error("The database did not remove the favorite.");
}

// Max 30 characters, matching the database check. An empty name clears the nickname.
export function cleanNickname(text) {
  const name = String(text ?? "").replace(/\s+/g, " ").trim().slice(0, 30);
  return name || null;
}

export async function renameFavorite(areaId, nickname) {
  const { data, error } = await state.db.from("favorite_area").update({ nickname: cleanNickname(nickname) })
    .eq("user_id", currentUserId()).eq("area_id", areaId).select().single();
  if (error) throw error;
  return data;
}
