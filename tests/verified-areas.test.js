import test from 'node:test';
import assert from 'node:assert/strict';
import {state} from '../js/state.js';
import {renderAreas} from '../js/pages/areas.js';
test('primary Areas results show verified lots while retaining sample records for history',()=>{
 const fields={'area-list':{},'areas-summary':{},'areas-context':{}};
 globalThis.document={getElementById:id=>fields[id],addEventListener(){},querySelectorAll:()=>[]};
 state.areas=[{area_id:1,area_name:'Sample old lot',is_sample_data:true},{area_id:5,area_name:'BYU Lot 59Y',is_sample_data:false}];
 state.permits=[];state.favoriteIds=new Set();
 state.find={permitId:1,live:false,day:3,time:'08:00'};
 const open={permit_id:null,days_of_week:'All',start_time:'00:00',end_time:'23:59'};
 state.rulesByArea=new Map([[1,[open]],[5,[open]]]);
 renderAreas();
 assert.match(fields['area-list'].innerHTML,/BYU Lot 59Y/);
 assert.doesNotMatch(fields['area-list'].innerHTML,/Sample old lot/);
 assert.equal(state.areas.length,2);
});

test('a fully prohibited interval never describes itself as open to everyone',async()=>{
 const {renderAreaDetail}=await import('../js/pages/area-detail.js');
 const box={};globalThis.document={getElementById:()=>box};
 state.areas=[{area_id:5,area_name:'BYU Lot 59Y',is_sample_data:false}];
 state.rulesByArea=new Map([[5,[{permit_id:null,days_of_week:'All',start_time:'01:00',end_time:'04:59',blocked_start:'01:00',blocked_end:'05:00',source_url:'https://security.byu.edu/parking-regulations',last_verified_on:'2026-11-04'}]]]);
 state.find={permitId:1,day:3,time:'03:00'};state.towById=new Map();
 renderAreaDetail(5);
 assert.doesNotMatch(box.innerHTML,/Open to everyone\./);
 assert.match(box.innerHTML,/No parking for any permit/);
});
