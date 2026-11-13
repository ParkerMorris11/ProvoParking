import test from "node:test";
import assert from "node:assert/strict";
import {stayWarnings,warningText} from "../js/domain/stay-warnings.js";
import {syncParkingClock,parkingNow,resetParkingClock} from "../js/lib/server-clock.js";
import {state} from "../js/state.js";
import {startSession,acceptTimerSnapshot} from "../js/data/sessions.js";
const rule=extra=>({days_of_week:"All",start_time:"00:00",end_time:"23:59",permit_id:null,...extra});
const rows=[rule({start_time:"01:00",end_time:"04:59",blocked_start:"01:00",blocked_end:"05:00"}),rule({blocked_start:"01:00",blocked_end:"05:00"})];
test("warns before a stay crosses 1 AM in Provo, even when arrival is allowed",()=>{
 const start=Date.parse("2026-11-13T07:30:00Z"); // 12:30 AM MST
 const warnings=stayWarnings(rows,1,start,start+7200000);
 assert.equal(warnings[0].kind,"blocked");
 assert.equal(new Date(warnings[0].at).toISOString(),"2026-11-13T08:00:00.000Z");
 assert.match(warningText(warnings[0]),/no-parking/);
 assert.deepEqual(stayWarnings(rows,1,start,Date.parse("2026-11-13T08:00:00Z")),[]);
});
test("detects a permit transition, unknown weekend coverage, and time limits",()=>{
 const start=Date.parse("2026-11-13T13:30:00Z");
 const weekday=[rule({days_of_week:"Mon-Fri",start_time:"00:00",end_time:"06:59"}),rule({days_of_week:"Mon-Fri",start_time:"07:00",permit_id:1})];
 assert.equal(stayWarnings(weekday,2,start,start+7200000)[0].kind,"no-permit");
 assert.equal(stayWarnings(weekday,1,Date.parse("2026-11-14T19:00Z"),Date.parse("2026-11-14T20:00Z"))[0].kind,"unknown");
 assert.equal(stayWarnings([rule({max_stay_minutes:30})],1,start,start+3600000)[0].kind,"limit");
});
test("warns with no selected permit, and handles a DST fall-back using actual timestamps",()=>{
 const required=[rule({permit_id:1})],start=Date.parse("2026-11-13T19:00Z");
 assert.equal(stayWarnings(required,null,start,start+3600000)[0].kind,"pick");
 const dst=Date.parse("2026-11-01T06:30:00Z"); // 12:30 AM MDT
 const blocked=stayWarnings(rows,1,dst,dst+10800000).filter(w=>w.kind==="blocked");
 assert.equal(blocked.length,1);
 assert.equal(blocked[0].at,Date.parse("2026-11-01T07:00:00Z"));
});
test("restoring a server snapshot uses its original deadline without restarting the timer",()=>{
 const now=Date.parse("2026-11-13T12:00Z");
 acceptTimerSnapshot({server_now:new Date(now).toISOString(),session:{session_id:1,leave_by:"2026-11-13T12:30:00Z"}});
 const remaining=Date.parse(state.activeSession.leave_by)-parkingNow();
 assert.ok(remaining>1799000&&remaining<=1800000);
 const realDateNow=Date.now;Date.now=()=>0;
 try{assert.ok(parkingNow()>now-1000);}finally{Date.now=realDateNow;resetParkingClock();}
});
test("a duplicate start produces a clear error and never supplies client clock fields",async()=>{
 const saved={...state};state.user={userId:1};state.authId="owner";
 let args;
 state.db={rpc:async(name,input)=>{args=input;return{error:{code:"23505"}};}};
 try{
  await assert.rejects(startSession({areaId:1,minutes:60,reminderMinutes:10,destinationId:1}),/already have an active timer/);
  assert.equal("leave_by" in args||"started_at" in args||"user_id" in args,false);
 }finally{Object.assign(state,saved);}
});
