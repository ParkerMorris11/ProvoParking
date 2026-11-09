import test from "node:test";
import assert from "node:assert/strict";
import { renderCar } from "../js/pages/car.js";
import { state } from "../js/state.js";

test("My car uses the explicitly selected section and never defaults an unknown section to the first lot", () => {
  const elements = new Map();
  const select = {
    value: "",
    set innerHTML(html) {
      this.options = [...html.matchAll(/<option value="([^"]*)"/g)].map(match => ({ value: match[1] }));
      this.value = this.options[0]?.value ?? "";
    },
  };
  elements.set("car-area", select);
  elements.set("car-minutes", { value: "30" });
  globalThis.document = { getElementById(id) {
    if (!elements.has(id)) elements.set(id, {});
    return elements.get(id);
  } };
  state.user = { userId: 1 };
  state.areas = [
    { area_id: 17, area_name: "Lot 19Y section A" },
    { area_id: 43, area_name: "Lot 19Y section B" },
    { area_id: 99, area_name: "Sample lot", is_sample_data: true },
  ];
  try {
    renderCar("43");
    assert.equal(select.value, "43");
    renderCar("99");
    assert.equal(select.value, "");
    renderCar("999");
    assert.equal(select.value, "");
    renderCar();
    assert.equal(select.value, "");
  } finally {
    delete globalThis.document;
  }
});
