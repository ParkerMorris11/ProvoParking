import test from "node:test";
import assert from "node:assert/strict";
import { state } from "../js/state.js";
import { loadData, loadPermitChoices } from "../js/data/load.js";
import { renderFind } from "../js/pages/find.js";

const permits = [
  { permit_id: 1, permit_code: "Y", permit_name: "Y Undergraduate" },
  { permit_id: 3, permit_code: "PP", permit_name: "Provo Residential Permit" },
  { permit_id: 5, permit_code: "U", permit_name: "U Affiliated Personnel" },
];
const rules = [{ rule_id: 1, area_id: 3, permit_id: 3 }];
function client(error = null) {
  return { from(table) {
    const data = table === "permit" ? permits : table === "parking_rule" ? rules : [];
    return {
      select() { return this; }, order() { return this; },
      then(resolve, reject) { return Promise.resolve({ data, error }).then(resolve, reject); },
    };
  } };
}

test("sign-up permit choices omit PP while keeping other permits and the source records", async () => {
  state.db = client();
  const choices = await loadPermitChoices();
  assert.deepEqual(choices.map(p => p.permit_code), ["Y", "U"]);
  assert.equal(permits[1].permit_code, "PP");
});

test("Find omits PP even when the database retains legacy residential records", async () => {
  state.db = client();
  state.user = null;
  state.authVersion = 1;
  state.find = { permitId: null, destinationId: null, live: false, day: 1, time: "10:00" };
  assert.equal(await loadData(), true);
  const elements = new Map();
  globalThis.document = { getElementById(id) {
    if (!elements.has(id)) elements.set(id, {});
    return elements.get(id);
  } };
  renderFind();
  const options = elements.get("permit-select").innerHTML;
  assert.match(options, /Y Undergraduate/);
  assert.match(options, /U Affiliated Personnel/);
  assert.doesNotMatch(options, /Provo Residential Permit|value="3"/);
  assert.deepEqual(state.rulesByArea.get(3), rules);
});

test("sign-up reference-data errors still propagate", async () => {
  const error = new Error("Could not load permits");
  state.db = client(error);
  await assert.rejects(loadPermitChoices(), error);
});
