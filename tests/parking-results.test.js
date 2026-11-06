import test from 'node:test';
import assert from 'node:assert/strict';
import { eligibleAreas, eligibleMapFeatures, parkingSelection } from '../js/domain/parking-results.js';
import { createParkingClock } from '../js/lib/parking-clock.js';
import { renderAreas } from '../js/pages/areas.js';
import { state } from '../js/state.js';

const lots = ['18U','30G','14A','59Y','unknown','limited','sample'].map((code,index)=>({area_id:index+1,lot_code:code,area_name:code,operator:'BYU',is_sample_data:code==='sample'}));
const rule = (permit_id, extra={}) => ({permit_id,days_of_week:'All',start_time:'00:00',end_time:'23:59',blocked_start:'01:00',blocked_end:'05:00',...extra});
const rules = new Map([
 [1,[rule(2),rule(1)]], [2,[rule(2)]],
 [3,[rule(3,{start_time:'07:00',end_time:'18:59'}),rule(null,{start_time:'19:00'})]],
 [4,[rule(1),rule(2)]], [6,[rule(2,{max_stay_minutes:30})]], [7,[rule(null)]],
]);
const selection={permitId:2,live:false,day:3,time:'12:00'};
const codes = areas => areas.map(a=>a.lot_code);

test('only usable lots survive; permission comes from rules rather than matching permit letters',()=>{
 assert.deepEqual(codes(eligibleAreas(lots,rules,selection)),['18U','30G','59Y','limited']);
 assert.deepEqual(codes(eligibleAreas(lots,rules,{...selection,permitId:1})),['18U','59Y']);
 assert.deepEqual(codes(eligibleAreas(lots,rules,{...selection,permitId:999})),[]);
 assert.deepEqual(codes(eligibleAreas(lots,rules,{...selection,permitId:null})),[]);
 assert.equal(lots.length,7,'shared data remains available for favorites/history');
});
test('after-hours opening, overnight restrictions and no-permit users follow the exact rule boundaries',()=>{
 assert.equal(codes(eligibleAreas(lots,rules,{...selection,time:'18:59'})).includes('14A'),false);
 assert.equal(codes(eligibleAreas(lots,rules,{...selection,time:'19:00'})).includes('14A'),true);
 assert.deepEqual(codes(eligibleAreas(lots,rules,{...selection,permitId:null,time:'19:00'})),['14A']);
 assert.deepEqual(codes(eligibleAreas(lots,rules,{...selection,time:'01:00'})),[]);
 assert.deepEqual(codes(eligibleAreas(lots,rules,{...selection,time:'04:59'})),[]);
 assert.ok(eligibleAreas(lots,rules,{...selection,time:'05:00'}).length>0);
 assert.deepEqual(eligibleAreas(lots,rules,{...selection,time:'bad'}),[]);
 assert.deepEqual(eligibleAreas(lots,new Map([[1,[rule(2,{days_of_week:'bad'})]]]),selection),[]);
});
test('day changes and explicit planned arrival are respected',()=>{
 const weekend=new Map([[1,[rule(null,{days_of_week:'Sat-Sun'})]]]);
 assert.deepEqual(codes(eligibleAreas(lots,weekend,selection)),[]);
 assert.deepEqual(codes(eligibleAreas(lots,weekend,{...selection,day:6})),['18U']);
 assert.deepEqual(parkingSelection(selection,new Date('2026-11-05T02:00:00Z')),selection);
});
test('live time uses the Provo clock across midnight, DST and a date far from app startup',()=>{
 const live={...selection,live:true};
 for(const [utc,day,time] of [
  ['2026-11-05T01:59:00Z',3,'18:59'],['2026-11-05T02:00:00Z',3,'19:00'],
  ['2026-11-05T06:59:00Z',3,'23:59'],['2026-11-05T07:00:00Z',4,'00:00'],
  ['2026-07-01T01:00:00Z',2,'19:00'],
 ]){const s=parkingSelection(live,new Date(utc));assert.equal(s.day,day);assert.equal(s.time,time);}
 assert.equal(codes(eligibleAreas(lots,rules,parkingSelection(live,new Date('2026-11-05T02:00:00Z')))).includes('14A'),true);
 assert.equal(live.time,'12:00','stored planner state is not mutated');
});
test('map boundaries must match a verified eligible BYU lot exactly',()=>{
 const features=['18U','30G','14A','59Y','999G',''].map((code,index)=>({properties:{OBJECTID:index+1,Lot_Type:code,permit_typ:'G'}}));
 const eligible=eligibleAreas(lots,rules,selection).map(a=>({...a,source_feature_id:['18U','30G','14A','59Y'].includes(a.lot_code)?lots.indexOf(a)+1:null}));
 assert.deepEqual(eligibleMapFeatures(features,eligible),[features[0],features[1],features[3]]);
 assert.deepEqual(eligibleMapFeatures([{properties:{OBJECTID:999,Lot_Type:'18U'}}],eligible),[],'matching codes cannot grant permission to a different section');
 assert.deepEqual(eligibleMapFeatures(features,eligible.map(a=>({...a,operator:'Other'}))),[]);
 assert.deepEqual(eligibleMapFeatures(features,[]),[]);
});
test('clock refreshes on the next minute, cancels sleeping/disabled updates and can resume',()=>{
 let enabled=true, refreshes=0, scheduled, cleared=[];
 const c=createParkingClock({enabled:()=>enabled,refresh:()=>refreshes++,now:()=>59990,setTimer(fn,delay){scheduled={fn,delay};return 0;},clearTimer:id=>cleared.push(id)});
 c.update();assert.equal(refreshes,1);assert.equal(scheduled.delay,30);
 scheduled.fn();assert.equal(refreshes,2);assert.deepEqual(cleared,[0]);
 enabled=false;c.update();assert.equal(refreshes,2);assert.deepEqual(cleared,[0,0]);
 enabled=true;c.update();assert.equal(refreshes,3);c.stop();assert.deepEqual(cleared,[0,0,0]);
});
test('Areas renders only eligible cards and gives useful empty states without deleting saved data',()=>{
 const oldDocument=globalThis.document, oldState={...state};
 const fields={'area-list':{},'areas-summary':{},'areas-empty':{},'areas-context':{}};
 globalThis.document={getElementById:id=>fields[id],addEventListener(){}};
 Object.assign(state,{areas:lots,rulesByArea:rules,find:selection,permits:[{permit_id:2,permit_name:'G permit'}],favoriteIds:new Set([3])});
 try{
  renderAreas();assert.match(fields['area-list'].innerHTML,/30G/);assert.doesNotMatch(fields['area-list'].innerHTML,/<h3>(14A|unknown|sample)<\/h3>/);
  assert.equal(fields['areas-empty'].hidden,true);assert.match(fields['areas-summary'].textContent,/Planned arrival/);
  state.find={...selection,time:'19:00'};renderAreas();assert.match(fields['area-list'].innerHTML,/14A/);
  state.find={...selection,time:'03:00'};renderAreas();assert.equal(fields['area-list'].innerHTML,'');assert.equal(fields['areas-empty'].hidden,false);
  assert.match(fields['areas-empty'].textContent,/No verified parking areas match/);
  state.find={...selection,permitId:null};renderAreas();assert.match(fields['areas-empty'].textContent,/Choose your permit/);
  assert.equal(state.favoriteIds.has(3),true);assert.equal(state.areas.length,lots.length);
 }finally{Object.assign(state,oldState);if(oldDocument===undefined)delete globalThis.document;else globalThis.document=oldDocument;}
});
test('Areas context bar repeats the selected permit and Provo time',()=>{
 const oldDocument=globalThis.document, oldState={...state};
 const listen=()=>({addEventListener(){},value:'',hidden:true,innerHTML:'',children:[],textContent:''});
 const fields={'area-list':listen(),'areas-more':listen(),'areas-count':listen(),'areas-empty':listen(),'areas-summary':listen(),'areas-context':listen(),'area-search':{...listen(),value:''},'area-sort':{...listen(),value:'name'},'results-heading':listen()};
 globalThis.document={getElementById:id=>fields[id],addEventListener(){},querySelectorAll:()=>[]};
 Object.assign(state,{find:{permitId:2,live:true,day:5,time:'19:22'},permits:[{permit_id:2,permit_code:'Y',permit_name:'Y'}],areas:lots,rulesByArea:rules,favoriteIds:new Set()});
 try{
  renderAreas();
  assert.match(fields['areas-context'].textContent,/Y/);
  assert.match(fields['areas-context'].textContent,/Right now|Provo/);
 }finally{Object.assign(state,oldState);if(oldDocument===undefined)delete globalThis.document;else globalThis.document=oldDocument;}
});
