import test from "node:test";
import assert from "node:assert/strict";
import { DURATIONS, REMINDERS, SAMPLE_LOCATION, createParkingSession, durationLabel } from "../js/domain/parking-setup.js";

test("standalone defaults produce a sample location, two hours, and a ten-minute preference", () => {
  assert.deepEqual(createParkingSession(), {
    location: SAMPLE_LOCATION, durationMinutes: 120, reminderMinutesBefore: 10, notes: "",
  });
});

test("all 24 half-hour durations and compatible reminders are accepted", () => {
  assert.equal(DURATIONS.length, 24);
  for (let minutes = 30; minutes <= 720; minutes += 30) {
    assert.ok(DURATIONS.includes(minutes));
    for (const reminder of REMINDERS.filter((r) => r < minutes)) {
      assert.equal(createParkingSession({ durationMinutes: minutes, reminderMinutesBefore: reminder }).durationMinutes, minutes);
    }
  }
  assert.equal(durationLabel(30), "30 minutes");
  assert.equal(durationLabel(60), "1 hour");
  assert.equal(durationLabel(90), "1 hour 30 minutes");
  assert.equal(durationLabel(720), "12 hours");
});

test("rejects missing, non-numeric, out-of-range, and non-step durations", () => {
  for (const durationMinutes of [null, "120", 0, 15, 31, 750, NaN, Infinity]) {
    assert.throws(() => createParkingSession({ durationMinutes }), /duration/);
  }
});

test("no reminder is supported; equal, longer, and unsupported reminder values are rejected", () => {
  assert.equal(createParkingSession({ durationMinutes: 30, reminderMinutesBefore: 0 }).reminderMinutesBefore, 0);
  for (const reminderMinutesBefore of [30, 60, -1, 7, "5", null, NaN]) {
    assert.throws(() => createParkingSession({ durationMinutes: 30, reminderMinutesBefore }), /reminder/);
  }
});

test("accepts an external location and copies it without leaking extra source fields", () => {
  const location = { id: "lot-42", name: " North garage ", coordinates: { latitude: 40, longitude: -111 }, extra: "ignored" };
  const session = createParkingSession({ location, notes: "  Level 3, Row C  " });
  assert.deepEqual(session.location, { id: "lot-42", name: "North garage", coordinates: { latitude: 40, longitude: -111 }, isSample: false });
  assert.equal(session.notes, "Level 3, Row C");
  location.coordinates.latitude = 20;
  assert.equal(session.location.coordinates.latitude, 40);
  assert.equal(createParkingSession().location.coordinates.latitude, SAMPLE_LOCATION.coordinates.latitude);
});

test("malformed external locations fail instead of silently substituting the sample", () => {
  for (const location of [null, {}, { ...SAMPLE_LOCATION, id: " " }, { ...SAMPLE_LOCATION, name: "" },
    { ...SAMPLE_LOCATION, coordinates: { latitude: 91, longitude: 0 } },
    { ...SAMPLE_LOCATION, coordinates: { latitude: 0, longitude: -181 } },
    { ...SAMPLE_LOCATION, coordinates: { latitude: "40", longitude: 0 } },
    { ...SAMPLE_LOCATION, coordinates: { latitude: 0, longitude: Infinity } }]) {
    assert.throws(() => createParkingSession({ location }), /location/);
  }
});

test("notes are optional, bounded, and preserved as plain text", () => {
  assert.equal(createParkingSession({ notes: " " }).notes, "");
  assert.equal(createParkingSession({ notes: "x".repeat(200) }).notes.length, 200);
  assert.equal(createParkingSession({ notes: "<b>near elevator</b>" }).notes, "<b>near elevator</b>");
  for (const notes of ["x".repeat(201), null, 123]) assert.throws(() => createParkingSession({ notes }), /notes/);
});
