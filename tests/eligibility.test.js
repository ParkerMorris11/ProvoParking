// Unit tests for js/domain/eligibility.js. Run with: npm test (Node 20+, no installs needed).
import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluate, ruleAppliesOnDay, inWindow } from "../js/domain/eligibility.js";

const Y = 1, G = 2, PP = 3;
const rule = (extra) => ({
  days_of_week: "All", start_time: "00:00:00", end_time: "23:59:00",
  max_stay_minutes: null, blocked_start: null, blocked_end: null, permit_id: null, ...extra,
});
// Like the sample Y lot: Y and G permits, no parking 1-5 a.m.
const yLot = [Y, G].map((p) => rule({ permit_id: p, blocked_start: "01:00:00", blocked_end: "05:00:00" }));
const TUE = 2;

test("a permit listed on the rule can park", () => {
  assert.equal(evaluate(yLot, Y, TUE, "08:00").kind, "ok");
});

test("a permit not listed on the rule cannot park", () => {
  const r = evaluate(yLot, PP, TUE, "08:00");
  assert.equal(r.kind, "no-permit");
  assert.equal(r.text, "Not covered by your permit");
});

test("no permit chosen asks the user to pick one", () => {
  assert.equal(evaluate(yLot, null, TUE, "08:00").kind, "pick");
});

test("the 1-5 a.m. ban blocks parking at 3 a.m.", () => {
  const r = evaluate(yLot, Y, TUE, "03:00");
  assert.equal(r.kind, "blocked");
  assert.equal(r.text, "No parking 1:00 AM–5:00 AM");
});

test("the ban ends at 5:00 a.m. (end is exclusive)", () => {
  assert.equal(evaluate(yLot, Y, TUE, "05:00").kind, "ok");
  assert.equal(evaluate(yLot, Y, TUE, "04:59").kind, "blocked");
});

test("an open rule (no permit) lets anyone park", () => {
  const r = evaluate([rule({})], PP, TUE, "12:00");
  assert.equal(r.kind, "ok");
  assert.equal(r.text, "Open to everyone");
});

test("a time limit is reported", () => {
  const r = evaluate([rule({ permit_id: PP, max_stay_minutes: 4320 })], PP, TUE, "12:00");
  assert.equal(r.kind, "limit");
  assert.equal(r.text, "Your permit works here, 3 days limit");
});

test("an area with no rules is unknown, never assumed allowed", () => {
  assert.equal(evaluate([], Y, TUE, "12:00").kind, "unknown");
});

test("day ranges, single days and wrap-around ranges", () => {
  assert.equal(ruleAppliesOnDay(rule({ days_of_week: "Mon-Fri" }), 3), true);
  assert.equal(ruleAppliesOnDay(rule({ days_of_week: "Mon-Fri" }), 6), false);
  assert.equal(ruleAppliesOnDay(rule({ days_of_week: "Sat" }), 6), true);
  assert.equal(ruleAppliesOnDay(rule({ days_of_week: "Fri-Mon" }), 0), true);
});

test("overnight windows wrap past midnight", () => {
  assert.equal(inWindow(23 * 60, 22 * 60, 6 * 60), true);
  assert.equal(inWindow(12 * 60, 22 * 60, 6 * 60), false);
});

test("an overnight rule covers both sides of midnight, with inclusive schedule endpoints", () => {
  const night = [rule({ permit_id: Y, start_time: "22:00:00", end_time: "06:00:00" })];
  for (const time of ["22:00", "23:59", "00:00", "06:00"]) {
    assert.equal(evaluate(night, Y, TUE, time).kind, "ok", time);
  }
  for (const time of ["21:59", "06:01", "12:00"]) {
    assert.equal(evaluate(night, Y, TUE, time).kind, "unknown", time);
  }
});

test("overnight schedules still require the selected calendar day and permit", () => {
  const night = [rule({ permit_id: Y, days_of_week: "Mon-Fri", start_time: "22:00", end_time: "06:00" })];
  assert.equal(evaluate(night, PP, TUE, "23:00").kind, "no-permit");
  assert.equal(evaluate(night, Y, 6, "02:00").kind, "unknown");
});

test("an unreadable day cannot grant parking, even in a partly valid list", () => {
  for (const days of [null, "", "Weekdays", "Mon-Fry", "Mon,Typo", "Mon-Fri-Sat"]) {
    assert.equal(evaluate([rule({ days_of_week: days })], Y, TUE, "08:00").kind, "unknown", String(days));
  }
});

test("invalid arrival values cannot return an allowed result", () => {
  for (const time of [null, "", "24:00", "12:60", "08:00junk"]) {
    assert.equal(evaluate([rule({})], Y, TUE, time).kind, "unknown", String(time));
  }
  for (const day of [-1, 7, 1.5, null]) {
    assert.equal(evaluate([rule({})], Y, day, "08:00").kind, "unknown", String(day));
  }
});

test("incomplete or unreadable restrictions cannot grant parking", () => {
  for (const extra of [
    { blocked_start: "01:00", blocked_end: null },
    { blocked_start: null, blocked_end: "05:00" },
    { blocked_start: "bad", blocked_end: "05:00" },
    { start_time: null }, { end_time: "24:00" },
  ]) {
    assert.equal(evaluate([rule(extra)], Y, TUE, "08:00").kind, "unknown", JSON.stringify(extra));
  }
});

test("overnight blocked hours start inclusively and end exclusively", () => {
  const nightBan = [rule({ blocked_start: "22:00", blocked_end: "06:00" })];
  for (const time of ["22:00", "23:59", "00:00", "05:59"]) {
    assert.equal(evaluate(nightBan, Y, TUE, time).kind, "blocked", time);
  }
  for (const time of ["21:59", "06:00"]) {
    assert.equal(evaluate(nightBan, Y, TUE, time).kind, "ok", time);
  }
});

test("switching day, time and permit rechecks the current choice", () => {
  const weekday = [rule({ permit_id: Y, days_of_week: "Mon-Fri", blocked_start: "01:00", blocked_end: "05:00" })];
  assert.equal(evaluate(weekday, Y, TUE, "08:00").kind, "ok");
  assert.equal(evaluate(weekday, PP, TUE, "08:00").kind, "no-permit");
  assert.equal(evaluate(weekday, Y, TUE, "03:00").kind, "blocked");
  assert.equal(evaluate(weekday, Y, 6, "08:00").kind, "unknown");
  assert.equal(evaluate(weekday, Y, TUE, "08:00").kind, "ok");
});
