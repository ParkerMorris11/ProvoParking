import test from 'node:test';
import assert from 'node:assert/strict';
import { state } from '../js/state.js';
import { applyPermitChoice } from '../js/pages/find.js';
import { eligibleAreas } from '../js/domain/parking-results.js';

test('choosing a permit applies it at once and refreshes the lists and map', () => {
  const saved = { permits: state.permits, find: { ...state.find } };
  state.permits = [{ permit_id: 1, permit_code: 'Y' }, { permit_id: 2, permit_code: 'G' }];
  state.find = { ...state.find, permitId: null };
  let refreshed = 0;
  try {
    assert.equal(applyPermitChoice('2', () => refreshed++), true);
    assert.equal(state.find.permitId, 2);
    assert.equal(refreshed, 1);
    assert.equal(applyPermitChoice('', () => refreshed++), false, 'the empty option changes nothing');
    assert.equal(applyPermitChoice('99', () => refreshed++), false, 'unknown permits are ignored');
    assert.equal(state.find.permitId, 2);
    assert.equal(refreshed, 1);
    assert.equal(typeof eligibleAreas, 'function');
  } finally {
    state.permits = saved.permits;
    state.find = saved.find;
  }
});

test('a permit picked on the map chip also shows on the Find form', () => {
  const saved = { permits: state.permits, find: { ...state.find }, document: globalThis.document };
  state.permits = [{ permit_id: 1, permit_code: 'Y' }, { permit_id: 2, permit_code: 'G', description: 'Grad' }];
  const els = { 'permit-select': { value: '' }, 'permit-info': { innerHTML: '' } };
  globalThis.document = { getElementById: (id) => els[id] ?? null };
  try {
    assert.equal(applyPermitChoice('2'), true);
    assert.equal(els['permit-select'].value, '2');
    assert.match(els['permit-info'].innerHTML, /Grad/);
  } finally {
    state.permits = saved.permits;
    state.find = saved.find;
    if (saved.document === undefined) delete globalThis.document; else globalThis.document = saved.document;
  }
});

test('signed in: a new permit choice is saved to the account so a reload keeps it', async () => {
  const { saveToAccount } = await import('../js/pages/find.js');
  const saved = { user: state.user };
  const calls = [];
  try {
    state.user = { userId: 18, permitIds: [1] };
    const ok = await saveToAccount(2, async (userId, permitId) => { calls.push([userId, permitId]); });
    assert.equal(ok, true);
    assert.deepEqual(calls, [[18, 2]]);
    assert.deepEqual(state.user.permitIds, [2]);
    assert.equal(saveToAccount(2, async () => assert.fail('already saved')), null, 'no write when nothing changed');
    state.user = null;
    assert.equal(saveToAccount(1, async () => assert.fail('guests have no account')), null);
  } finally {
    state.user = saved.user;
  }
});

test('signed in: a failed account save keeps the choice on this device and does not throw', async () => {
  const { saveToAccount } = await import('../js/pages/find.js');
  const saved = { user: state.user };
  const err = console.error; console.error = () => {};
  try {
    state.user = { userId: 18, permitIds: [1] };
    const ok = await saveToAccount(2, async () => { throw new Error('offline'); });
    assert.equal(ok, false);
    assert.deepEqual(state.user.permitIds, [1]);
  } finally {
    state.user = saved.user; console.error = err;
  }
});

test('device permit fallbacks stay in their account or guest scope', async () => {
  const { loadSavedPermit, savePermit } = await import('../js/lib/storage.js');
  const original = globalThis.localStorage;
  const values = new Map([['provoParking.permitId', '42']]);
  globalThis.localStorage = {
    getItem: key => values.get(key),
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
  };
  try {
    assert.equal(loadSavedPermit(), null);
    savePermit(2, 18);
    assert.equal(loadSavedPermit(19), null);
    assert.equal(loadSavedPermit(), null);
    savePermit(3);
    assert.equal(loadSavedPermit(), 3);
    assert.equal(loadSavedPermit(18), 2);
  } finally {
    if (original === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = original;
  }
});
