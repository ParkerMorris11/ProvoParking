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

test('pause clears location and resume restarts only an explicitly enabled tracker',()=>{
 const f=fixture();f.tracker.resume();assert.equal(f.watches,0);
 f.tracker.start();f.fix();f.tracker.pause();assert.equal(f.states.at(-1).position,null);
 f.tracker.resume();assert.equal(f.watches,2);f.tracker.stop();f.tracker.pause();f.tracker.resume();assert.equal(f.watches,2);
});
test('permission denial prevents automatic resume',()=>{
 const f=fixture();f.tracker.start();f.fail(1);f.tracker.pause();f.tracker.resume();assert.equal(f.watches,1);
});
test('a live fix exposes its update timestamp',()=>{
 const f=fixture();f.tracker.start();f.fix();assert.equal(f.states.at(-1).position.timestamp,100000);f.tracker.stop();
});

test('temporary unavailable position retries once and then offers recovery',()=>{
 let fail, calls=0, retry; const states=[];
 const geo={watchPosition(ok, bad){calls++;fail=bad;return calls;},clearWatch(){}};
 const t=createLocationTracker({geolocation:geo,onChange:x=>states.push(x),scheduleRetry:fn=>(retry=fn,1),cancelRetry:()=>{retry=null;}});
 t.start();fail({code:2});assert.equal(states.at(-1).status,'waiting');assert.equal(calls,1);
 retry();assert.equal(calls,2);fail({code:2});assert.equal(states.at(-1).status,'error');t.stop();
});
test('stopping while a retry is pending prevents another location request',()=>{
 let fail, retry; const geo={watchPosition(ok,bad){fail=bad;return 1;},clearWatch(){}};
 const t=createLocationTracker({geolocation:geo,onChange:()=>{},scheduleRetry:fn=>(retry=fn,1),cancelRetry:()=>{retry=null;}});
 t.start();fail({code:2});t.stop();assert.equal(retry,null);
});

test('an initial high-accuracy timeout retries with less demanding location settings',()=>{
 let failure, success, retry; const options=[],states=[];
 const geo={watchPosition(ok,bad,opts){success=ok;failure=bad;options.push(opts);return options.length;},clearWatch(){}};
 const t=createLocationTracker({geolocation:geo,onChange:s=>states.push(s),now:()=>100000,scheduleRetry:fn=>(retry=fn,1),cancelRetry:()=>{retry=null;}});
 t.start();assert.equal(options[0].enableHighAccuracy,true);failure({code:3});assert.equal(states.at(-1).status,'waiting');
 retry();assert.equal(options[1].enableHighAccuracy,false);
 success({coords:{latitude:40.25,longitude:-111.65,accuracy:250},timestamp:100000});assert.equal(states.at(-1).status,'live');assert.match(states.at(-1).message,/Approximate/);t.stop();
});

test('a coarse fallback stays visible while a higher accuracy watch refines it',()=>{
 const callbacks=[],opts=[],states=[];let retry;const geo={watchPosition(ok,bad,o){callbacks.push({ok,bad});opts.push(o);return opts.length},clearWatch(){}};
 const t=createLocationTracker({geolocation:geo,onChange:s=>states.push(s),now:()=>100000,scheduleRetry:fn=>(retry=fn,1),cancelRetry:()=>{}});
 t.start();callbacks[0].bad({code:3});retry();callbacks[1].ok({coords:{latitude:40.25,longitude:-111.65,accuracy:250},timestamp:100000});
 assert.equal(opts[2].enableHighAccuracy,true);assert.equal(states.at(-1).position.accuracy,250);
 callbacks[2].bad({code:3});assert.equal(states.at(-1).position.accuracy,250);t.stop();
});
test('a location request without a callback has a bounded wait',()=>{
 let watchdog;const states=[];const geo={watchPosition(){return 1},clearWatch(){}};
 const t=createLocationTracker({geolocation:geo,onChange:s=>states.push(s),scheduleWatchdog:fn=>(watchdog=fn,1),cancelWatchdog:()=>{}});
 t.start();watchdog();assert.notEqual(states.at(-1).status,'waiting');t.stop();
});

test('refined location is not replaced by a less accurate fallback update and both watches stop',()=>{
 const cb=[],cleared=[],states=[];let retry;const geo={watchPosition(ok,bad){cb.push({ok,bad});return cb.length;},clearWatch:id=>cleared.push(id)};
 const t=createLocationTracker({geolocation:geo,onChange:s=>states.push(s),now:()=>100000,scheduleRetry:fn=>(retry=fn,1),cancelRetry:()=>{}});
 t.start();cb[0].bad({code:3});retry();cb[1].ok({coords:{latitude:40.25,longitude:-111.65,accuracy:250},timestamp:100000});
 cb[2].ok({coords:{latitude:40.251,longitude:-111.65,accuracy:15},timestamp:100000});
 cb[1].ok({coords:{latitude:40.25,longitude:-111.65,accuracy:250},timestamp:100000});assert.equal(states.at(-1).position.accuracy,15);
 t.stop();assert.deepEqual(cleared,[1,3,2]);
});

test('newer coarse updates replace older precise positions',()=>{
 let retry;const cb=[],states=[];const geo={watchPosition(ok,bad){cb.push({ok,bad});return cb.length},clearWatch(){}};
 const t=createLocationTracker({geolocation:geo,onChange:s=>states.push(s),now:()=>100100,scheduleRetry:fn=>(retry=fn,1),cancelRetry:()=>{}});
 t.start();cb[0].bad({code:3});retry();cb[1].ok({coords:{latitude:40.25,longitude:-111.65,accuracy:250},timestamp:100000});cb[2].ok({coords:{latitude:40.251,longitude:-111.65,accuracy:15},timestamp:100010});
 cb[1].ok({coords:{latitude:40.26,longitude:-111.65,accuracy:250},timestamp:100020});assert.equal(states.at(-1).position.latitude,40.26);
 cb[2].ok({coords:{latitude:40.251,longitude:-111.65,accuracy:15},timestamp:100010});assert.equal(states.at(-1).position.latitude,40.26);t.stop();
});
test('late refinement error after pause cannot cancel the new watch',()=>{
 let retry;const cb=[],cleared=[];const geo={watchPosition(ok,bad){cb.push({ok,bad});return cb.length},clearWatch:id=>cleared.push(id)};
 const t=createLocationTracker({geolocation:geo,onChange:()=>{},now:()=>100000,scheduleRetry:fn=>(retry=fn,1),cancelRetry:()=>{}});
 t.start();cb[0].bad({code:3});retry();cb[1].ok({coords:{latitude:40.25,longitude:-111.65,accuracy:250},timestamp:100000});t.pause();t.resume();cb[3].bad({code:3});retry();cb[4].ok({coords:{latitude:40.25,longitude:-111.65,accuracy:250},timestamp:100000});
 cb[2].bad({code:3});assert.equal(cleared.includes(6),false);t.stop();assert.equal(cleared.includes(6),true);
});
