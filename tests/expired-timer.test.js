// Ported from #51: the timer pill never counts a negative time forever.
import test from "node:test";
import assert from "node:assert/strict";
import { fabText, fabLabel } from "../js/components/car-fab.js";

const MIN = 60000;

test("timer pill: h:mm while time is left, then \"Time's up\" instead of a negative count", () => {
  assert.equal(fabText(75 * MIN), "1:15");
  assert.equal(fabText(0), "0:00");
  assert.equal(fabText(-30 * 1000), "0:00", "the first minute over still reads 0:00");
  assert.equal(fabText(-12 * MIN), "Time's up");
  assert.equal(fabText(-(146 * 60 + 28) * MIN), "Time's up", "a timer left running for days never shows -146:28");
  for (const ms of [-MIN, -90 * MIN, -7 * 24 * 60 * MIN]) assert.doesNotMatch(fabText(ms), /-|\d+:\d\d/);
});

test("timer pill label keeps the exact overage and points to ending the timer", () => {
  assert.equal(fabLabel(-(146 * 60 + 28) * MIN), "Parking timer: time is up, ended 146 h 28 min ago. Open to end the timer.");
  assert.match(fabLabel(-20 * 1000), /ended 1 min ago/);
  assert.match(fabLabel(30 * MIN), /30 min left/);
});
