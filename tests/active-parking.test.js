import test from "node:test";
import assert from "node:assert/strict";
import { startParkingSession, validateActiveSession, timerSnapshot, endParkingSession, clockLabel, sampleSession } from "../js/domain/active-parking.js";
import { loadTimerSession, startLocalTimer, endLocalTimer, TIMER_STORAGE_KEY } from "../js/lib/timer-storage.js";

const now = Date.parse("2026-10-29T12:00:00.000Z");
const preferences = { durationMinutes: 120, reminderMinutesBefore: 10, notes: "Row C" };
const create = (changes = {}) => startParkingSession({ ...preferences, ...changes }, now, "session-1");
function memoryStorage() {
  const values = new Map();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}

test("start creates explicit timestamps from the confirmed P5 preferences", () => {
  const session = create();
  assert.equal(session.startedAt, "2026-10-29T12:00:00.000Z");
  assert.equal(session.expiresAt, "2026-10-29T14:00:00.000Z");
  assert.equal(session.endedAt, null);
  assert.equal(session.notes, "Row C");
  assert.equal(session.id, "session-1");
});

test("remaining and elapsed use timestamps after long tab inactivity", () => {
  const session = create();
  assert.deepEqual(timerSnapshot(session, now), { phase: "active", remainingMs: 7200000, elapsedMs: 0 });
  const afterInactive = timerSnapshot(session, now + 65 * 60000 + 1250);
  assert.equal(afterInactive.remainingMs, 55 * 60000 - 1250);
  assert.equal(afterInactive.elapsedMs, 65 * 60000 + 1250);
});

test("reminder triggers exactly at its threshold and also when opening late", () => {
  const session = create();
  assert.equal(timerSnapshot(session, now + 110 * 60000 - 1).phase, "active");
  assert.equal(timerSnapshot(session, now + 110 * 60000).phase, "reminder");
  assert.equal(timerSnapshot(session, now + 119 * 60000).phase, "reminder");
  assert.equal(timerSnapshot(create({ reminderMinutesBefore: 0 }), now + 119 * 60000).phase, "active");
});

test("exact expiry and later times clamp to zero without losing elapsed time", () => {
  const session = create();
  assert.equal(timerSnapshot(session, now + 120 * 60000).phase, "expired");
  const overdue = timerSnapshot(session, now + 150 * 60000);
  assert.equal(overdue.remainingMs, 0);
  assert.equal(overdue.elapsedMs, 150 * 60000);
  assert.equal(clockLabel(overdue.remainingMs), "00:00:00");
  assert.equal(clockLabel(1, true), "00:00:01");
  assert.equal(clockLabel(3661123), "01:01:01");
});

test("ending freezes elapsed time, works after expiry, and is idempotent", () => {
  const session = create();
  const completed = endParkingSession(session, now + 20 * 60000);
  assert.equal(session.endedAt, null);
  assert.equal(timerSnapshot(completed, now + 500 * 60000).phase, "completed");
  assert.equal(timerSnapshot(completed, now + 500 * 60000).elapsedMs, 20 * 60000);
  assert.deepEqual(endParkingSession(completed, now + 99 * 60000), completed);
  assert.equal(timerSnapshot(endParkingSession(session, now + 150 * 60000)).remainingMs, 0);
});

test("validates supplied timestamps, session fields, duration agreement, and locations", () => {
  const session = create();
  for (const input of [null, {}, { ...session, id: " " }, { ...session, startedAt: "bad" },
    { ...session, expiresAt: "2026-10-29T12:30:00Z" }, { ...session, endedAt: "bad" },
    { ...session, endedAt: "2026-10-29T11:59:00Z" }, { ...session, location: null },
    { ...session, durationMinutes: undefined }, { ...session, reminderMinutesBefore: undefined }]) {
    assert.throws(() => validateActiveSession(input));
  }
  const normalized = validateActiveSession({ ...session, ignored: "not copied" });
  assert.equal(normalized.ignored, undefined);
  normalized.location.coordinates.latitude = 20;
  assert.notEqual(session.location.coordinates.latitude, 20);
});

test("standalone sample modes cover countdown, reminder, near expiry, and expired", () => {
  for (const [mode, phase] of [["active", "active"], ["reminder", "reminder"], ["expiring", "reminder"], ["expired", "expired"]]) {
    assert.equal(timerSnapshot(sampleSession(mode, now), now).phase, phase);
  }
  assert.equal(timerSnapshot(sampleSession("expiring", now), now).remainingMs, 10000);
});

test("local session survives a fresh read and prevents replacing an unended session", () => {
  const storage = memoryStorage();
  assert.equal(loadTimerSession(storage), null);
  const session = startLocalTimer(preferences, now, storage);
  assert.deepEqual(loadTimerSession(storage), session);
  assert.throws(() => startLocalTimer(preferences, now, storage), /already have/);
  const completed = endLocalTimer(session, now + 1000, storage);
  assert.deepEqual(loadTimerSession(storage), completed);
  const next = startLocalTimer(preferences, now + 2000, storage);
  assert.notEqual(next.id, session.id);
});

test("stale tabs cannot end a newer session", () => {
  const storage = memoryStorage();
  const session = startLocalTimer(preferences, now, storage);
  endLocalTimer(session, now + 1000, storage);
  const next = startLocalTimer(preferences, now + 2000, storage);
  assert.throws(() => endLocalTimer(session, now + 3000, storage), /another tab/);
  assert.deepEqual(loadTimerSession(storage), next);
});

test("storage and corrupt data failures are explicit rather than silently losing the timer", () => {
  const storage = memoryStorage();
  storage.setItem(TIMER_STORAGE_KEY, "bad JSON");
  assert.throws(() => loadTimerSession(storage), /could not be read/);
  storage.setItem(TIMER_STORAGE_KEY, JSON.stringify({ id: "bad-session" }));
  assert.throws(() => loadTimerSession(storage), /could not be read/);
  assert.throws(() => loadTimerSession({ getItem() { throw new Error(); } }), /could not be read/);
  assert.throws(() => startLocalTimer(preferences, now, {
    getItem: () => null, setItem() { throw new Error("quota"); },
  }), /could not be saved/);
});
