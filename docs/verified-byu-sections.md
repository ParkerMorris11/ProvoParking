# BYU ordinary parking sections — November 4, 2026

The 189 features in the campus map layer were compared with the checked-in snapshot on November 4, 2026. Attribute and geometry fingerprints matched. BYU warns that its map is being updated; posted signs govern. The supplied regulations are the July 23, 2026 release, SHA-256 `bd30b8791168f1d94bf01277eec5255f7bc514b1707bdb28b88a6cbb116dfff6`.

The manifest contains 102 GIS features with explicit ordinary A, G, Y or U descriptions and supported normal-week rules, including existing 59Y, 30G, 14A, 18U, and new 20Y and 49Y. Each section is identified by its GIS object ID and global ID. Distinct features are kept separate, even where lot labels match. Source locations are approximate polygon interior points for new sections; they are not verified entrances or stalls. Existing four area coordinates and IDs are preserved. Capacity, live availability and tow contacts remain unknown.

The migration attaches feature identities to the four existing rows and inserts new rows and sourced rules without deleting or updating existing rules, favorites or sessions. It aborts on conflicting existing lot identities. It never fabricates counts, and is repeatable. Ordinary car rules describe the regular fall/winter week only: the app does not verify BYU registration, a particular date, specialty stalls, event restrictions or parking rights. Check posted signs and the [official campus map](https://map.byu.edu/?layer=parking).

The remaining GIS features are not asserted to be generally eligible. Specialty, visitor, timed, housing and restricted sections require separate review and modeling. Lot 29 has a specific overnight-storage exception and lot 41 includes conflicting housing descriptions. Features without a clear category remain out of this import. The manifest is not a full accounting of every parking privilege or condition.

Migration tests use a disposable local PostgreSQL database, apply the migration twice, compare existing areas and rules and personal rows, and exercise separate feature IDs and rule boundaries. Browser checks use reference data exported from that local database, not a live occupancy feed. The application update must be deployed before the migration is applied to production, so the existing interface does not overstate eligibility for the expanded dataset.

## Visitor sections 2V and 26V — November 17, 2026

The November 4 ordinary-stall import left visitor, timed, housing and restricted features out of the dataset. Official sources were checked again on November 17, 2026, and visitor sections **2V** and **26V** are now imported. Other visitor GIS features (including 54V, 58V and 90V) were not added.

### Official sources

- [BYU Parking Rules and Regulations](https://security.byu.edu/parking-regulations), PDF released July 23, 2026, SHA-256 `bd30b8791168f1d94bf01277eec5255f7bc514b1707bdb28b88a6cbb116dfff6`. The V privilege names lots 2V and 26V, allows visitors in those designated lots and in time stalls for any posted time limit, allows officers to ask for a driver’s license, forbids current students and employees from using any visitor parking, and keeps the ordinary 01:00–05:00 overnight ban. The fee table does not list a visitor-lot charge. The “No Visitor Validation” citation is a general fine; these two map features do not themselves state a validation or payment requirement.
- [BYU Parking in a Nutshell](https://security.byu.edu/parking-in-a-nutshell) labels V as “Visitors to Campus / Free,” and states that students and employees may not use visitor parking at any time, including during spring and summer terms.
- [Official campus map](https://map.byu.edu/?layer=parking) and its [Campus Parking Lots layer](https://services.arcgis.com/FvF9MZKp3JWPrSkg/arcgis/rest/services/Campus_Parking_Lots/FeatureServer/0). Live attributes and geometry for object IDs 15 and 88 matched the checked-in `data/byu-campus-parking.json` snapshot.

| Lot | Official object ID | Global ID | Weekday visitor hours on the map | Location (interior point) |
|---|---|---|---|---|
| 2V | [15](https://services.arcgis.com/FvF9MZKp3JWPrSkg/arcgis/rest/services/Campus_Parking_Lots/FeatureServer/0/15) | `7f6b3fc5-7fd8-493d-b35a-8fc27b385698` | Mon–Fri 07:00–18:00 | 40.251904, -111.647447, next to lot 2A, north of the Jesse Knight Building |
| 26V | [88](https://services.arcgis.com/FvF9MZKp3JWPrSkg/arcgis/rest/services/Campus_Parking_Lots/FeatureServer/0/88) | `a71c40c0-b1f3-4003-9ac6-ea3dbf822e0a` | Mon–Fri 07:00–16:00 | 40.248169, -111.644898, in lot 26 east of the Wilkinson Student Center |

Coordinates are the same scan-line interior points used for ordinary sections; they are not verified entrances or stalls. Capacity, live availability and tow contacts remain unknown. `is_free` is true because official sources describe these lots as free visitor parking, not paid or hourly. No `max_stay_minutes` is stored, because the GIS descriptions do not list a stay limit; posted time stalls are separate features.

### Rules modeled

Each section gets the overnight closure and a weekday V-permit row during the map hours (07:00–17:59 for 2V, 07:00–15:59 for 26V). After-hours and weekend rows are intentionally omitted: the map states weekday hours, and unlike spring/summer and academic-break text, the weekend-and-holiday section does not clearly say whether visitor lots stay visitor-only or become open. The app therefore reports “no rules on file for that time” outside the verified weekday window rather than calling those times eligible. A Y or G search at 15:00 on a weekday still excludes these lots.

The migration is repeatable. It inserts or refreshes only these two feature identities, replaces only their rules, and aborts if an existing 2V/26V row or object ID 15/88 already has a conflicting identity. Favorites, sessions and all other areas stay untouched. Manifest: `data/verified-byu-visitor-lots.json`. Migration: `supabase/migrations/20261117180000_verified_byu_visitor_lots.sql`.
