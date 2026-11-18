import test from "node:test";
import assert from "node:assert/strict";
import { formatResultsTitle, parkingReturn } from "../js/domain/mobile-sheet.js";

test("the results heading distinguishes matching sections from availability", () => {
  assert.equal(formatResultsTitle(33, "Wilkinson Student Center"), "33 matches near the Wilk");
  assert.equal(formatResultsTitle(1, "Harold B. Lee Library"), "1 match near Harold B. Lee Library");
  assert.equal(formatResultsTitle(0), "No matching parking sections");
  assert.equal(formatResultsTitle(4), "4 matching parking sections");
});

test("guest sign-in can return to a selected lot or timer without allowing an arbitrary URL", () => {
  assert.deepEqual(parkingReturn("#car/59", 2), { hash: "#car/59", destinationId: 2 });
  assert.deepEqual(parkingReturn("#area/59", null), { hash: "#area/59", destinationId: null });
  assert.deepEqual(parkingReturn("#car", null), { hash: "#car", destinationId: null });
  assert.equal(parkingReturn("https://other.test/#car/59", 2), null);
  assert.equal(parkingReturn("#car/59/extra", 2), null);
  assert.deepEqual(parkingReturn("#area/59", "invalid"), { hash: "#area/59", destinationId: null });
});
