// parking_session reads and writes (the My car timer).
import { state, DEMO_USER_ID } from "../state.js";

export async function startSession({ areaId, minutes, reminderMinutes, carNote }) {
  const row = {
    user_id: DEMO_USER_ID,
    area_id: areaId,
    planned_minutes: minutes,
    leave_by: new Date(Date.now() + minutes * 60000).toISOString(),
    reminder_minutes_before: reminderMinutes,
    car_note: carNote || null,
  };
  const { data, error } = await state.db.from("parking_session").insert(row).select().single();
  if (error) throw error;
  return data;
}

export async function endSession(session, expired) {
  const { data, error } = await state.db.from("parking_session")
    .update({ status: expired ? "expired" : "ended", ended_at: new Date().toISOString() })
    .eq("session_id", session.session_id).select();
  if (error) throw error;
  if (!data.length) throw new Error("The database did not end the session.");
}

export async function saveCarNote(session, note) {
  const { data, error } = await state.db.from("parking_session").update({ car_note: note })
    .eq("session_id", session.session_id).select().single();
  if (error) throw error;
  return data;
}
