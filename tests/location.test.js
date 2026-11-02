import test from 'node:test';
import assert from 'node:assert/strict';
import { createLocationTracker } from '../js/lib/location.js';
function fixture() {
 let success, error, watches=0; const cleared=[], states=[];
 const geo={watchPosition(ok,fail){success=ok;error=fail;watches++;return 0;},clearWatch(id){cleared.push(id);}};
 const tracker=createLocationTracker({geolocation:geo,onChange:x=>states.push(x),now:()=>100000,staleAfterMs:100000});
 return {tracker,states,cleared,get watches(){return watches;},fix:(lat=40.25,lng=-111.65)=>success({coords:{latitude:lat,longitude:lng,accuracy:15},timestamp:100000}),fail:code=>error({code})};
}
test('tracking is opt-in, starts once, updates, and clears watch ID zero on stop',()=>{
 const f=fixture(); assert.equal(f.watches,0);f.tracker.start();f.tracker.start();assert.equal(f.watches,1);
 f.fix();assert.equal(f.states.at(-1).status,'live');f.tracker.stop();assert.deepEqual(f.cleared,[0]);assert.equal(f.states.at(-1).position,null);
 f.fix();assert.equal(f.states.at(-1).status,'idle');
});
test('denied permission clears location and permits a deliberate retry',()=>{
 const f=fixture();f.tracker.start();f.fix();f.fail(1);assert.equal(f.states.at(-1).status,'error');assert.equal(f.states.at(-1).position,null);assert.match(f.states.at(-1).message,/permission/i);
 f.tracker.start();assert.equal(f.watches,2);f.tracker.stop();
});
test('unsupported location is a visible recoverable state',()=>{
 const states=[];const t=createLocationTracker({geolocation:null,onChange:x=>states.push(x)});t.start();assert.equal(states.at(-1).status,'error');assert.match(states.at(-1).message,/support/i);
});
test('invalid coordinates cannot become a live location',()=>{
 const f=fixture();f.tracker.start();f.fix(100,0);assert.equal(f.states.at(-1).status,'error');assert.equal(f.states.at(-1).position,null);f.tracker.stop();
});
test('location timeout clears watch and shows retry guidance',()=>{
 const f=fixture();f.tracker.start();f.fix();f.fail(3);assert.match(f.states.at(-1).message,/timed out/);assert.equal(f.states.at(-1).position,null);assert.deepEqual(f.cleared,[0]);
});
test('a stale live fix expires instead of keeping old nearby suggestions',async()=>{
 let success;const states=[],cleared=[];
 const t=createLocationTracker({geolocation:{watchPosition(ok){success=ok;return 8;},clearWatch:id=>cleared.push(id)},onChange:s=>states.push(s),now:()=>100000,staleAfterMs:5});
 t.start();success({coords:{latitude:40.25,longitude:-111.65,accuracy:30},timestamp:100000});
 await new Promise(resolve=>setTimeout(resolve,20));
 assert.equal(states.at(-1).status,'error');assert.equal(states.at(-1).position,null);assert.deepEqual(cleared,[8]);
});
test('an already-aged fix expires at its original freshness deadline',async()=>{
 let success;const states=[];
 const t=createLocationTracker({geolocation:{watchPosition(ok){success=ok;return 9;},clearWatch(){}},onChange:s=>states.push(s),now:()=>100000,staleAfterMs:100000});
 try {
  t.start();success({coords:{latitude:40.25,longitude:-111.65,accuracy:30},timestamp:1});
  await new Promise(resolve=>setTimeout(resolve,20));
  assert.equal(states.at(-1).status,'error');assert.equal(states.at(-1).position,null);
 } finally {t.stop();}
});
