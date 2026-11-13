// Account timer API. The database owns timestamps, identity, and the one-active-session invariant.
import { state, currentUserId } from "../state.js";
import { syncParkingClock } from "../lib/server-clock.js";
const SYNC_KEY="provoParking.timer.changed";
export function notifyTimerChanged() {
  try { localStorage.setItem(SYNC_KEY,String(Date.now())+Math.random()); } catch { /* Focus/poll refresh remains available. */ }
}
export function isTimerChange(key) { return key===SYNC_KEY; }
function timerError(error) {
  if(error?.code==="23505") return new Error("You already have an active timer. Open it or end it before starting another.");
  if(["PGRST202","42883"].includes(error?.code)) return new Error("Account timer setup is not available yet. Please ask the team to apply the timer database update.");
  return new Error(error?.message||"Could not reach your saved timer. Check your connection and try again.");
}
async function request(name,args) {
  const {data,error}=await state.db.rpc(name,args);
  if(error) throw timerError(error);
  return data;
}
export function acceptTimerSnapshot(snapshot) {
  if(!snapshot||!snapshot.server_now) throw new Error("The timer response was incomplete. Please try again.");
  syncParkingClock(snapshot.server_now);
  state.activeSession=snapshot.session||null;
}
export async function getTimerSnapshot() { currentUserId(); return request("parking_timer_snapshot"); }
export async function startSession({areaId,minutes,reminderMinutes,carNote,destinationId,permitId}) {
  const userId=currentUserId();
  if(!Number.isSafeInteger(destinationId)||destinationId<=0) throw new Error("Choose a destination building before starting your timer.");
  if(!Number.isSafeInteger(areaId)||areaId<=0||!Number.isSafeInteger(minutes)||minutes<1||minutes>1440||
     !Number.isSafeInteger(reminderMinutes)||reminderMinutes<0||reminderMinutes>minutes||
     (carNote||"").length>200) throw new Error("Check your parking lot, duration, reminder and note.");
  const visitOwner=state.authId;
  const visit=state.visitTracker?.captureAccount?.(visitOwner);
  const snapshot=await request("parking_timer_start",{p_area_id:areaId,p_minutes:minutes,p_reminder:reminderMinutes,p_note:carNote||null,p_destination_id:destinationId,p_permit_id:permitId??null});
  // Never let a previous account's result attach telemetry to its replacement.
  if(visit&&state.user?.userId===userId&&state.authId===visitOwner) void state.visitTracker?.accountStarted(snapshot.session,visitOwner,visit);
  notifyTimerChanged();
  return snapshot;
}
export async function endSession(session) {
  currentUserId();
  const snapshot=await request("parking_timer_end",{p_session_id:session.session_id});
  notifyTimerChanged();
  return snapshot;
}
export async function saveCarNote(session,note) {
  currentUserId();
  const {data,error}=await state.db.from("parking_session").update({car_note:note}).eq("session_id",session.session_id).eq("status","active").select().single();
  if(error) throw timerError(error);
  notifyTimerChanged();
  return data;
}
