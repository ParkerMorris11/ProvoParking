export const permits = [{permit_id:1,permit_code:"A"},{permit_id:2,permit_code:"Y"},{permit_id:3,permit_code:"U"}];
const rule = extra => ({
  days_of_week:"Mon-Fri", start_time:"00:00",end_time:"23:59",permit_id:null,
  max_stay_minutes:null,blocked_start:null,blocked_end:null,
  source_url:"https://security.byu.edu/parking-regulations",last_verified_on:"2026-11-04",...extra,
});
export const lot1A = [
  rule({days_of_week:"All",start_time:"01:00",end_time:"04:59",blocked_start:"01:00",blocked_end:"05:00"}),
  rule({start_time:"07:00",end_time:"18:59",permit_id:1}),
  rule({start_time:"00:00",end_time:"06:59",blocked_start:"01:00",blocked_end:"05:00"}),
  rule({start_time:"19:00",end_time:"23:59"}),
];
export { rule };
