import test from "node:test";
import assert from "node:assert/strict";
import { renderCar } from "../js/pages/car.js";
import { state } from "../js/state.js";

// Minimal stand-in for the DOM: every element accepts the properties and methods the sheet uses.
function fakeElement() {
  return {
    value: "", hidden: false, textContent: "", innerHTML: "", options: [],
    setAttribute() {}, removeAttribute() {}, focus() {}, querySelectorAll() { return []; },
    classList: { toggle() {}, add() {}, remove() {} },
  };
}

test("My car uses the explicitly selected section and never defaults an unknown section to the first lot", () => {
  const elements = new Map();
  globalThis.document = { getElementById(id) {
    if (!elements.has(id)) elements.set(id, fakeElement());
    return elements.get(id);
  } };
  state.user = { userId: 1 };
  state.activeSession = null;
  state.areas = [
    { area_id: 17, area_name: "Lot 19Y section A" },
    { area_id: 43, area_name: "Lot 19Y section B" },
    { area_id: 99, area_name: "Sample lot", is_sample_data: true },
  ];
  const area = () => elements.get("car-area").value;
  try {
    renderCar("43");
    assert.equal(area(), "43");
    assert.equal(elements.get("car-picked-name").textContent, "Lot 19Y section B");
    renderCar("99");
    assert.equal(area(), "");
    renderCar("999");
    assert.equal(area(), "");
    renderCar();
    assert.equal(area(), "");
  } finally {
    delete globalThis.document;
  }
});
