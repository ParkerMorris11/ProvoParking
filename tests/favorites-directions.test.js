import test from 'node:test';
import assert from 'node:assert/strict';
import { state } from '../js/state.js';
import { directionsUrl } from '../js/lib/format.js';
import { renderFavorites, toggleFavorite } from '../js/pages/favorites.js';
import { cardHtml } from '../js/components/area-card.js';

const lots = [
  { area_id: 1, area_name: 'BYU Lot 59Y', operator: 'BYU', latitude: 40.243896, longitude: -111.649081 },
  { area_id: 2, area_name: 'Visitor <lot> "B"', operator: 'BYU', latitude: '40.25', longitude: '-111.65' },
  { area_id: 3, area_name: 'Unsaved lot', latitude: 40.26, longitude: -111.64 },
];

test('directions use each lot destination, driving mode, and device location without auto-starting', () => {
  for (const lot of lots) {
    const url = new URL(directionsUrl(lot, 'driving'));
    assert.equal(url.origin, 'https://www.google.com');
    assert.equal(url.pathname, '/maps/dir/');
    assert.equal(url.searchParams.get('api'), '1');
    assert.equal(url.searchParams.get('destination'), `${Number(lot.latitude)},${Number(lot.longitude)}`);
    assert.equal(url.searchParams.get('travelmode'), 'driving');
    assert.equal(url.searchParams.has('origin'), false);
    assert.equal(url.searchParams.has('dir_action'), false);
  }
  assert.equal(new URL(directionsUrl(lots[0])).searchParams.get('travelmode'), 'walking');
});

test('missing and invalid destinations never produce misleading directions links', () => {
  for (const point of [
    {}, { latitude: null, longitude: null }, { latitude: '', longitude: ' ' },
    { latitude: true, longitude: false }, { latitude: 'NaN', longitude: -111 },
    { latitude: Infinity, longitude: -111 }, { latitude: 91, longitude: 0 },
    { latitude: 40, longitude: -181 }, { latitude: 40, longitude: 'bad&origin=elsewhere' },
  ]) assert.equal(directionsUrl(point, 'driving'), null);
  assert.ok(directionsUrl({ latitude: 0, longitude: 0 }, 'driving'));
});

test('favorites render a separate directions button per saved lot and update after removal', async () => {
  const fields = { 'fav-list': {}, 'fav-empty': {}, 'fav-count': {}, status: { classList: { toggle() {} } } };
  const previousDocument = globalThis.document;
  const previousState = { ...state };
  globalThis.document = { getElementById: id => fields[id], querySelector: () => null };
  Object.assign(state, {
    areas: lots, favoriteIds: new Set([1, 2]), rulesByArea: new Map(),
    user: { userId: 99 }, db: { from: () => ({ delete: () => ({ eq: () => ({ eq: () => ({ select: async () => ({ data: [{ area_id: 1 }], error: null }) }) }) }) }) },
  });
  try {
    renderFavorites();
    const html = fields['fav-list'].innerHTML;
    assert.equal((html.match(/class="secondary"/g) || []).length, 2);
    assert.equal((html.match(/class="heart"/g) || []).length, 2);
    for (const lot of lots.slice(0, 2)) {
      assert.ok(html.includes(directionsUrl(lot, 'driving').replaceAll('&', '&amp;')));
      assert.ok(html.includes(`href="#area/${lot.area_id}"`));
    }
    assert.match(html, /Visitor &lt;lot&gt; &quot;B&quot;/);
    assert.match(html, /target="_blank" rel="noopener noreferrer"/);
    assert.match(html, /Google Maps \(opens in a new tab\)/);
    assert.doesNotMatch(html, /Unsaved lot/);
    assert.equal(fields['fav-count'].textContent, 2);
    assert.equal(fields['fav-empty'].hidden, true);
    assert.doesNotMatch(cardHtml(lots[0]), /Get Directions/);

    const invalid = cardHtml({ ...lots[0], latitude: null }, { showDirections: true });
    assert.match(invalid, /Directions unavailable/);
    assert.doesNotMatch(invalid, /google.com/);
    assert.match(cardHtml({ ...lots[0], is_sample_data: true }, { showDirections: true }), /Sample location/);

    await toggleFavorite(1, {}, { renderViews: renderFavorites });
    assert.equal(fields['fav-count'].textContent, 1);
    assert.doesNotMatch(fields['fav-list'].innerHTML, /BYU Lot 59Y/);
    await toggleFavorite(2, {}, { renderViews: renderFavorites });
    assert.equal(fields['fav-count'].textContent, 0);
    assert.equal(fields['fav-list'].innerHTML, '');
    assert.equal(fields['fav-empty'].hidden, false);
  } finally {
    Object.assign(state, previousState);
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
});
