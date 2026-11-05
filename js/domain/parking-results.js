import { evaluate } from "./eligibility.js";

const clock = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Denver", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});
const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Parking rules use Provo's local day/time, even on a device in another time zone.
export function parkingSelection(find, now = new Date()) {
  if (!find.live) return { ...find };
  const parts = Object.fromEntries(clock.formatToParts(now).map(p => [p.type, p.value]));
  return { ...find, day: days.indexOf(parts.weekday), time: `${parts.hour}:${parts.minute}` };
}

export function eligibleAreas(areas, rulesByArea, selection) {
  return areas.filter(area => !area.is_sample_data && ["ok", "limit"].includes(
    evaluate(rulesByArea.get(area.area_id) || [], selection.permitId, selection.day, selection.time).kind
  )).sort((a, b) => a.area_name.localeCompare(b.area_name));
}

export function eligibleMapFeatures(features, areas) {
  const normalize = code => typeof code === "string" ? code.trim().toUpperCase() : "";
  const codes = new Set(areas.filter(area => area.operator === "BYU").map(area => normalize(area.lot_code)).filter(Boolean));
  // A category alone (e.g. Y or G) cannot establish permission or match a verified lot.
  return features.filter(feature => codes.has(normalize(feature.properties?.Lot_Type)));
}
