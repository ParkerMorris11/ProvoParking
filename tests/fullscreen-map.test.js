import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chipText, sheetTitle, suggestionRows, matchText } from '../js/pages/fullscreen-map.js';

const permits = [
  { permit_id: 1, permit_code: 'Y', permit_name: 'Y Undergraduate' },
  { permit_id: 2, permit_code: 'G', permit_name: 'G Graduate' },
];

test('permit chip shows the permit code and "Now" when parking right now', () => {
  const chip = chipText({ permitId: 1, live: true }, permits);
  assert.equal(chip.code, 'Y');
  assert.equal(chip.text, 'Y · Now');
  assert.match(chip.label, /^Y Y · Now\. Y Undergraduate, right now\. Change permit or time$/);
});

test('permit chip shows the planned day and time', () => {
  const chip = chipText({ permitId: 2, live: false, day: 6, time: '10:00' }, permits);
  assert.equal(chip.text, 'G · Sat 10:00 AM');
  assert.match(chip.label, /^G G · Sat 10:00 AM\. .*Sat at 10:00 AM/);
  assert.match(chip.label, /Change permit or time/);
});

test('permit chip asks for a permit when none is chosen (guests and new accounts)', () => {
  const chip = chipText({ permitId: null, live: true }, permits);
  assert.equal(chip.code, 'P');
  assert.equal(chip.text, 'Choose permit · Now');
  assert.match(chip.label, /^P Choose permit · Now\. No permit chosen, right now\. Change permit or time$/);
});

test('permit chip never throws on a half-filled planned time', () => {
  const chip = chipText({ permitId: 1, live: false, day: null, time: '' }, permits);
  assert.equal(chip.text, 'Y · Choose time');
});

test('list title counts areas with the right wording', () => {
  assert.equal(sheetTitle(33, true), '33 areas match your permit');
  assert.equal(sheetTitle(1, true), '1 area matches your permit');
  assert.equal(sheetTitle(0, false), 'Choose your permit to see where you can park');
  assert.equal(sheetTitle(0, true, { day: 6 }), 'Weekend: no BYU permit rules listed. Check signs');
  assert.equal(sheetTitle(0, true, { day: 0 }), 'Weekend: no BYU permit rules listed. Check signs');
  assert.equal(sheetTitle(0, true, { day: 2 }), 'No lots match your permit right now');
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
  for (const selector of ['.permit-chip', '.map-search', '.fs-home .map-mode', '.home-sheet', '.fs-home .location-button.map-fab']) {
    const start = map.indexOf(`\n${selector} {`);
    const rule = start < 0 ? '' : map.slice(start, map.indexOf('}', start));
    assert.ok(rule && /backdrop-filter/.test(rule), `${selector} is frosted`);
  }
});

test('suggestions list the parked car, then up to two favorites, then nearby legal lots (five rows at most)', () => {
  const areaById = new Map([1, 2, 3, 4, 5, 6, 7].map(id => [id, { area_id: id, area_name: `Lot ${id}` }]));
  const describe = () => 'Allowed now';
  const rows = suggestionRows({
    session: { area_id: 2, leave_by: new Date(Date.now() + 90 * 60000).toISOString() },
    favorites: [{ id: 3, nickname: 'Class' }, { id: 4, nickname: '' }, { id: 5, nickname: '' }],
    nearby: [3, 6, 7, 1],
    areaById, describe,
  });
  assert.deepEqual(rows.map(r => r.title), ['Parked car', 'Class', 'Lot 4', 'Lot 6', 'Lot 7']);
  assert.match(rows[0].sub, /^Lot 2 · 1 hr 30 min left$/);
  assert.equal(rows[0].href, '#car');
  assert.equal(rows[1].href, '#area/3');
  assert.equal(rows[1].sub, 'Favorite · Allowed now');
});

test('guests with no favorites get up to three nearby lots; the tile counts open areas', () => {
  const areaById = new Map([1, 2, 3, 4].map(id => [id, { area_id: id, area_name: `Lot ${id}` }]));
  const rows = suggestionRows({ session: null, favorites: [], nearby: [4, 3, 2, 1], areaById, describe: () => 'Allowed now' });
  assert.deepEqual(rows.map(r => r.title), ['Lot 4', 'Lot 3', 'Lot 2']);
  assert.equal(matchText(1), '1 area open');
  assert.equal(matchText(33), '33 areas open');
});

test('the status tile never shows a bare "0 areas open"', () => {
  assert.equal(matchText(0, false), 'Choose a permit');
  assert.equal(matchText(0, true, { day: 6 }), 'Weekend: check signs');
  assert.equal(matchText(0, true, { day: 2 }), 'No lots match now');
});
