# Parking discovery implementation

1. Extend the existing distance sort to take a building or GPS origin. Load coordinates already in the public destination table. Test changing the origin and fallback when coordinates are missing.
2. Wire Areas to default to the building selected in Find, expose an explicit nearest-to-me mode, and center the map on the selected building. Keep the permit/time filter and exact lot section handoff.
3. Add a searchable All Lots route with separate, paged BYU and city lists. Reuse the city snapshot loader and preserve each source's access and eligibility labels.
4. Test live-data equivalents for two permits, a destination switch, GPS ranking, and catalog search. Run the full suite and verify navigation in the browser before review.
