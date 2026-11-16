import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildParseRequest } from '../js/data/parse-find.js';
import { validateRequest } from '../supabase/functions/parse-find/sanitize.js';

test('official building catalog stays within AI limits and contains usable, distinct campus coordinates', async () => {
  const catalog = JSON.parse(await readFile(new URL('../data/byu-campus-buildings.json', import.meta.url), 'utf8'));
  assert.ok(catalog.buildings.length > 200);
  assert.equal(new Set(catalog.buildings.map(b => b.building_code)).size, catalog.buildings.length);
  for (const b of catalog.buildings) {
    assert.match(b.building_code, /^[A-Z0-9]{1,12}$/);
    assert.ok(b.name && b.name.length <= 160);
    assert.ok(b.latitude > 40.20 && b.latitude < 40.30 && b.longitude > -111.75 && b.longitude < -111.58);
    assert.ok(b.source_url.startsWith(catalog.source + '/'));
  }
  const destinations = catalog.buildings.map((b, i) => ({ ...b, destination_id: i + 1 }));
  const request = buildParseRequest({ text: 'I need parking near the building', permits: [], destinations });
  assert.equal(validateRequest(request).destination_ids.length, destinations.length);
});
