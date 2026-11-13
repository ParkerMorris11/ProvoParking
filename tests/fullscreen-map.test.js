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

test('runtime layout preserves the original forms, results and map landmarks', async () => {
  // The layout is built at runtime from the existing Areas markup, so index.html keeps every id it relies on.
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  for (const id of ['view-areas', 'parking-map', 'locate-me', 'area-list', 'areas-summary', 'areas-count', 'map-note']) {
    assert.match(html, new RegExp(`id="${id}"`), `index.html still has #${id}`);
  }
  for (const cls of ['map-stage', 'parking-results', 'parking-workspace']) assert.match(html, new RegExp(`class="${cls}`));
  // Fixed dark glass colors belong in the dark-theme override; controls use shared tokens.
  const css = await readFile(new URL('../css/fullscreen-map.css', import.meta.url), 'utf8');
  const themed = css.replace(/:root\[data-theme-active="dark"\] \.fs-shell \{[^}]*\}/g, "");
  const bareColors = themed.replace(/var\(--[a-z0-9-]+, #[0-9a-f]{3,8}\)/gi, '').replace(/url\("data:[^"]*"\)/g, '').match(/#[0-9a-f]{3,8}\b/gi) || [];
  assert.deepEqual(bareColors.filter(c => !/^#(fff|0f1e37\w*)$/i.test(c)), [], 'only white-on-blue text and shadows are fixed colors');
});

test('nav tabs carry icons and the quick-guide dialog keeps its landmarks', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  for (const id of ['tab-find', 'tab-areas', 'tab-lots', 'tab-favorites', 'tab-help', 'fav-count', 'nl-form', 'nl-text', 'nl-mic', 'map-mode-2d', 'map-mode-3d']) {
    assert.match(html, new RegExp(`id="${id}"`), `index.html still has #${id}`);
  }
  assert.equal((html.match(/class="tab-icon"/g) || []).length, 5, 'one icon per tab');
  assert.match(html, /<dialog id="help-modal"[^>]*aria-labelledby="help-modal-title"/);
  for (const topic of ['Permit colors', '2D and 3D', 'Live location and directions']) assert.ok(html.includes(topic));
  assert.doesNotMatch(html, /leaflet/i);
});

test('floating map controls use the shared frosted-glass tokens in light and dark mode', async () => {
  const base = await readFile(new URL('../css/styles.css', import.meta.url), 'utf8');
  const map = await readFile(new URL('../css/fullscreen-map.css', import.meta.url), 'utf8');
  assert.equal((base.match(/--glass-strong:/g) || []).length >= 4, true, 'light, two dark blocks, and fallbacks define the tokens');
  for (const selector of ['.permit-chip', '.map-search', '.map-help', '.fs-home .map-mode', '.home-sheet', '.fs-home .location-button.map-fab']) {
    const start = map.indexOf(`\n${selector} {`);
    const rule = start < 0 ? '' : map.slice(start, map.indexOf('}', start));
    assert.ok(rule && /backdrop-filter/.test(rule), `${selector} is frosted`);
  }
});
