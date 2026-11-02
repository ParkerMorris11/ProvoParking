# BYU map integration — PR #11

The Areas screen now includes a Leaflet 1.9.4 map over OpenStreetMap tiles, the 189 boundary features supplied in PR #11, and markers for database parking areas with valid coordinates. Tap a boundary for its recorded permit category and description; tap a white database marker to open the existing area details page.

The map is initialized after Areas becomes visible and resized on return. It does not delay loading the rest of the application. The same parking list remains available for keyboard and screen reader use. Boundary colors describe categories, not eligibility or occupancy; permit/day/time eligibility still comes from the existing database rules and appears in the list. The snapshot has no verified join to database area IDs. Do not infer one from proximity.

## Fixes during integration

- Corrected the Leaflet CSS integrity hash to the [official published value](https://leafletjs.com/download).
- Included `data/` in the GitHub Pages artifact, preventing a missing boundary file after deployment.
- Kept database markers usable when the boundary download fails, with a visible warning; missing Leaflet falls back to the list.
- Rejected null, empty, nonfinite and out-of-range coordinates rather than plotting them at zero.
- Added app detail links to database marker popups and kept these markers above boundary shapes.
- Used exact permit categories so YV is not mistaken for V; absent / No BYU Parking categories use neutral gray.
- Used a bounded map height on phones and turned off wheel zoom so scrolling the page does not unexpectedly zoom the map.
- Preserved linked OpenStreetMap attribution and used the standard tile URL. See the [tile usage policy](https://operations.osmfoundation.org/policies/tiles/). No bulk tile downloads or offline prefetching.

## Data provenance and limitations

`data/byu-campus-parking.json` is the unchanged snapshot supplied by PR #11. Its fields include Lot, Lot_Type, permit_typ and Descriptio. The original ArcGIS service identifier, retrieval date and verification record were not included in that PR, so this integration does not certify its descriptions as current official parking rules. Compare with [BYU's campus map](https://map.byu.edu/) and posted signs when verifying lots. Database lot coordinates, occupancy estimates and tow contacts remain samples. This is not a live occupancy feed or a navigation engine.

## Verification — November 1, 2026

- All 22 Node tests pass, including coordinate validation, permit category distinctions, missing-library fallback and failed boundary download. The coordinate and deployment tests failed against the original PR; the category test exposed the YV/V collision before its fix.
- Every JS file passes `node --check`; `git diff --check` passes.
- Local preview using the app's existing public Supabase configuration: four areas and 189 boundary shapes load; no browser console errors/warnings observed in the normal path.
- Y permit / Monday / 08:00: Y and U sample lots allowed, residential street not covered. Boundaries stay category based, as explained on screen.
- Tapped a boundary and read its popup; tapped the stadium database marker and followed its Rules & details link to the existing area page.
- Reload and returning from details to Areas retain a correctly sized map. Saved permit choice is preserved; arrival defaults retain existing behavior.
- Lighthouse accessibility: 100/100 at phone 390×844 and laptop 1440×900, no run warnings. Captures visually inspected; this is emulation, not a manual real-phone or screen-reader certification. Lighthouse also reports an existing unscored visible-label/name mismatch on list links (`Rules & details` versus `Rules and details`); it is outside this map integration.
- Screenshots: `docs/screens/map/phone.png` and `laptop.png`. Full Lighthouse HTML/JSON reports are in the workspace outputs folder.

No database schema/policy changes, timer PR merges, Trello edits, or production deployment were performed. Main is unchanged. The repository contribution guide requires a teammate to pull, test and review before squash-merging. After that merge, verify the GitHub Pages deployment and live map.
