# BYU map integration — PR #11

> **Sprint 3 update:** the map is now pure Google Maps (2D default, 3D optional). Everything below about the tile library, popups and wheel zoom describes the original PR #11 version. See the README section "Google Maps 2D/3D map" for the current design.

The Areas screen includes a map with the 189 BYU boundary features supplied in PR #11. Sample database location circles have been removed at Parker's request. Tap a boundary for its recorded permit category and description. The separate parking list retains the existing database permit/day/time checks and detail links.

## Interface

- Map and permit results sit side by side on laptops, then stack on phones.
- Street tiles were desaturated through CSS so colored parking boundaries stand out. (Now: Google's own base map and attribution.)
- A labeled legend explains student, employee, visitor, U, housing, timed and restricted/other categories. Color is not the only way to identify a category: every boundary popup shows the category text.
- Reset view returns to the campus center at zoom 15. Wheel zoom is disabled to make page scrolling easier.
- The map initializes after Areas becomes visible, resizes on return, and does not delay loading the rest of the app. Missing map resources leave the list available with a visible message.
- `data/` is in the Pages artifact, which fixed the original PR's deployment issues.

## Data limitations

Colors show categories, not current eligibility or occupancy. The boundary snapshot has no verified join to database area IDs. The list is labeled as sample data and kept visually distinct from the boundary map. No database rows, policies or credentials changed.

`data/byu-campus-parking.json` remains the original PR snapshot. Its original ArcGIS service identifier, retrieval date and verification record were not supplied, so current official-rule verification remains outstanding. Compare with [BYU's campus map](https://map.byu.edu/) and posted signs. Database lot coordinates, occupancy estimates and tow contacts remain samples.

The Sprint 3 map uses the Google Maps JavaScript API with a referrer-restricted key from `config.js`; Google's attribution stays visible.

## Verification — November 1, 2026

- All 22 Node tests pass. Regression tests verify no database sample circles are plotted, category colors distinguish V/YV and restricted/unknown areas, failed boundary requests preserve the list, and a missing map library produced a useful fallback. The no-circle tests failed before removing the markers.
- Every JS file passes syntax checks; `git diff --check` passes.
- Interactive local preview against the existing public Supabase configuration: 189 boundaries load, no sample circles, seven legend entries, boundary popup, zoom and Reset view work. No console errors/warnings observed in the normal path.
- Responsive preview checked at actual viewport widths 433px and 1061px; no horizontal document overflow. Temporary viewport override reset afterward.
- The earlier Y/Monday/08:00 eligibility and map-to-details checks applied before the visual revision. Map marker-to-details links have now been intentionally removed with the circles; list detail links and eligibility logic remain unchanged.
- Lighthouse reports must be checked against screenshots of the loaded map: initial audit attempts captured only the loading screen and are not valid evidence. A 15-second FCP/load delay captures the rendered map. The final loaded-map audits at 390×844 and 1440×900 each scored 100/100 accessibility with no run warnings. Both screenshots were inspected. The existing unscored visible-label/name mismatch on list links remains (Rules & details versus Rules and details); manual screen-reader testing is not claimed.

Screenshots: `docs/screens/map/phone.png` and `laptop.png`; full reports are in the workspace outputs folder. The team approved integration on November 1 using merge commits to preserve contributor history; see `integration-2026-11-01.md` for the combined verification. Live Pages must be checked after deployment. No timer PR integration, Trello edits or production deployment were performed.
