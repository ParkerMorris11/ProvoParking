import { evaluate } from "./eligibility.js";
const clock = new Intl.DateTimeFormat("en-US", {timeZone:"America/Denver",weekday:"short",hour:"2-digit",minute:"2-digit",hourCycle:"h23"});
const days=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
export function stayWarnings(rules, permitId, startMs, endMs) {
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs || endMs-startMs > 86400000) return [{kind:"unknown",at:startMs}];
  const warnings=[];
  const seen=new Set();
  for(let at=startMs;at<endMs;at=Math.floor(at/60000)*60000+60000) {
    const parts=Object.fromEntries(clock.formatToParts(at).map(p=>[p.type,p.value]));
    const result=evaluate(rules,permitId,days.indexOf(parts.weekday),parts.hour+":"+parts.minute);
    let kind=["blocked","no-permit","pick","unknown"].includes(result.kind)?result.kind:null;
    if(!kind && result.rule?.max_stay_minutes && endMs-startMs>result.rule.max_stay_minutes*60000) {
      const deadline=startMs+result.rule.max_stay_minutes*60000;
      // Only warn about a limit when it is still enforced at the deadline.
      const p=Object.fromEntries(clock.formatToParts(deadline).map(p=>[p.type,p.value]));
      const atDeadline=evaluate(rules,permitId,days.indexOf(p.weekday),p.hour+":"+p.minute);
      if(atDeadline.rule?.max_stay_minutes && deadline<endMs && !seen.has("limit")) {
        warnings.push({kind:"limit",at:deadline});seen.add("limit");
      }
    }
    if(kind&&!seen.has(kind)){warnings.push({kind,at});seen.add(kind);}
  }
  return warnings.sort((a,b)=>a.at-b.at);
}
export function warningText(warning) {
  const at=new Intl.DateTimeFormat("en-US",{timeZone:"America/Denver",weekday:"short",hour:"numeric",minute:"2-digit"}).format(warning.at);
  const messages={
    blocked:"Your stay overlaps no-parking hours",
    "no-permit":"Your selected permit does not cover part of this stay",
    pick:"Select a permit to check this stay",
    unknown:"Parking permission is not verified for part of this stay",
    limit:"Your stay may exceed a recorded time limit",
  };
  return `${messages[warning.kind]||messages.unknown} — ${at} (Provo time). Check posted signs.`;
}
