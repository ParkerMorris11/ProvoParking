import test from 'node:test';
import assert from 'node:assert/strict';
import { createVisitTracker } from '../js/data/visit-tracker.js';
function store(){let m=new Map();return {getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)};}
test('refresh reuses a visit; failed timer starts never finish it',async()=>{
 const storage=store(),calls=[],rpc=async(name,args)=>{calls.push([name,args]);return {error:null}};
 let t=createVisitTracker({storage,rpc,uuid:()=>crypto.randomUUID(),now:()=>1000}); await t.open();
 let id=calls[0][1].p_id; t=createVisitTracker({storage,rpc,uuid:()=>crypto.randomUUID(),now:()=>2000}); await t.open();
 assert.equal(calls[1][1].p_id,id); assert.equal(calls.filter(x=>x[0].includes('complete')).length,0);
});
test('a successful guest start is retried without losing its original timestamp',async()=>{
 const storage=store(),calls=[];let fail=true;
 const rpc=async(name,args)=>{calls.push([name,args]);return {error:name==='visit_complete_guest'&&fail?new Error('offline'):null}};
 const t=createVisitTracker({storage,rpc,uuid:()=>crypto.randomUUID(),now:()=>1000}); await t.open();
 await t.guestStarted({id:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',startedAt:'1970-01-01T00:00:02.000Z'}); fail=false; await t.flush();
 const completed=calls.filter(x=>x[0]==='visit_complete_guest'); assert.equal(completed.length,2); assert.deepEqual(completed[0][1],completed[1][1]);
});
test('account linkage retries and uses returned database session identifier',async()=>{
 const calls=[],t=createVisitTracker({storage:store(),rpc:async(n,a)=>{calls.push([n,a]);return {error:null}},uuid:()=>crypto.randomUUID(),now:()=>1000});
 await t.open(); await t.bind('owner-a'); await t.accountStarted({session_id:42},'owner-a');
 assert.equal(calls.at(-1)[0],'visit_link_account'); assert.equal(calls.at(-1)[1].p_session,42);
});
test('an old pending retry cannot block later visits forever',async()=>{
 const storage=store(); let time=1000,fail=true,ids=[];
 const rpc=async(n,a)=>{if(n==='visit_open') ids.push(a.p_id);return {error:fail?new Error('offline'):null}};
 let tracker=createVisitTracker({storage,rpc,uuid:()=>crypto.randomUUID(),now:()=>time});
 await tracker.open(); await tracker.guestStarted({id:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',startedAt:'1970-01-01T00:00:02.000Z'});
 time+=25*3600000; fail=false; tracker=createVisitTracker({storage,rpc,uuid:()=>crypto.randomUUID(),now:()=>time}); await tracker.open();
 assert.notEqual(ids[0],ids.at(-1));
});
test('failed and in-flight timer starts stay queued independently',async()=>{
 const storage=store(),linked=[]; let offline=true;
 const rpc=async(n,a)=>{if(n==='visit_link_account'){linked.push(a.p_session); if(offline) return {error:new Error('offline')};}return {error:null}};
 const t=createVisitTracker({storage,rpc,uuid:()=>crypto.randomUUID(),now:()=>1000}); await t.open(); await t.bind('owner-a');
 await t.accountStarted({session_id:1},'owner-a'); await t.accountStarted({session_id:2},'owner-a'); offline=false; await t.flush();
 assert.ok(linked.filter(x=>x===1).length>=2); assert.ok(linked.filter(x=>x===2).length>=2);
});
test('switching accounts uses a fresh visit without submitting the first account queue as the second',async()=>{
 const storage=store(),calls=[]; let offline=true;
 const rpc=async(n,a)=>{calls.push([n,a]);return {error:n==='visit_link_account'&&offline?new Error('offline'):null}};
 const t=createVisitTracker({storage,rpc,uuid:()=>crypto.randomUUID(),now:()=>1000}); await t.open(); await t.bind('owner-a'); await t.accountStarted({session_id:1},'owner-a');
 const first=calls.find(x=>x[0]==='visit_link_account')[1].p_id; offline=false; await t.bind('owner-b'); await t.accountStarted({session_id:2},'owner-b');
 const links=calls.filter(x=>x[0]==='visit_link_account'); assert.notEqual(links.at(-1)[1].p_id,first); assert.equal(links.filter(x=>x[1].p_session===1).length,1);
 await t.bind('owner-a'); await t.flush(); assert.equal(calls.filter(x=>x[0]==='visit_link_account'&&x[1].p_session===1).length,2);
});
test('a guest setup opened after account use gets a fresh visit before its timer starts',async()=>{
 const storage=store(),calls=[],rpc=async(n,a)=>{calls.push([n,a]);return {error:null}};
 let t=createVisitTracker({storage,rpc,uuid:()=>crypto.randomUUID(),now:()=>1000}); await t.open(); await t.bind('owner-a');
 const accountId=calls.at(-1)[1].p_id; t=createVisitTracker({storage,rpc,uuid:()=>crypto.randomUUID(),now:()=>2000}); await t.open({asGuest:true});
 const guestId=calls.at(-1)[1].p_id; assert.notEqual(guestId,accountId);
 await t.guestStarted({id:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',startedAt:'1970-01-01T00:00:03.000Z'});
 assert.equal(calls.at(-1)[1].p_id,guestId);
});
test('a delayed timer result keeps the visit and owner captured when its request began',async()=>{
 const storage=store(),calls=[],rpc=async(n,a)=>{calls.push([n,a]);return {error:null}};
 const t=createVisitTracker({storage,rpc,uuid:()=>crypto.randomUUID(),now:()=>1000}); await t.open(); await t.bind('owner-a');
 const snapshot=t.captureAccount('owner-a'); await t.bind('owner-b'); await t.accountStarted({session_id:1},'owner-a',snapshot);
 assert.equal(calls.filter(x=>x[0]==='visit_link_account').length,0); await t.bind('owner-a');
 assert.equal(calls.filter(x=>x[0]==='visit_link_account').at(-1)[1].p_id,snapshot.id);
});
test('signing in after a guest timer uses a fresh visit',async()=>{
 const storage=store(),calls=[],rpc=async(n,a)=>{calls.push([n,a]);return {error:null}};
 const t=createVisitTracker({storage,rpc,uuid:()=>crypto.randomUUID(),now:()=>1000}); await t.open({asGuest:true});
 await t.guestStarted({id:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',startedAt:'1970-01-01T00:00:02.000Z'});
 const guest=calls.at(-1)[1].p_id; await t.bind('owner-a'); assert.notEqual(calls.at(-1)[1].p_id,guest);
});
test('a cloned tab recovers when its visit was bound to another account',async()=>{
 const storage=store(),calls=[]; let reject=true;
 const rpc=async(n,a)=>{calls.push([n,a]); if(n==='visit_bind'&&reject){reject=false;return {error:{code:'42501'}}} return {error:null}};
 const t=createVisitTracker({storage,rpc,uuid:()=>crypto.randomUUID(),now:()=>1000}); await t.open();
 const original=calls[0][1].p_id; await t.bind('owner-b');
 assert.equal(calls.filter(x=>x[0]==='visit_bind').length,2); assert.notEqual(calls.at(-1)[1].p_id,original);
});
