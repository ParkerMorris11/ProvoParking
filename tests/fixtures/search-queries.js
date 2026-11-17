// Realistic plain-language searches and what the Find form should end up holding.
// "Today" for this set is Tuesday 2026-11-17, 10:00 in Provo (SEARCH_NOW), so Tuesday = 2 and tomorrow = 3.
// permit: a permit code, "saved" (use the person's saved permit), or null. building: a building code or null.
// day/time: both null means "right now" (live). A time with no day means today.
export const SEARCH_NOW = new Date("2026-11-17T17:00:00Z");

export const SEARCH_QUERIES = [
  // The miss from the Sprint 3 regrade: a capital letter before "permit" is the permit, not the article "a".
  ["A permit at the Wilkinson Center Wednesday 12:30 pm", { permit: "A", building: "WSC", day: 3, time: "12:30" }, "permit"],
  ["an A permit at the tanner building at 10", { permit: "A", building: "TNRB", day: 2, time: "10:00" }, "permit"],
  ["I need a permit near the JKB", { permit: null, building: "JKB", day: null, time: null }, "permit"],
  ["I have a Y permit and class at 3 pm at the JKB", { permit: "Y", building: "JKB", day: 2, time: "15:00" }, "permit"],
  ["G permit near the library friday at 8", { permit: "G", building: "HBLL", day: 5, time: "08:00" }, "permit"],
  ["U permit stadium", { permit: "U", building: "LVES", day: null, time: null }, "permit"],
  ["Y pass near the Eyring Science Center at 2:15 pm", { permit: "Y", building: "ESC", day: 2, time: "14:15" }, "permit"],
  ["graduate permit JFSB 9:30 am thursday", { permit: "G", building: "JFSB", day: 4, time: "09:30" }, "permit"],
  ["Lot near the Wilk for a G permit at 4", { permit: "G", building: "WSC", day: 2, time: "16:00" }, "permit"],
  ["y permit tmcb 3", { permit: "Y", building: "TMCB", day: 2, time: "15:00" }, "permit"],
  ["Y permit", { permit: "Y", building: null, day: null, time: null }, "permit"],
  ["Visitor parking near the Hinckley Center", { permit: "V", building: "HC", day: null, time: null }, "permit"],
  ["my permit at the HBLL right now", { permit: "saved", building: "HBLL", day: null, time: null }, "permit"],
  ["where can I park near the Tanner building", { permit: "saved", building: "TNRB", day: null, time: null }, "permit"],
  ["where should I park", { permit: "saved", building: null, day: null, time: null }, "vague"],

  // Codes and abbreviations
  ["jkb", { permit: null, building: "JKB", day: null, time: null }, "code"],
  ["wilk", { permit: null, building: "WSC", day: null, time: null }, "code"],
  ["hbll", { permit: null, building: "HBLL", day: null, time: null }, "code"],
  ["tnrb 9", { permit: null, building: "TNRB", day: 2, time: "09:00" }, "code"],
  ["TMCB at 10am tomorrow", { permit: null, building: "TMCB", day: 3, time: "10:00" }, "code"],
  ["MARB 2pm", { permit: null, building: "MARB", day: 2, time: "14:00" }, "code"],
  ["ESC 8am", { permit: null, building: "ESC", day: 2, time: "08:00" }, "code"],
  ["LSB 3:30", { permit: null, building: "LSB", day: 2, time: "15:30" }, "code"],
  ["jfsb at 2pm", { permit: null, building: "JFSB", day: 2, time: "14:00" }, "code"],
  ["HBLL 7 pm tuesday", { permit: null, building: "HBLL", day: 2, time: "19:00" }, "code"],
  ["RB at 6am", { permit: null, building: "RB", day: 2, time: "06:00" }, "code"],
  ["the MOA", { permit: null, building: "MOA", day: null, time: null }, "code"],

  // Building names and nicknames
  ["Kimball tower 4pm", { permit: null, building: "KMBL", day: 2, time: "16:00" }, "name"],
  ["maeser building", { permit: null, building: "MSRB", day: null, time: null }, "name"],
  ["benson 10:30", { permit: null, building: "BNSN", day: 2, time: "10:30" }, "name"],
  ["brimhall", { permit: null, building: "BRMB", day: null, time: null }, "name"],
  ["eyring", { permit: null, building: "ESC", day: null, time: null }, "name"],
  ["Marriott Center tonight 7pm", { permit: null, building: "MC", day: 2, time: "19:00" }, "name"],
  ["smith fieldhouse thursday 5pm", { permit: null, building: "SFH", day: 4, time: "17:00" }, "name"],
  ["need parking at the law school tomorrow morning at 9", { permit: null, building: "JRCB", day: 3, time: "09:00" }, "name"],
  ["the Cannon Center for lunch at 12", { permit: null, building: "CANC", day: 2, time: "12:00" }, "name"],
  ["Joseph Smith building wed 11 am", { permit: null, building: "JSB", day: 3, time: "11:00" }, "name"],
  ["Crabtree building at 8 am", { permit: null, building: "CTB", day: 2, time: "08:00" }, "name"],
  ["Engineering building at 10am", { permit: null, building: "EB", day: 2, time: "10:00" }, "name"],
  ["Richards building 6 am", { permit: null, building: "RB", day: 2, time: "06:00" }, "name"],
  ["math building tomorrow 9am", { permit: null, building: "TMCB", day: 3, time: "09:00" }, "name"],
  ["business school 8", { permit: null, building: "TNRB", day: 2, time: "08:00" }, "name"],
  ["Wilkinson student center 1 pm", { permit: null, building: "WSC", day: 2, time: "13:00" }, "name"],
  ["museum of art saturday", { permit: null, building: "MOA", day: 6, time: null }, "name"],
  ["the music building at 7 pm", { permit: null, building: "MB", day: 2, time: "19:00" }, "name"],
  ["student health center at 9:15 am", { permit: null, building: "SHC", day: 2, time: "09:15" }, "name"],
  ["parking for the football game at the stadium saturday 1:30pm", { permit: null, building: "LVES", day: 6, time: "13:30" }, "name"],
  ["basketball game at the marriott center saturday 6 pm", { permit: null, building: "MC", day: 6, time: "18:00" }, "name"],
  ["class in the knight building at 11:00 friday", { permit: null, building: "JKB", day: 5, time: "11:00" }, "name"],

  // Typos
  ["tanner bulding 11am", { permit: null, building: "TNRB", day: 2, time: "11:00" }, "typo"],
  ["wilkenson center at noon", { permit: null, building: "WSC", day: 2, time: "12:00" }, "typo"],
  ["talmadge building monday 1pm", { permit: null, building: "TMCB", day: 1, time: "13:00" }, "typo"],
  ["eyering science center 2pm", { permit: null, building: "ESC", day: 2, time: "14:00" }, "typo"],
  ["kimbal tower", { permit: null, building: "KMBL", day: null, time: null }, "typo"],
  ["mariott center", { permit: null, building: "MC", day: null, time: null }, "typo"],

  // Provo places and out-of-scope / vague
  ["park now near the wilk", { permit: null, building: "WSC", day: null, time: null }, "vague"],
  ["parking", { permit: null, building: null, day: null, time: null }, "vague"],
  ["free parking downtown for 2 hours", { permit: null, building: null, day: null, time: null }, "vague"],
  ["Provo City Library at 3pm", { permit: null, building: null, day: 2, time: "15:00" }, "provo"],
  ["Riverwoods tomorrow at 6 pm", { permit: null, building: null, day: 3, time: "18:00" }, "provo"],
];

