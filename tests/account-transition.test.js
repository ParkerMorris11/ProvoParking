import test from 'node:test';
import assert from 'node:assert/strict';
import { state } from '../js/state.js';
import { loadData } from '../js/data/load.js';
import { toggleFavorite } from '../js/pages/favorites.js';

globalThis.document={getElementById:()=>({classList:{toggle(){}},textContent:''}),querySelector:()=>null};
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return {promise,resolve}; };
const rows = { parking_area: [], permit: [], parking_rule: [], tow_company: [], favorite_area: [{area_id:1}], parking_session:[{car_note:'Account A private note'}] };
function client(wait) {
  return { from(table) {
    const chain = { select(){return this;}, eq(){return this;}, order(){return this;}, limit(){return this;}, insert(){return this;}, single(){return this;}, then(resolve,reject){return wait.promise.then(()=>({data:rows[table],error:null})).then(resolve,reject);} };
    return chain;
  } };
}

test('a delayed account load cannot restore private data after logout', async () => {
  const wait=deferred();
  state.user={userId:10}; state.authVersion=1; state.db=client(wait);
  state.favoriteIds=new Set();state.activeSession=null;
  const pending=loadData();
  state.user=null;state.authVersion++;
  wait.resolve(); await pending;
  assert.equal(state.favoriteIds.size,0);
  assert.equal(state.activeSession,null);
});

test('an old favorite response cannot change the replacement account or render it', async () => {
  const wait=deferred();
  state.user={userId:10};state.authVersion=10;state.db=client(wait);
  state.areas=[{area_id:1,area_name:'Lot'}];state.favoriteIds=new Set();
  let renders=0;
  const pending=toggleFavorite(1,{disabled:false},{renderViews(){renders++;}});
  state.user={userId:20};state.authVersion++;
  wait.resolve();await pending;
  assert.equal(state.favoriteIds.size,0);
  assert.equal(renders,0);
});

test('clearing account credentials removes visible and hidden passwords', async () => {
  const { clearPasswords } = await import('../js/pages/auth.js');
  const fields = Object.fromEntries(['su-password','li-password','np-password'].map(id=>[id,{value:'old secret',type:'text'}]));
  const toggle = {textContent:'Hide',setAttribute(name,value){this[name]=value;}};
  const previous=globalThis.document;
  globalThis.document={getElementById:id=>fields[id],querySelectorAll:()=>[toggle]};
  try {
    clearPasswords();
    for (const field of Object.values(fields)) { assert.equal(field.value,'');assert.equal(field.type,'password'); }
    assert.equal(toggle.textContent,'Show');
    assert.equal(toggle['aria-label'],'Show password');
  } finally { globalThis.document=previous; }
});
