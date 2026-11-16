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

test('favorites render a simple row with one directions menu per saved lot and update after removal', async () => {
  const fields = { 'fav-list': {}, 'fav-empty': {}, 'fav-count': {}, status: { classList: { toggle() {} } } };
  const previousDocument = globalThis.document;
  const previousState = { ...state };
  globalThis.document = { getElementById: id => fields[id], querySelector: () => null };
  Object.assign(state, {
    areas: lots, favoriteIds: new Set([1, 2]), favoriteNames: new Map(), rulesByArea: new Map(),
    user: { userId: 99 }, db: { from: () => ({ delete: () => ({ eq: () => ({ eq: () => ({ select: async () => ({ data: [{ area_id: 1 }], error: null }) }) }) }) }) },
  });
  try {
    renderFavorites();
    const html = fields['fav-list'].innerHTML;
    assert.equal((html.match(/class="fav-go-btn" href="https:\/\/www\.google\.com\/maps\/dir\//g) || []).length, 2, 'Go links straight to Google Maps');
    assert.equal((html.match(/class="heart"/g) || []).length, 0, 'the one-tap heart is replaced by the ⋯ menu');
    assert.equal((html.match(/data-fav-remove=/g) || []).length, 2);
    assert.doesNotMatch(html, /maps\.apple\.com/);
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

test('Apple Maps directions use the same exact destination, driving or walking, with no start point', async () => {
  const { appleDirectionsUrl } = await import('../js/lib/format.js');
  for (const lot of lots) {
    const url = new URL(appleDirectionsUrl(lot, 'driving'));
    assert.equal(url.origin, 'https://maps.apple.com');
    assert.equal(url.searchParams.get('daddr'), `${Number(lot.latitude)},${Number(lot.longitude)}`);
    assert.equal(url.searchParams.get('dirflg'), 'd');
    assert.equal(url.searchParams.has('saddr'), false);
  }
  assert.equal(new URL(appleDirectionsUrl(lots[0])).searchParams.get('dirflg'), 'w');
  assert.equal(appleDirectionsUrl({ latitude: 91, longitude: 0 }, 'driving'), null);
});

test('each favorite offers Google Maps and Apple Maps driving directions', () => {
  const html = cardHtml(lots[0], { showDirections: true });
  assert.ok(html.includes(directionsUrl(lots[0], 'driving').replaceAll('&', '&amp;')));
  assert.match(html, /href="https:\/\/maps\.apple\.com\/\?daddr=40\.243896%2C-111\.649081&amp;dirflg=d"/);
  assert.equal((html.match(/class="secondary"/g) || []).length, 1);
});

test('lot detail directions button opens Apple Maps on iPhone/iPad and Google Maps elsewhere', async () => {
  const { deviceDirections } = await import('../js/lib/format.js');
  const iphone = { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', maxTouchPoints: 5 };
  const ipad = { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', maxTouchPoints: 5 };
  const mac = { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', maxTouchPoints: 0 };
  const android = { userAgent: 'Mozilla/5.0 (Linux; Android 15)', maxTouchPoints: 5 };
  for (const nav of [iphone, ipad]) {
    const d = deviceDirections(lots[0], 'driving', nav);
    assert.equal(d.app, 'Apple Maps');
    assert.equal(new URL(d.url).searchParams.get('daddr'), '40.243896,-111.649081');
  }
  for (const nav of [mac, android, undefined]) {
    const d = deviceDirections(lots[0], 'driving', nav);
    assert.equal(d.app, 'Google Maps');
    assert.equal(new URL(d.url).searchParams.get('destination'), '40.243896,-111.649081');
  }
  assert.equal(deviceDirections({}, 'driving', iphone), null);
});

test('favorite rows show a short status instead of the long rule sentence', async () => {
  const { shortStatus, favoriteRowHtml } = await import('../js/pages/favorites.js');
  assert.equal(shortStatus({ kind: 'ok' }), 'Permit OK');
  assert.equal(shortStatus({ kind: 'no-permit' }), 'Not your permit');
  assert.equal(shortStatus({ kind: 'limit', rule: { max_stay_minutes: 120 } }).endsWith('limit'), true);
  const prev = { ...state };
  Object.assign(state, { favoriteIds: new Set([1]), favoriteNames: new Map(), rulesByArea: new Map() });
  try {
    const html = favoriteRowHtml({ ...lots[0], est_available_spaces: 40, total_spaces: 300 });
    assert.match(html, /~40 open/);
    assert.doesNotMatch(html, /Approximate section|Driving directions in Google/);
    assert.match(favoriteRowHtml({ ...lots[0], latitude: null }), /fav-row/);
    assert.doesNotMatch(favoriteRowHtml({ ...lots[0], latitude: null }), /fav-go-btn/);
  } finally { Object.assign(state, prev); }
});

test('a nickname leads the row and the real lot name stays visible under it', async () => {
  const { favoriteRowHtml } = await import('../js/pages/favorites.js');
  const prev = { ...state };
  Object.assign(state, { favoriteIds: new Set([1, 2]), favoriteNames: new Map([[2, 'My <class>']]), rulesByArea: new Map() });
  try {
    const named = favoriteRowHtml(lots[1]);
    assert.match(named, /<span class="fav-name">My &lt;class&gt;<\/span>/);
    assert.match(named, /<span class="fav-lot">Visitor &lt;lot&gt; &quot;B&quot;<\/span>/);
    assert.match(named, />Rename</);
    const plain = favoriteRowHtml(lots[0]);
    assert.match(plain, /<span class="fav-name">BYU Lot 59Y<\/span>/);
    assert.doesNotMatch(plain, /fav-lot/);
    assert.match(plain, />Add a name</);
  } finally { Object.assign(state, prev); }
});

test('nicknames are trimmed, capped at 30 characters, and blank clears them', async () => {
  const { cleanNickname } = await import('../js/data/favorites.js');
  assert.equal(cleanNickname('  Class   lot '), 'Class lot');
  assert.equal(cleanNickname('x'.repeat(40)).length, 30);
  assert.equal(cleanNickname('   '), null);
  assert.equal(cleanNickname(null), null);
});

test('removing a favorite shows Undo, and Undo restores it with its nickname', async () => {
  const { toggleFavorite, initFavorites } = await import('../js/pages/favorites.js');
  const handlers = {};
  const fields = { 'fav-list': {}, 'fav-empty': {}, 'fav-count': {}, 'undo-bar': { hidden: true }, 'undo-text': {}, status: { classList: { toggle() {} } } };
  const prevDoc = globalThis.document, prevState = { ...state };
  globalThis.document = { getElementById: id => fields[id], querySelector: () => null, querySelectorAll: () => [], addEventListener: (t, f) => { handlers[t] = f; } };
  const inserted = [];
  const db = { from: () => ({
    delete: () => ({ eq: () => ({ eq: () => ({ select: async () => ({ data: [{ area_id: 1 }], error: null }) }) }) }),
    insert: (row) => { inserted.push(row); return { select: () => ({ single: async () => ({ data: row, error: null }) }) }; },
  }) };
  Object.assign(state, { areas: lots, favoriteIds: new Set([1]), favoriteNames: new Map([[1, 'Class']]), rulesByArea: new Map(), user: { userId: 99 }, db });
  try {
    const { renderFavorites } = await import('../js/pages/favorites.js');
    initFavorites({ renderViews: renderFavorites });
    await toggleFavorite(1, {}, { renderViews: renderFavorites });
    assert.equal(state.favoriteIds.has(1), false);
    assert.equal(fields['undo-bar'].hidden, false);
    assert.equal(fields['undo-text'].textContent, 'Removed Class');
    await handlers.click({ target: { closest: (sel) => sel === '#undo-btn' ? {} : null } });
    await new Promise(r => setTimeout(r, 0));
    assert.deepEqual(inserted.at(-1), { user_id: 99, area_id: 1, nickname: 'Class' });
    assert.equal(state.favoriteIds.has(1), true);
    assert.equal(state.favoriteNames.get(1), 'Class');
    assert.equal(fields['undo-bar'].hidden, true);
  } finally {
    Object.assign(state, prevState);
    if (prevDoc === undefined) delete globalThis.document; else globalThis.document = prevDoc;
  }
});

test('saving a plain favorite never sends a nickname column', async () => {
  const { addFavorite } = await import('../js/data/favorites.js');
  const prev = { ...state }; let sent;
  Object.assign(state, { user: { userId: 7 }, db: { from: () => ({ insert: (row) => { sent = row; return { select: () => ({ single: async () => ({ data: row, error: null }) }) }; } }) } });
  try { await addFavorite(3); assert.deepEqual(sent, { user_id: 7, area_id: 3 }); }
  finally { Object.assign(state, prev); }
});
