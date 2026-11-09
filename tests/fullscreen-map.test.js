import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chipText, sheetTitle } from '../js/pages/fullscreen-map.js';

const permits = [
  { permit_id: 1, permit_code: 'Y', permit_name: 'Y Undergraduate' },
  { permit_id: 2, permit_code: 'G', permit_name: 'G Graduate' },
];

test('permit chip shows the permit code and "Now" when parking right now', () => {
  const chip = chipText({ permitId: 1, live: true }, permits);
  assert.equal(chip.code, 'Y');
  assert.equal(chip.text, 'Y · Now');
  assert.match(chip.label, /^Y Undergraduate, right now\. Change permit or time$/);
});

test('permit chip shows the planned day and time', () => {
  const chip = chipText({ permitId: 2, live: false, day: 6, time: '10:00' }, permits);
  assert.equal(chip.text, 'G · Sat 10:00 AM');
  assert.match(chip.label, /Sat at 10:00 AM/);
});

test('permit chip asks for a permit when none is chosen (guests and new accounts)', () => {
  const chip = chipText({ permitId: null, live: true }, permits);
  assert.equal(chip.code, 'P');
  assert.equal(chip.text, 'Choose permit · Now');
  assert.match(chip.label, /^No permit chosen/);
});

test('permit chip never throws on a half-filled planned time', () => {
  const chip = chipText({ permitId: 1, live: false, day: null, time: '' }, permits);
  assert.equal(chip.text, 'Y · Choose time');
});

test('list title counts areas with the right wording', () => {
  assert.equal(sheetTitle(33, true), '33 areas match your permit');
  assert.equal(sheetTitle(1, true), '1 area matches your permit');
  assert.equal(sheetTitle(0, false), '0 areas match for everyone');
});

test('full-screen layout stays out of the shared files teammates edit', async () => {
  // The layout is built at runtime from the existing Areas markup, so index.html keeps every id it relies on.
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  for (const id of ['view-areas', 'parking-map', 'locate-me', 'area-list', 'areas-summary', 'areas-count', 'map-note']) {
    assert.match(html, new RegExp(`id="${id}"`), `index.html still has #${id}`);
  }
  for (const cls of ['map-stage', 'parking-results', 'parking-workspace']) assert.match(html, new RegExp(`class="${cls}`));
  // Every color in the new stylesheet comes from a site variable, so dark mode applies automatically.
  const css = await readFile(new URL('../css/fullscreen-map.css', import.meta.url), 'utf8');
  const bareColors = css.replace(/var\(--[a-z0-9-]+, #[0-9a-f]{3,8}\)/gi, '').replace(/url\("data:[^"]*"\)/g, '').match(/#[0-9a-f]{3,8}\b/gi) || [];
  assert.deepEqual(bareColors.filter(c => !/^#(fff|0f1e37\w*)$/i.test(c)), [], 'only white-on-blue text and shadows are fixed colors');
});
