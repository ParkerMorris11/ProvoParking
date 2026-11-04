import test from 'node:test';
import assert from 'node:assert/strict';
import {state} from '../js/state.js';
import {renderAreas} from '../js/pages/areas.js';
test('primary Areas results show verified lots while retaining sample records for history',()=>{
 const fields={'area-list':{},'areas-summary':{}};
 globalThis.document={getElementById:id=>fields[id]};
 state.areas=[{area_id:1,area_name:'Sample old lot',is_sample_data:true},{area_id:5,area_name:'BYU Lot 59Y',is_sample_data:false}];
 state.permits=[];state.rulesByArea=new Map();state.favoriteIds=new Set();
 renderAreas();
 assert.match(fields['area-list'].innerHTML,/BYU Lot 59Y/);
 assert.doesNotMatch(fields['area-list'].innerHTML,/Sample old lot/);
 assert.equal(state.areas.length,2);
});
