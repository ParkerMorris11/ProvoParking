// B, C, D, YM and YV home lots are not in the verified data, so results must say they are shared lots only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { permitCoverageNote, sharedLotsTag } from "../js/domain/permit-coverage.js";
import { matchText } from "../js/pages/fullscreen-map.js";

test("housing permits get a note naming their missing BYU home lots", () => {
  assert.match(permitCoverageNote("B"), /U lots your B permit shares.*22B, 24B, 25B, 52B and 45BCD/);
  assert.match(permitCoverageNote("C"), /Helaman Halls lots \(41C and 45BCD\) aren't in this app yet/);
  assert.match(permitCoverageNote("D"), /Riviera lots \(63D and 45BCD\)/);
  assert.match(permitCoverageNote("YM"), /Y and U lots.*Wymount lot \(52YM\) isn't/);
});

test("permits whose lots are all in the data get no note", () => {
  for (const code of ["A", "G", "Y", "U", "V", null, undefined]) {
    assert.equal(permitCoverageNote(code), "");
    assert.equal(sharedLotsTag(code), "");
  }
});

test("chip second line says shared U sections for B/C/D, unchanged for others", () => {
  assert.equal(matchText(3, true, { day: 2 }, "C"), "3 shared U sections");
  assert.equal(matchText(3, true, { day: 2 }, "U"), "3 matching sections");
  assert.equal(matchText(33, true, { day: 2 }, "Y"), "33 matching sections");
  assert.equal(matchText(0, true, { day: 2 }, "C"), "No lots match now");
});

test("results page has the coverage note element with the BYU map link", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  assert.match(html, /id="areas-coverage"[^>]*hidden[\s\S]*?map\.byu\.edu\/\?layer=parking/);
});
