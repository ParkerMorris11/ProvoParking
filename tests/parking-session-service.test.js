import test from "node:test";
import assert from "node:assert/strict";
import { createParkingSessionService } from "../js/data/parking-session-service.js";
import { validateSessionPreferences, getSessionTiming, sessionFromRow } from "../js/domain/session-contract.js";

const id = "11111111-1111-4111-8111-111111111111";
const input = { location: { name: "Library garage", id: "lot-42", coordinates: { latitude: 40, longitude: -111 } }, durationMinutes: 120, reminderMinutesBefore: 10, notes: "Row C" };
const row = { id, owner_id: "owner-1", location_id: "lot-42", location_name: "Library garage", latitude: 40, longitude: -111, is_sample: false,
  started_at: "2026-10-29T12:00:00Z", expires_at: "2026-10-29T14:00:00Z", created_at: "2026-10-29T12:00:00Z",
  duration_minutes: 120, reminder_minutes_before: 10, notes: "Row C", status: "active", completed_at: null };
function mock({ data = [row], error = null, signedIn = true } = {}) {
  const calls = [];
  return { calls, auth: { getUser: async () => ({ data: { user: signedIn ? { id: "verified-user" } : null }, error: null }) },
    rpc: async (name, args) => { calls.push({ name, args }); return { data, error }; } };
}

test("create sends structured RPC arguments and never a client-chosen owner or timestamp", async () => {
  const client = mock(), service = createParkingSessionService(client);
  const saved = await service.createSession(input);
  assert.equal(saved.id, id);
  assert.equal(saved.ownerId, "owner-1");
  assert.equal(saved.startedAt, "2026-10-29T12:00:00.000Z");
  assert.deepEqual(client.calls, [{ name: "p7_create_parking_session", args: {
    p_location_name: "Library garage", p_location_id: "lot-42", p_latitude: 40, p_longitude: -111,
    p_is_sample: false, p_duration_minutes: 120, p_reminder_minutes_before: 10, p_notes: "Row C",
  } }]);
});

test("location ID/coordinates are optional and notes remain safe plain text", () => {
  const result = validateSessionPreferences({ location: { name: " Garage " }, durationMinutes: 30, reminderMinutesBefore: 0, notes: " <b>Row C</b> " });
  assert.deepEqual(result.location, { id: null, name: "Garage", coordinates: null, isSample: false });
  assert.equal(result.notes, "<b>Row C</b>");
});

test("validates all supported durations and reminder combinations", () => {
  for (let duration = 30; duration <= 720; duration += 30) {
    for (const reminder of [0, 5, 10, 15, 30].filter(r => r < duration)) {
      assert.equal(validateSessionPreferences({ ...input, durationMinutes: duration, reminderMinutesBefore: reminder }).durationMinutes, duration);
    }
  }
});

test("invalid preferences fail before making a database request", async () => {
  const client = mock(), service = createParkingSessionService(client);
  for (const invalid of [null, {}, { ...input, durationMinutes: 45 }, { ...input, durationMinutes: "120" },
    { ...input, reminderMinutesBefore: 7 }, { ...input, durationMinutes: 30, reminderMinutesBefore: 30 },
    { ...input, location: { name: " " } }, { ...input, location: { name: "Garage", coordinates: { latitude: 91, longitude: 0 } } },
    { ...input, notes: "x".repeat(201) }, { ...input, ownerId: "another-user" }, { ...input, startedAt: "fake" }]) {
    await assert.rejects(() => service.createSession(invalid), { code: "INVALID_SESSION", status: 400 });
  }
  assert.equal(client.calls.length, 0);
});

test("requires a verified user and does not use the legacy demo identity", async () => {
  const client = mock({ signedIn: false });
  const service = createParkingSessionService(client);
  await assert.rejects(() => service.createSession(input), { code: "AUTH_REQUIRED", status: 401 });
  await assert.rejects(() => service.getActiveSession(), { code: "AUTH_REQUIRED", status: 401 });
  await assert.rejects(() => service.endSession(id), { code: "AUTH_REQUIRED", status: 401 });
  assert.equal(client.calls.length, 0);
});

test("no active session returns null; ending sends only the session ID", async () => {
  assert.equal(await createParkingSessionService(mock({ data: [] })).getActiveSession(), null);
  const client = mock({ data: [{ ...row, status: "completed", completed_at: "2026-10-29T13:00:00Z" }] });
  const completed = await createParkingSessionService(client).endSession(id);
  assert.equal(completed.endedAt, "2026-10-29T13:00:00.000Z");
  assert.deepEqual(client.calls, [{ name: "p7_end_parking_session", args: { p_session_id: id } }]);
  await assert.rejects(() => createParkingSessionService(client).endSession("not-a-uuid"), { status: 400 });
});

test("maps database authorization, validation, conflict, not-found and availability errors", async () => {
  for (const [code, status] of [["23505", 409], ["23514", 400], ["42501", 403], ["P0002", 404], ["08006", 503]]) {
    await assert.rejects(() => createParkingSessionService(mock({ error: { code } })).getActiveSession(), { status });
  }
  const client = mock();
  client.rpc = async () => { throw new Error("network"); };
  await assert.rejects(() => createParkingSessionService(client).getActiveSession(), { status: 503 });
});

test("time reconstructs after downtime with exact reminder/expiration boundaries", () => {
  const session = sessionFromRow(row), start = Date.parse(session.startedAt);
  assert.deepEqual(getSessionTiming(session, start + 60 * 60000), { phase: "active", elapsedMs: 3600000, remainingMs: 3600000 });
  assert.equal(getSessionTiming(session, start + 110 * 60000).phase, "reminder");
  assert.equal(getSessionTiming({ ...session, reminderMinutesBefore: 0 }, start + 115 * 60000).phase, "active");
  assert.deepEqual(getSessionTiming(session, start + 150 * 60000), { phase: "expired", elapsedMs: 9000000, remainingMs: 0 });
  const completed = { ...session, endedAt: new Date(start + 60 * 60000).toISOString() };
  assert.deepEqual(getSessionTiming(completed, start + 999 * 60000), { phase: "completed", elapsedMs: 3600000, remainingMs: 3600000 });
});
