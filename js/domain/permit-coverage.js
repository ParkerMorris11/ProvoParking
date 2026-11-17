// Honest notes for permits whose home lots are not in the app's verified data yet.
// Source: BYU Parking Rules and Regulations (security.byu.edu/parking-regulations, July 23, 2026)
// and the official Campus Parking Lots map layer (map.byu.edu). B, C and D are valid in their own
// housing lots plus U lots; YM and YV in their own lots plus Y and U lots. Only the shared lots are
// verified here, so results for these permits are a subset, never a full list. No lots are invented.
const MISSING_HOME_LOTS = {
  B: { who: "Heritage Halls", lots: ["22B", "24B", "25B", "52B", "45BCD"], shared: "U" },
  C: { who: "Helaman Halls", lots: ["41C", "45BCD"], shared: "U" },
  D: { who: "Riviera", lots: ["63D", "45BCD"], shared: "U" },
  YM: { who: "Wymount", lots: ["52YM"], shared: "Y and U" },
  YV: { who: "Wyview", lots: ["43YV"], shared: "Y and U" },
};

/** One-sentence note for the results list, or "" when the permit's lots are fully covered. */
export function permitCoverageNote(permitCode) {
  const gap = MISSING_HOME_LOTS[permitCode];
  if (!gap) return "";
  const list = gap.lots.length > 1 ? `${gap.lots.slice(0, -1).join(", ")} and ${gap.lots.at(-1)}` : gap.lots[0];
  const many = gap.lots.length > 1;
  return `Showing the ${gap.shared} lots your ${permitCode} permit shares. Your ${gap.who} ${many ? "lots" : "lot"} (${list}) ${many ? "aren't" : "isn't"} in this app yet; check BYU's parking map.`;
}

/** Short tag for the permit chip's second line, e.g. "3 shared U sections". */
export function sharedLotsTag(permitCode) {
  const gap = MISSING_HOME_LOTS[permitCode];
  return gap ? `shared ${gap.shared}` : "";
}
