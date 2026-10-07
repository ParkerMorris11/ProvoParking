# Provo Parking: Map Resources and Parking Rules Reference

Team 007, IS 401 Fall 2026. Built from the team's research notes (shared 2026-10-07).

## 1. Overview
This document collects the maps and parking rules our app should use in place of made-up sample rules. Every rule has a source link. Rules change, so the app stores a **last verified** date with each rule and shows it to the user. A permit being valid in a lot only means Emma is *allowed* to park there; it does **not** mean a space is open. Availability stays labeled as an estimate.

**Verification key:** ✅ = checked against the live source page on 2026-10-07. ☐ = from our research notes, not yet re-checked (see section 7).

## 2. Map resources
| Resource | What it shows | How we'd use it in the app | Link |
|---|---|---|---|
| BYU Campus Map | Interactive campus map with buildings and indoor floors | Destination search ("where is my class?") and building names | https://map.byu.edu/ |
| BYU Campus Parking Map | The most current BYU parking map (linked from the Parking Regulations page) | Source of truth for lot numbers, lot types, and locations | https://security.byu.edu/parking-regulations |
| BYU Housing parking map | Parking for Riviera, Wyview Park, Helaman Halls, LISR | B/C/D/YV resident lots | https://housing.byu.edu/secure/secure/services/c_guidelines_single/Parking.aspx |
| Provo City mapping resources | City maps, incl. the BYU campus map and a printable PDF | Base map context around campus | https://www.provo.gov/896/Additional-Mapping-Resources |
| Provo downtown parking | Printable PDF and interactive downtown parking map | Downtown garages and street parking | https://www.provo.gov/273/Parking |
| Utah County GIS downloads | Tax parcels, updated nightly | Lot outlines/boundaries if we draw real shapes | https://is.utahcounty.gov/gis/downloads |
| Utah statewide parcels (UGRC) | Statewide parcel data | Same as above, statewide | https://gis.utah.gov/products/sgid/cadastre/parcels/ |
| Utah government-owned parcels (UGRC) | Parcels owned by government bodies | Identify public (city/state/university) land | https://gis.utah.gov/products/sgid/cadastre/gop-parcels/ |

