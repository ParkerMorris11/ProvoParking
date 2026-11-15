import test from "node:test";
import assert from "node:assert/strict";
import { dailyRuleSchedule } from "../js/domain/rule-schedule.js";
import { evaluate } from "../js/domain/eligibility.js";
import { ruleScheduleHtml } from "../js/components/rule-schedule.js";
import { renderAreaDetail } from "../js/pages/area-detail.js";
import { state } from "../js/state.js";
import { lot1A, rule, permits } from "./fixtures/lot-rules.js";

test("Lot 1A weekday covers 24 hours exactly once, with the overnight closure cut out", () => {
  assert.deepEqual(dailyRuleSchedule(lot1A, 1).map(s => [s.start,s.end,s.kind]), [
    [0,60,"open"],[60,300,"closed"],[300,420,"open"],[420,1140,"permit"],[1140,1440,"open"],
  ]);
  for (let day=0;day<7;day++) {
    const segments=dailyRuleSchedule(lot1A,day);
    assert.equal(segments[0].start,0);
    assert.equal(segments.at(-1).end,1440);
    assert.equal(segments.reduce((sum,s)=>sum+s.end-s.start,0),1440);
    segments.slice(1).forEach((s,i)=>assert.equal(s.start,segments[i].end));
  }
});

test("eligibility and universal timeline agree at every weekday minute for A, Y and no permit", () => {
  const segments=dailyRuleSchedule(lot1A,1);
  for(let minute=0;minute<1440;minute++) {
    const time=String(Math.floor(minute/60)).padStart(2,"0")+":"+String(minute%60).padStart(2,"0");
    const segment=segments.find(s=>minute>=s.start&&minute<s.end);
    for(const id of [1,2,null]) {
      const result=evaluate(lot1A,id,1,time);
      if(segment.kind==="closed") assert.equal(result.kind,"blocked",time);
      if(segment.kind==="open") assert.equal(result.kind,"ok",time);
      if(segment.kind==="permit") assert.equal(result.kind,id===1?"ok":id===null?"pick":"no-permit",time);
    }
  }
});

test("a universal closure wins over an overlapping permission row", () => {
  const rows=[...lot1A,rule({permit_id:1})];
  for(const id of [1,2,null]) assert.equal(evaluate(rows,id,1,"03:00").kind,"blocked");
  assert.equal(dailyRuleSchedule(rows,1).find(s=>s.start===60).kind,"closed");
});

test("weekend gaps and visitor-only historical notes never become general permission", () => {
  assert.deepEqual(dailyRuleSchedule(lot1A,6).map(s=>[s.start,s.end,s.kind]),[
    [0,60,"unknown"],[60,300,"closed"],[300,1440,"unknown"],
  ]);
  const visitor=rule({days_of_week:"Sat,Sun",rule_note:"Ordinary stalls on normal weekends: visitors may park; overnight ban remains."});
  assert.equal(dailyRuleSchedule([visitor],6)[0].kind,"unknown");
});

test("U, housing and missing/invalid rules are derived from data, with no blanket overnight ban", () => {
  const u=rule({permit_id:3,blocked_start:"01:00",blocked_end:"05:00"});
  assert.deepEqual(dailyRuleSchedule([u],1).map(s=>s.kind),["permit","closed","permit"]);
  assert.deepEqual(dailyRuleSchedule([rule({permit_id:1})],1).map(s=>s.kind),["permit"]);
  assert.deepEqual(dailyRuleSchedule([],1).map(s=>s.kind),["unknown"]);
  assert.equal(dailyRuleSchedule([rule({end_time:"bad"})],1)[0].kind,"unknown");
  assert.equal(dailyRuleSchedule([rule({blocked_start:"01:00"})],1)[0].kind,"unknown");
  assert.deepEqual(dailyRuleSchedule(lot1A,8),[]);
});

test("overnight windows, time limits and multiple accepted permits retain their meaning", () => {
  const rows=[rule({permit_id:1,start_time:"22:00",end_time:"05:59",max_stay_minutes:60}),
    rule({permit_id:2,start_time:"22:00",end_time:"05:59",max_stay_minutes:120})];
  const segments=dailyRuleSchedule(rows,1);
  assert.deepEqual(segments.map(s=>[s.start,s.end,s.kind]),[[0,360,"permit"],[360,1320,"unknown"],[1320,1440,"permit"]]);
  assert.deepEqual(segments[0].permitLimits,[{permitId:1,limitMinutes:60},{permitId:2,limitMinutes:120}]);
  const html=ruleScheduleHtml(rows,1,permits);
  assert.match(html,/A: 1 h limit; Y: 2 h limit/);
  assert.match(html,/next day/);
});

test("adjacent identical rows merge, but changes in accepted permits stay visible", () => {
  const rows=[rule({permit_id:1,start_time:"07:00",end_time:"11:59"}),
    rule({permit_id:1,start_time:"12:00",end_time:"18:59"})];
  assert.deepEqual(dailyRuleSchedule(rows,1).map(s=>[s.start,s.end]),[[0,420],[420,1140],[1140,1440]]);
  rows.push(rule({permit_id:2,start_time:"12:00",end_time:"18:59"}));
  assert.equal(dailyRuleSchedule(rows,1).filter(s=>s.kind==="permit").length,2);
});

test("only the top status changes with the user's permit; the daily rules are identical", () => {
  const elements=new Map();
  globalThis.document={activeElement:null,getElementById(id){
    if(!elements.has(id)) elements.set(id,{innerHTML:"",addEventListener(){},focus(){}});
    return elements.get(id);
  }};
  state.areas=[{area_id:1,area_name:"BYU Lot 1A",operator:"BYU",lot_code:"1A",is_sample_data:false,latitude:40.25,longitude:-111.65}];
  state.permits=permits;state.rulesByArea=new Map([[1,lot1A]]);state.favoriteIds=new Set();state.towById=new Map();
  state.find={permitId:1,day:1,time:"10:00",live:false};
  renderAreaDetail(1);
  const a=elements.get("area-detail").innerHTML;
  state.find.permitId=2;renderAreaDetail(1);
  const y=elements.get("area-detail").innerHTML;
  assert.match(a,/You can park at this time/);
  assert.match(y,/You cannot park at this time/);
  const schedule=html=>html.split('<div id="rules-day-schedule">')[1].split('</section>')[0];
  assert.equal(schedule(a),schedule(y));
  assert.match(a,/label for="rules-day"/);
});
