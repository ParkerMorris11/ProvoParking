import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlacesSearch } from '../js/lib/places-search.js';

function fakeGoogle({ fail = false } = {}) {
  const calls = { tokens: 0, fetched: [], fields: [] };
  class Token { constructor() { calls.tokens++; } }
  const library = {
    AutocompleteSessionToken: Token,
    AutocompleteSuggestion: {
      async fetchAutocompleteSuggestions(req) {
        calls.fetched.push(req);
        if (fail) throw new Error('REQUEST_DENIED');
        return { suggestions: [{ placePrediction: { placeId: 'p1', mainText: { text: 'Provo Towne Centre' }, secondaryText: { text: 'Provo, UT' }, text: { text: 'Provo Towne Centre, Provo, UT' },
          toPlace: () => ({ fetchFields: async (o) => { calls.fields.push(o); }, location: { lat: () => 40.2, lng: () => -111.7 }, formattedAddress: '1200 Towne Centre Blvd, Provo, UT' }) } }, { queryPrediction: {} }] };
      },
    },
  };
  return { calls, google: { maps: { importLibrary: async (name) => { assert.equal(name, 'places'); return library; } } } };
}

test('suggest returns place rows, reuses one session token, and biases to Utah County', async () => {
  const { calls, google } = fakeGoogle();
  const places = createPlacesSearch({ getGoogle: () => google });
  const rows = await places.suggest('provo towne');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].title, 'Provo Towne Centre');
  await places.suggest('provo towne c');
  assert.equal(calls.tokens, 1);
  assert.ok(calls.fetched[0].locationBias.west < -111.7);
});

test('too-short input and a missing Maps API return nothing without errors', async () => {
  const { google } = fakeGoogle();
  assert.deepEqual(await createPlacesSearch({ getGoogle: () => google }).suggest('pr'), []);
  assert.deepEqual(await createPlacesSearch({ getGoogle: () => undefined }).suggest('provo towne'), []);
});

test('resolve asks only for location and address, then ends the session', async () => {
  const { calls, google } = fakeGoogle();
  const places = createPlacesSearch({ getGoogle: () => google });
  const [row] = await places.suggest('provo towne');
  const spot = await places.resolve(row);
  assert.deepEqual(calls.fields[0].fields, ['location', 'formattedAddress']);
  assert.deepEqual(spot, { lat: 40.2, lng: -111.7, title: 'Provo Towne Centre', address: '1200 Towne Centre Blvd, Provo, UT' });
  await places.suggest('provo towne');
  assert.equal(calls.tokens, 2);
});

test('when Google rejects the request, Places turns itself off', async () => {
  const { calls, google } = fakeGoogle({ fail: true });
  const places = createPlacesSearch({ getGoogle: () => google });
  assert.deepEqual(await places.suggest('provo towne'), []);
  assert.equal(places.available, false);
  await places.suggest('provo towne');
  assert.equal(calls.fetched.length, 1);
});
