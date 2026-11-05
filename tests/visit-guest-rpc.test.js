import test from 'node:test';
import assert from 'node:assert/strict';
import {createGuestVisitRpc} from '../js/data/visit-guest-rpc.js';
test('guest RPC sends only publishable credentials and structured arguments',async()=>{
 let request; const rpc=createGuestVisitRpc({url:'https://example.test/',key:'publishable',fetch:async(...args)=>{request=args;return {ok:true}}});
 assert.deepEqual(await rpc('visit_open',{p_id:'test'}),{error:null});
 assert.equal(request[0],'https://example.test/rest/v1/rpc/visit_open');
 assert.equal(request[1].headers.Authorization,'Bearer publishable'); assert.deepEqual(JSON.parse(request[1].body),{p_id:'test'});
});
test('network and HTTP errors remain retryable',async()=>{
 const rpc=createGuestVisitRpc({url:'https://example.test',key:'publishable',fetch:async()=>({ok:false})});
 assert.ok((await rpc('visit_open',{})).error);
});
test('modern publishable keys are not sent as bearer JWTs',async()=>{
 let headers; const rpc=createGuestVisitRpc({url:'https://example.test',key:'sb_publishable_example',fetch:async(_url,opts)=>{headers=opts.headers;return {ok:true}}});
 await rpc('visit_open',{}); assert.equal(headers.apikey,'sb_publishable_example'); assert.equal(headers.Authorization,undefined);
});
