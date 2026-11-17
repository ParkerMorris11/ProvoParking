import test from 'node:test';
import assert from 'node:assert/strict';
import { loadRecents, rememberRecent, clearRecents } from '../js/lib/recent-searches.js';

const fakeStorage = () => { const data = new Map(); return { getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, v), removeItem: k => data.delete(k) }; };

test('keeps the last five picked places, newest first, with no repeats', () => {
  const storage = fakeStorage();
  for (let i = 1; i <= 6; i++) rememberRecent({ type: 'lot', id: i, title: `Lot ${i}`, subtitle: 'Parking area' }, storage);
  rememberRecent({ type: 'lot', id: 4, title: 'Lot 4', subtitle: 'Parking area' }, storage);
  assert.deepEqual(loadRecents(storage).map(r => r.id), [4, 6, 5, 3, 2]);
});

test('ignores unknown result types and damaged storage, and can be cleared', () => {
  const storage = fakeStorage();
  rememberRecent({ type: 'other', id: 1, title: 'x' }, storage);
  rememberRecent({ type: 'destination', id: 2 }, storage);
  assert.deepEqual(loadRecents(storage), []);
  storage.setItem('provoParking.recentSearches', '{not json');
  assert.deepEqual(loadRecents(storage), []);
  rememberRecent({ type: 'city', id: 3, title: 'Freedom Commons', subtitle: 'Provo · Parking garage' }, storage);
  assert.equal(loadRecents(storage).length, 1);
  clearRecents(storage);
  assert.deepEqual(loadRecents(storage), []);
});

test('works without any storage available', () => {
  const broken = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() { throw new Error('blocked'); } };
  assert.deepEqual(loadRecents(broken), []);
  assert.equal(rememberRecent({ type: 'lot', id: 1, title: 'Lot 1' }, broken).length, 1, 'still returns the pick, just cannot keep it');
  assert.doesNotThrow(() => clearRecents(broken));
});
