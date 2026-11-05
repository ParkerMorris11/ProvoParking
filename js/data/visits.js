// One visit per signed-in account per page load, including auth restoration.
// The database stamps opened_at; browser clocks cannot alter the metric.
import { state, currentUserId } from "../state.js";

const visits = new Map();
export function recordAppVisit() {
  const userId = currentUserId();
  let visit = visits.get(userId);
  if (visit?.request) return visit.request;
  if (!visit) { visit = { token: crypto.randomUUID(), request: null }; visits.set(userId, visit); }
  const client = state.db;
  const request = (async () => {
    const { error } = await client.from("app_visit").insert({ user_id: userId, open_token: visit.token });
    // A response may be lost after a successful write. Retrying the same token is safe.
    if (error && error.code !== "23505") throw error;
  })();
  visit.request = request;
  request.catch(() => { if (visit.request === request) visit.request = null; });
  return request;
}
