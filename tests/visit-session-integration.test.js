import test from 'node:test';
import assert from 'node:assert/strict';
import {state} from '../js/state.js';
import {startSession} from '../js/data/sessions.js';

test('only a successful database timer start is linked', async () => {
  const calls=[]; state.user={userId:7}; state.authId='owner-a'; state.visitTracker={captureAccount:()=>({id:'visit'}),accountStarted:row=>{calls.push(row); return Promise.resolve();}};
  let fail=true; const row={session_id:44};
  state.db={rpc:async()=>fail?{error:new Error("offline")}:{data:{session:row,server_now:new Date().toISOString()},error:null}};
  const input={areaId:1,minutes:30,reminderMinutes:5,destinationId:2};
  await assert.rejects(startSession(input)); assert.equal(calls.length,0);
  fail=false; assert.equal((await startSession(input)).session,row); assert.deepEqual(calls,[row]);
  state.user=null;state.db=null;state.visitTracker=null;
});
