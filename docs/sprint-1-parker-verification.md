# Parker: Sprint 1 verification — November 2, 2026

Scope: P2, P4 and P5. P21 sign-in remains paused/delegated. Other teammates' cards and unfinished auth work are outside this check.

## P4: connected Areas flow

Verified on https://parkermorris11.github.io/ProvoParking/ using the deployed main application:

1. Select Y, Tuesday, 08:00: Y/U sample areas show allowed; the residential sample is not covered.
2. Select 03:00: Y/U sample areas show the 01:00–05:00 restriction.
3. Switch to the residential permit at 08:00: the residential sample shows a three-day limit; Y/U are not covered.
4. Open the Y area's details: permit list, blocked hours, source and checked date appear.
5. Save the previously unsaved Y area: Favorites count changes from two to three after the database confirms the insert.
6. Refresh: the saved heart and count remain. Favorites lists the Y area.
7. Remove only the favorite created by this test: original two favorites remain. No existing favorite was removed.

The persistence check uses the existing shared demo user and the real Supabase `favorite_area` table, not a local fixture. It does not prove per-account isolation; that belongs to sign-in work.

## P5: reliability and dependency

All 17 eligibility tests pass: permits, day ranges, overnight schedules, blocked-window boundaries, invalid selections and malformed schedules. `npm test` passes 63 tests with one PostgreSQL integration suite skipped because this run did not start the disposable database; there are no failures.

A read-only live database check found four areas, all explicitly named Sample, and 16 rule rows. No verified L1 lots are available in `parking_area` yet. The 189 map boundaries are a separate snapshot and do not establish current, verified lot-level permit rules. P5 must remain In progress until its original verified-lot finish condition is checked against L1 data. Do not replace or relabel sample rows to claim completion.

## Definition of Done evidence

- Published flow reaches frontend → Supabase API → database → refreshed frontend.
- Responsive layout checked in browser viewports measuring 433 px and 1600 px; no document horizontal overflow. Lighthouse separately emulated 390 px and 1440 px.
- Live Areas Lighthouse Accessibility: phone 100/100 and laptop 100/100, with no run warnings. Both reports contain all four loaded area links, confirming the loaded results were audited.
- Lighthouse's unscored visible-label/accessibility-name audit flags the existing Rules & details links; this does not lower the reported score and remains a team accessibility follow-up.
- README lists Complete / Not complete requirements above.
- Functional code is already merged into main; this record changes documentation only.
- PO acceptance is separate from Done and remains Spencer's decision.

Timers were not changed: no additional actual work time was reported for this check.
