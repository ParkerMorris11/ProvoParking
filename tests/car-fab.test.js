import test from "node:test";
import assert from "node:assert/strict";
import { fmtHourMinute } from "../js/components/car-fab.js";

const MIN = 60000;

test("car button timer shows the whole h:mm left, matching the sheet's h:mm:ss", () => {
  assert.equal(fmtHourMinute(4 * 60 * MIN), "4:00");
  assert.equal(fmtHourMinute(4 * 60 * MIN - 1000), "3:59"); // sheet: 3:59:59
  assert.equal(fmtHourMinute(3 * 3600000 + 59 * MIN + 21000), "3:59"); // sheet: 3:59:21
  assert.equal(fmtHourMinute(75 * MIN), "1:15");
  assert.equal(fmtHourMinute(9 * MIN + 59000), "0:09");
  assert.equal(fmtHourMinute(59000), "0:00");
  assert.equal(fmtHourMinute(0), "0:00");
});

test("car button timer counts the time over with a minus sign", () => {
  assert.equal(fmtHourMinute(-30 * 1000), "0:00");
  assert.equal(fmtHourMinute(-12 * MIN), "-0:12");
  assert.equal(fmtHourMinute(-(65 * MIN)), "-1:05");
});
