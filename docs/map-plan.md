# Plan: a real, detailed parking map

Status: proposal for the team (2026-10-07). Nothing here is built yet.

## Goal
Replace the drawn sample map with a real map of BYU and Provo. Each parking lot or street segment is drawn as a colored shape with a text label ("✓ Legal now", "! 2-hour limit", "✕ Permit required"). The shapes come from our Supabase database and update when the user changes time, permit, or filters.

## Option A (recommended): Google Maps JavaScript API
| Need | How |
|---|---|
| Base map | Maps JavaScript API (Dynamic Maps) |
| Lot and street shapes | `google.maps.Data` layer loading GeoJSON polygons/lines from Supabase, styled by status |
| Text + icon labels (not color alone) | Advanced Markers with an HTML label at each lot's center |
| "Where am I?" | Browser geolocation; fall back to BYU campus (800 N & University Ave) if denied |
| Car location | A car marker at the saved parking area |
| Walk distance | Straight-line distance x 1.3 as an estimate (no extra API cost). Label it "about". |
| Directions | A Google Maps URL link (`https://www.google.com/maps/dir/?api=1&destination=LAT,LNG&travelmode=walking`). Free, no API call. |
| Search for a building | Start with a short list of BYU buildings in our database. Places Autocomplete costs extra; add later only if needed. |

**Cost** (third-party summary, June 2026: [Woosmap](https://www.woosmap.com/blog/is-google-maps-api-free); confirm on [Google's pricing page](https://developers.google.com/maps/billing/overview) before setup): about 10,000 free map loads per month, then about $7 per 1,000. A class project should stay far below that. **A Google Cloud billing account (card) is required** even when usage is free ([Google](https://developers.google.com/maps/documentation/javascript/usage-and-billing)).

**Key safety:** A browser map key is always visible in the page, so it must be locked down:
- Restrict it to HTTP referrers `https://parkermorris11.github.io/ProvoParking/*` and `http://localhost:*/*`.
- Restrict it to the Maps JavaScript API only.
- Set a budget alert and a daily quota cap in Google Cloud.
- Store it like the Supabase key: a GitHub secret (`GOOGLE_MAPS_KEY`) written into `config.js` at deploy, and in the local `config.js` that is never committed.

## Option B: Leaflet + OpenStreetMap
Same features, **no billing account and no key**. Free open-source map library ([Leaflet](https://leafletjs.com/)) with OpenStreetMap tiles (OSM's tile usage policy applies: low traffic, show attribution). Looks less like Google Maps, but nothing to pay or secure. Directions still use the free Google Maps link.

**Pick B if nobody wants to put a card on Google Cloud.** The data model and the rest of the plan are the same.

## Data changes (Supabase)
- `parking_area.boundary` (jsonb, GeoJSON Polygon or LineString) for the shape.
- Keep `latitude`/`longitude` as the label/marker point.
- Add the 8 areas from the instruction doc (Y Lot 37, G Lot south, 900 East, Joaquin 600 N, University Ave visitor, Branbury guest, Village at South Campus, Provo City Center), labeled sample until checked.
- `building` table (name, lat, lng) for destination search: Tanner, JFSB, Wilkinson Center, etc.

**Where shapes come from:** trace each lot in [geojson.io](https://geojson.io) over satellite imagery, then check lot numbers and types against the [BYU Campus Parking Map](https://security.byu.edu/parking-regulations). Utah County parcels ([GIS downloads](https://is.utahcounty.gov/gis/downloads)) can help with property lines. Each shape gets `source_url` + `last_verified_on` like the rules.

## Accessibility (Lighthouse >= 90)
Maps are hard for screen readers. Keep a **list view** of the same lots under/next to the map (the current card list), so every lot and its status is reachable by keyboard and screen reader. Labels always use text + icon, never color alone.

## Suggested Sprint cards (Fibonacci points)
1. Pick the map provider and create/restrict the key (or choose Leaflet) — 1
2. Add `boundary` column + the 8 sample areas to Supabase — 2
3. Trace real shapes for 3–4 lots in geojson.io and verify against the BYU map — 3
4. Show the base map centered on BYU with location fallback — 3
5. Draw lot shapes from Supabase, colored by status, with text labels — 5
6. Tap a shape to open the details sheet (reuse existing card data) — 3
7. Car marker + "Get directions" link — 2
8. Keep the list view in sync with map filters (accessibility) — 3

## Open questions
- Option A or B? (A needs someone's billing account.)
- Which lots matter most for Emma's 8 a.m. commute? Trace those first.
