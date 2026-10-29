# P2: Connect the live parking data

Trello: https://trello.com/c/TOVP6Xvu

## Reproduced on October 29, 2026

The live GitHub Pages app connects to the existing `provo-parking` Supabase project and loads four parking areas. However, Find has only the "Choose a permit" placeholder. The database contains 11 permits, 16 parking rules, and two tow-company reference rows, but these three tables have RLS enabled without SELECT policies for the browser's `anon` role.

The browser-role assertion in `supabase/tests-reference-reads.sql` failed before the fix with `Browser role cannot read permits`. This is a visibility problem, not missing seed data or a missing browser key. Do not rerun schema.sql or duplicate the seed rows.

## Prepared fix — pending approval

`supabase/migrations/20261029143325_enable_parking_reference_reads.sql` adds SELECT policies for `anon` on `permit`, `parking_rule`, and `tow_company`. RLS remains enabled. It adds no policies for profiles, user permit selections, or parking sessions, and adds no write policies.

Automatic approval review rejected applying this public read-access change. It has **not** been applied to the live database. Obtain explicit approval for unauthenticated visitors to read those three reference tables, then apply the migration once through the normal database change process.

The existing broad table privileges are unchanged; RLS controls row access. This migration is not a general security audit or the Sprint 2 sign-in implementation.

## Verify after approval and application

1. Run `supabase/tests-reference-reads.sql`. It checks the actual browser role can read all three reference tables while profiles, user permit selections, and parking sessions remain hidden. It runs in a transaction and writes no rows.
2. Reload https://parkermorris11.github.io/ProvoParking/ and check Find now lists permit options.
3. Select Y and an 8:00 a.m. arrival, then Show parking areas. Confirm the Y/U sample lots have readable eligibility results and source-backed rules in Rules & details.
4. Change the arrival to 3:00 a.m. and confirm the campus overnight restriction appears. Change the permit and confirm results refresh.
5. Refresh and check the selected permit still appears. Check at phone and laptop widths and save screenshots.

Lot locations, availability, and tow details remain sample data. Liam's L1 card owns verified lot data. P5's eligibility fixes remain in their separate draft PR. Do not mark P2 Done until the live verification and the course Definition of Done are satisfied.