## 3. BYU parking rules
Source: [BYU Parking Regulations](https://security.byu.edu/parking-regulations) (page says "Released September 23, 2025") · [PDF](https://security.byu.edu/00000179-eda8-d335-affd-edefe2880000/parking-regulations-pdf) · [Policy](https://policy.byu.edu/view/traffic-parking-and-rideables-policy). BYU's authority to regulate parking comes from Utah Code 41-6a-215 ☐.

| Permit | Who it's for | Valid lots | Cost | Restrictions |
|---|---|---|---|---|
| **Y** ✅ | Undergraduates, except Helaman Halls, Heritage Halls, Riviera residents | Y, U | $60/semester; free spring/summer | No parking 1–5 a.m.; not specialty stalls |
| **G** ✅ | Graduate students | G, Y, U | $60/semester; free spring/summer | No parking 1–5 a.m.; not specialty stalls |
| **A** ✅ | Faculty, staff, administrators (not student employees) | A, C, G, Y, U | Free | No parking 1–5 a.m.; not service, official, ADA, or X stalls |
| **B** ✅ | Heritage Halls residents | B, U | $25/month; free spring/summer | Overnight only in B and lot 45BCD |
| **C** ✅ | Helaman Halls residents | C, U | $25/month; free spring/summer | Overnight only in C and lot 45BCD |
| **D** ✅ | Riviera residents | D, U | $25/month; free spring/summer | Overnight only in D and lot 45BCD |
| **YM** ✅ | Wymount Terrace and Foreign Language residents | YM, Y, U | In housing contract | Registered, active vehicle; one per resident |
| **YV** ✅ | Wyview Park residents | YV, Y, U | In housing contract | Registered, active vehicle; one per resident |
| **U** ✅ | Affiliated university personnel | U | Free | No parking 1–5 a.m. |
| **V** ✅ | Visitors | Lots 2V, 26V, visitor time stalls | Not listed | Current students/employees may not use; no parking 1–5 a.m. |
| **X** ☐ | Holders of a current X pass | X stalls | Not listed | Citation without a pass or over the time allowed |
| **M** ☐ | Motorcycles, mopeds, scooters | Designated motorcycle areas in lots 16–99 (students) | Not listed | May not park in car stalls |
| **EV** ☐ | EVs registered with BYU | Charging stations | Not listed | Max 4 hours per day |

AA, O, and PC permits exist but don't matter for our persona.

**Most important rules for Emma (Y permit):**
- She can park in **Y and U lots only** ✅. A, C, G, B, D, YM, YV, and visitor lots will get her a ticket.
- **No parking 1:00–5:00 a.m. in any campus lot** ✅. (BYU says this doesn't apply to on-campus housing.)
- **Visitor parking is off-limits** to current students, even short-term ✅.
- Specialty stalls (X, ADA, service, EV) need their own pass or registration ✅/☐.

## 4. Provo city parking laws
Provo City Code [Chapter 9.31, Parking Regulations](https://provo.municipal.codes/Code/9.31) ☐ (sections: 9.31.010 no-sign prohibitions; 9.31.020 lines, curbs, signs, parallel parking; 9.31.030 double parking; 9.31.040 meters; 9.31.050/060 unattended vehicles; 9.31.070 curb colors; 9.31.080 time limits; 9.31.090 snow emergency routes; 9.31.110 towing/enforcement; 9.31.120 off-street enforcement).

- **72-hour rule** ☐: A vehicle on a city street or city property needs current registration and must move at least 400 feet every 72 hours. [Provo FAQ](https://www.provo.gov/FAQ.aspx?QID=162)
- **RVs, trailers, boats** ✅: Not more than 72 consecutive hours on a public street or alley. Re-parking on the same block face counts as continuous. [Provo Parking](https://www.provo.gov/273/Parking)
- **Residential permit areas** ✅: Some areas are permit-only. Eligible: own a home there, or rent a unit with a valid rental dwelling license. Arlington, Belmont, Highland Park, and King Henry residents are **not** eligible. [Provo Parking](https://www.provo.gov/273/Parking), [Pay Parking Citations](https://www.provo.gov/213/Pay-Parking-Citations). Permits are handled through My Parking Info ☐.
- **Downtown** ✅: Over 10,000 spaces. Use garages for stays over two hours. Enforcement works around the clock. [Provo Parking](https://www.provo.gov/273/Parking)
- **Citations** ✅: Respond within 5 business days; no late fees during an appeal filed in time. If denied, pay within 7 days of the decision to avoid late fees. [Pay Parking Citations](https://www.provo.gov/213/Pay-Parking-Citations)

## 5. Rules data model
Implemented in `supabase/schema.sql` as columns on `permit`, `parking_area`, and `parking_rule`:

| Field | Table.column | Example |
|---|---|---|
| Lot ID | `parking_area.area_id` / `lot_code` | `1` / `Y-SAMPLE` |
| Name | `parking_area.area_name` | Sample Y lot (north campus) |
| Allowed permits | one `parking_rule` row per permit | Y, G, A, YM, YV |
| Blocked hours | `parking_rule.blocked_start` / `blocked_end` | 01:00 / 05:00 |
| Time limit | `parking_rule.max_stay_minutes` | 4320 (72 h) |
| Vehicle type | `parking_rule.vehicle_type` | car |
| Source URL | `parking_rule.source_url` | https://security.byu.edu/parking-regulations |
| Last verified | `parking_rule.last_verified_on` | 2026-10-07 |

Example records (facts only; lot locations are still samples):
```json
[
  {"lot": "Y lot (sample location)", "allowed_permits": ["Y","G","A","YM","YV"],
   "blocked_hours": "01:00-05:00", "time_limit_minutes": null, "vehicle_type": "car",
   "source_url": "https://security.byu.edu/parking-regulations", "last_verified": "2026-10-07"},
  {"lot": "U lot (sample location)", "allowed_permits": ["U","Y","G","A","B","C","D","YM","YV"],
   "blocked_hours": "01:00-05:00", "time_limit_minutes": null, "vehicle_type": "car",
   "source_url": "https://security.byu.edu/parking-regulations", "last_verified": "2026-10-07"},
  {"lot": "Provo residential permit street (sample location)", "allowed_permits": ["PROVO-RES"],
   "blocked_hours": null, "time_limit_minutes": 4320, "vehicle_type": "car",
   "source_url": "https://www.provo.gov/273/Parking", "last_verified": "2026-10-07"}
]
```

## 6. How this maps to our MoSCoW list
| MoSCoW item | Supported by | Status change |
|---|---|---|
| Must: Accurate laws and guidelines for parking | Sections 3–4 (cited, with verified dates) | Partial → **Included** for BYU permit rules and Provo city rules; lot-level rules stay Partial until lot numbers are checked |
| Must: BYU parking permit detection & space dependency | Permit table (section 3) | Still Partial: permits are user-selected, not verified, but eligibility now uses real permit rules |
| Must: General parking map (BYU and Provo) | Section 2 map resources | Still Partial until we place real lots on a real map |
| Must: Time sensitive parking availability | 1–5 a.m. ban, 72-hour rule, 2-hour downtown guidance | Partial: time *rules* are real; *availability* is still an estimate |
| Must: Filter systems | Permit + blocked hours | Filters can now use real permit validity |
| Should: Tooltips for each colored area | Restrictions column + source link | Each area can show its rule and "last verified" date |

## 7. Open questions / still to verify
- Full text of Provo City Code 9.31.080 (time limits) and 9.31.090 (snow emergency routes) has not been read.
- Fine amounts for BYU and Provo citations are not confirmed (Provo points to a "Violation Fee Schedule" FAQ we haven't read).
- No public source for live or real-time lot availability; availability stays an estimate.
- Exact lot numbers and locations must be checked against the BYU Campus Parking Map. Our database lot locations are still samples.
- BYU enforcement hours outside the 1–5 a.m. ban are not confirmed.
- ☐ items: X, M, EV permit details; Utah Code 41-6a-215; Provo 72-hour/400-foot rule (the FAQ page blocked our check); My Parking Info.

## 8. Sources
- https://map.byu.edu/
- https://security.byu.edu/parking-regulations
- https://security.byu.edu/00000179-eda8-d335-affd-edefe2880000/parking-regulations-pdf
- https://policy.byu.edu/view/traffic-parking-and-rideables-policy
- https://housing.byu.edu/secure/secure/services/c_guidelines_single/Parking.aspx
- https://www.provo.gov/896/Additional-Mapping-Resources
- https://www.provo.gov/273/Parking
- https://www.provo.gov/213/Pay-Parking-Citations
- https://www.provo.gov/FAQ.aspx?QID=162
- https://provo.municipal.codes/Code/9.31
- https://is.utahcounty.gov/gis/downloads
- https://gis.utah.gov/products/sgid/cadastre/parcels/
- https://gis.utah.gov/products/sgid/cadastre/gop-parcels/
