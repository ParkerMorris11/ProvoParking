# Opt-in location and nearby lots

Click **Use my location** on Areas and allow the browser permission prompt. The map shows a blue position dot and an accuracy radius, then ranks the three nearest distinct mapped lots within 5 km. Updates from the browser move the dot and refresh distances; the map centers on the first fix so later updates do not interrupt exploration. **Show lot on map** opens that boundary's recorded rules popup.

The optional permit-category dropdown matches the snapshot's exact code. It does not infer that a pass allows other categories, check parking hours, or claim occupancy. Restricted (`R`), No BYU Parking and missing-category features are excluded. Results are based on straight-line distances to bounding-box lot centers, not entrances, road routes or walking times. Large GPS uncertainty is displayed explicitly. The map covers BYU: users elsewhere may get no nearby results.

## Privacy and lifecycle

No location is requested on startup. The browser's [Geolocation API](https://www.w3.org/TR/geolocation/) is called only after clicking Use my location; HTTPS or localhost and browser permission are required. No new paid mapping service or API key is needed.

Coordinates are held in browser memory and never sent to our Supabase database, saved to localStorage, or logged. Moving/centering the map still requests the visible OpenStreetMap tiles as usual. Stop tracking clears the watch, user marker, accuracy ring and nearby results. Leaving Areas, hiding the document or leaving the page also pauses tracking; returning requires a deliberate click. This is foreground web tracking, not a background or closed-app location service.

Denied permission, unavailable/unsupported location, timeouts, invalid fixes and stale fixes display recovery guidance. A fix expires after 90 seconds without a fresh update, preventing old coordinates from continuing to appear live. Restarting does not create duplicate watches, and late callbacks after stop are ignored.

## Verification — November 1, 2026

- 34 Node tests pass. Location tests cover opt-in/duplicate start, updates, stopping watch ID zero, ignoring late updates, permission denial/retry, unsupported browsers, invalid positions, timeout and stale-fix expiry (including already-aged fixes). Nearby tests cover ranking, physical-lot deduplication after category filtering, restricted-lot exclusions, exact category filtering, invalid geometry and out-of-coverage locations.
- Syntax checks for all JS and `git diff --check` pass.
- Browser integration used a separate, clearly labeled **SIMULATED GPS TEST** page outside the repo. No real device permission or coordinates were requested by the agent.
- Starting the simulated watch displayed an accuracy of ±18 m and three nearby lots; selecting Y returned 19Y, 20Y and 49Y. Moving north changed their estimated distances from 400/480/560 m to 50/170/240 m.
- Show lot opened the matching 19Y boundary popup. Stop and permission denial cleared nearby controls/results; navigating Find → Areas left tracking paused. The unit tests independently verify clearWatch and coordinate removal.
- The active simulated layout was visually inspected at 390px with no horizontal document overflow. The real app's idle location controls were also checked against the current Supabase data.
- Lighthouse attempts for this revision captured the database loading screen, so their numerical scores are not valid accessibility evidence for the new controls. Earlier map/UI audits remain documented separately. Real-device GPS, OS/browser permission UX and screen-reader testing remain for human review.

No database changes, timer integration, Trello updates or production deployment. Included in map PR #11; the team approved integration on November 1 with original commits preserved. See `integration-2026-11-01.md`; live Pages verification follows deployment.
