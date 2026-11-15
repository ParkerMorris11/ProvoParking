# Eligible parking results

The Areas page now **filters**, rather than merely sorting eligible lots first. Its cards, map overlays and nearby suggestions show only verified lots whose stored rules return `ok` or `limit` for the selected permit, day and time. Limited-stay lots retain their time-limit label. Wrong-permit, blocked, unselected-permit-only, missing-rule, invalid-rule and sample lots are excluded. The underlying area records, favorites and history are retained.

## Current time and planning

“Parking right now” is selected by default on Find. The app evaluates Provo's local day and minute in `America/Denver`, including daylight saving time, independently of the device's time zone. It refreshes at each minute boundary and immediately when the app regains visibility or focus. An open page therefore adds/removes lots when their recorded restrictions change, including midnight and overnight closures.

Unchecking “Parking right now” enables the existing arrival-day/time inputs for explicit planning. The Areas summary clearly identifies **Right now** or **Planned arrival**, shows the Provo time and matching-section count. Planned results remain at the requested time until the user changes them or returns to live mode. A new account/guest entry starts in live mode.

No opening hour is hardcoded in the filter. It uses the existing `parking_rule` records. For the four original verified lots, for example:

- A G permit can use 59Y, 30G and 18U during ordinary weekday enforcement hours.
- A U permit shows only 18U during those hours. At 16:00, 59Y and 30G also appear because their stored permit restrictions end then.
- At 19:00, 14A appears under its recorded unrestricted rule. This is not a blanket assumption that every lot opens at 19:00.
- The recorded 01:00–05:00 overnight ban hides all four; weekend and other schedule changes follow the database rules.

This checks the arrival minute, not permission for the driver's entire planned stay. Availability, event closures, construction, finals/holidays and posted signs remain outside the normal weekly model and are still disclosed in the interface.

## Map matching

The map snapshot contains many boundaries without verified database rules. A boundary is shown only when its GIS `OBJECTID` matches the eligible section's `source_feature_id`. Lot codes can cover multiple sections with different hours and cannot safely identify a section. Unmatched boundaries remain hidden rather than being implied eligible. Nearby distance ranking runs over that same filtered set. Its optional category dropdown can narrow the eligible set, never bypass eligibility.

## Verification and deployment

No database migration or new credentials are needed. This change reads the existing area/rule data and deploys through the normal Pages workflow after review. Do not merge automatically.

`npm run check` covers permit privileges, after-hours thresholds, overnight bans, weekends, missing/invalid rules, limited stays, current/planned time, Provo midnight/DST, map matching, empty states and the refresh clock. The existing PostgreSQL integration suite also tests the filter and map matching against rules read back from the actual verified-lot migration.

Browser verification used the map library of that time (replaced by Google Maps in Sprint 3) and rule rows from an isolated PostgreSQL fixture. It checked the automatic 16:00 transition, 19:00 opening, overnight removal, permit changes, nearby filtering, keyboard focus and phone/desktop layouts. A device set to Los Angeles still displayed the correct Provo time. No production deployment or data changes were performed.

Manual review:

1. Choose U and keep “Parking right now” enabled. Check that all three Areas surfaces match the current Provo rules.
2. For a repeatable daytime check, uncheck live mode and select Wednesday 15:59: only 18U should appear for U. Change to 16:00: 59Y and 30G should join it. At 19:00, 14A should join.
3. Select 01:00: the cards, map overlays and nearby list should contain no eligible lots, with useful empty-state text.
4. Change to G at Wednesday 08:00: 59Y, 30G and 18U should appear; 14A should not.
5. Return to live mode, leave the page open across a recorded boundary or suspend/reopen the tab, and verify the displayed count changes without a reload.