// Held out: written after the reader changes and not used to tune them, so they show how it does on new wording.
export const SEARCH_HOLDOUT = [
  ["Y permit near the Benson at 1:15", { permit: "Y", building: "BNSN", day: 2, time: "13:15" }, "holdout"],
  ["jsb 10", { permit: null, building: "JSB", day: 2, time: "10:00" }, "holdout"],
  ["parking by the MOA tomorrow at 2 pm", { permit: null, building: "MOA", day: 3, time: "14:00" }, "holdout"],
  ["tmcb thursday 8:30am", { permit: null, building: "TMCB", day: 4, time: "08:30" }, "holdout"],
  ["A pass for the law building friday 9am", { permit: "A", building: "JRCB", day: 5, time: "09:00" }, "holdout"],
  ["I need a parking spot at the wilkinson center at 4pm", { permit: null, building: "WSC", day: 2, time: "16:00" }, "holdout"],
  ["the libary at noon", { permit: null, building: "HBLL", day: 2, time: "12:00" }, "holdout"],
  ["Talmage 11", { permit: null, building: "TMCB", day: 2, time: "11:00" }, "holdout"],
  ["esc monday 3pm", { permit: null, building: "ESC", day: 1, time: "15:00" }, "holdout"],
  ["G pass near the Kimball tower", { permit: "G", building: "KMBL", day: null, time: null }, "holdout"],
  ["Marriot center saturday 7pm", { permit: null, building: "MC", day: 6, time: "19:00" }, "holdout"],
  ["faculty permit near the JFSB at 10:30 am", { permit: "A", building: "JFSB", day: 2, time: "10:30" }, "holdout"],
  ["Where can I park for the game at the fieldhouse at 6 pm", { permit: "saved", building: "SFH", day: 2, time: "18:00" }, "holdout"],
  ["brimhal building 9 am", { permit: null, building: "BRMB", day: 2, time: "09:00" }, "holdout"],
  ["Joseph F Smith building wednesday 1 pm", { permit: null, building: "JFSB", day: 3, time: "13:00" }, "holdout"],
  ["U pass near the stadium saturday", { permit: "U", building: "LVES", day: 6, time: null }, "holdout"],
  ["knight bldg 2pm", { permit: null, building: "JKB", day: 2, time: "14:00" }, "holdout"],
  ["Visitor pass to the Hinckley visitors center at 11 am", { permit: "V", building: "HC", day: 2, time: "11:00" }, "holdout"],
  ["y permit cannon center 5:45", { permit: "Y", building: "CANC", day: 2, time: "17:45" }, "holdout"],
  ["Life Sciences Building tomorrow at 7:30 am", { permit: null, building: "LSB", day: 3, time: "07:30" }, "holdout"],
];
