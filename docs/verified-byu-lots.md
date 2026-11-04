# Four verified BYU lots — November 4, 2026

L1 / P5 scope: ordinary car stalls in four lots, with regular fall/winter weekly permit and overnight rules. The app checks the selected arrival minute; it does not promise space availability or permission for the driver's whole stay.

## Official sources

- [BYU Parking Rules and Regulations](https://security.byu.edu/parking-regulations), PDF released July 23, 2026. Checked permit privileges on pages 5–7, overnight rules on page 10, and calendar exceptions on pages 11–12. The response is a PDF even though its URL has no extension.
- [Official campus map](https://map.byu.edu/?layer=parking). Its [published main script](https://map.byu.edu/scripts/main.js) identifies the [Campus Parking Lots layer](https://services.arcgis.com/FvF9MZKp3JWPrSkg/arcgis/rest/services/Campus_Parking_Lots/FeatureServer/0). These records were retrieved fresh, rather than assuming the older app snapshot was verified.
- [BYU registration FAQ](https://support.byu.edu/kb?id=kb_article_view&sysparm_article=KB0027859) confirms lot 18 as registered free/unpaid parking.

`data/verified-byu-lots.json` records the source object IDs, source descriptions, six-decimal bounding-box centers, date, and SHA-256 of the downloaded regulations. Coordinates are approximate lot centers, not entrances. The original 189-feature map snapshot is unchanged.

| Lot | Official object ID | Supported permits during enforced hours | Regular permit hours |
|---|---|---|---|
| 59Y | 5 | A, G, Y, YM, YV | Mon–Fri 07:00–16:00 |
| 30G | 2 | A, G | Mon–Fri 07:00–16:00 |
| 14A | 25 | A | Mon–Fri 07:00–19:00 |
| 18U | 167 | A, G, Y, U, B, C, D, YM, YV | Mon–Fri: registered/active vehicle required; normal weekends open to visitors; no parking charge |

The table covers the permit choices currently supported by the app. Official/special passes and disability/service/specialty stalls require their separate privileges; they are not represented as ordinary parking here.

All four are non-housing lots: the normal overnight ban runs from 01:00 inclusive to 05:00 exclusive. Y/G/A ordinary stalls have no permit requirement outside the recorded weekday hours or on normal weekends. At minute precision, the restricted 07:00–16:00 row ends at 15:59 and the unrestricted row starts at 16:00; lot 14A uses 18:59/19:00. The existing rule evaluator includes schedule endpoints. A universal overnight rule also blocks rejected/unselected permits instead of giving a misleading permit-only explanation at 03:00.

Finals/reading days (including Saturdays), holidays, academic breaks, events, construction and posted signs can override the normal week. The app selects day/time rather than a calendar date, so it discloses those exceptions in results and details. BYU registration/active status is a prerequisite; this app does not verify it against BYU systems. No live occupancy source was found.

## Data preservation

The dated migration adds four real areas, without renaming the four old sample rows, deleting favorites/sessions, changing ownership, or changing any security policies. Existing sample areas stay addressable for historical favorites and sessions. They are explicitly marked `is_sample_data=true`; primary Areas results and new timer choices show the real areas. Unknown capacity, estimated availability, update time and tow company are NULL rather than made-up values. The capacity column permits NULL for this purpose.

The migration is repeatable: only these four managed real lots' rules are refreshed, located by BYU lot code. Generated area/permit IDs are resolved from the database. All other area/rule rows remain untouched.

## Verification

105 tests pass on the disposable local PostgreSQL database, with zero failures or skips. New tests evaluate rules read back from the actual migration, covering the independent permit matrix, every enforcement boundary, weekends and 00:59/01:00/04:59/05:00 for all four lots. The migration is applied twice in tests and old sample rows remain unchanged. A separate rendering test prevents sample records from appearing in primary results while preserving them in shared state.

Production data read-back, interactive live checks and accessibility evidence are recorded on the L1/P5 Trello cards after deployment. PO acceptance remains separate from Done.
