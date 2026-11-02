# Integration and contributor history — November 1, 2026

Parker explicitly requested reviewing and merging the remaining PRs while retaining the contributors' commits. Use **Create a merge commit**, keeping original commit IDs and author metadata; no squash, rebase, cherry-pick replacement, or author rewriting.

## Work retained

| PR | Work | Original commits |
|---|---|---|
| [#8](https://github.com/ParkerMorris11/ProvoParking/pull/8) | James / @Jammezy: parking setup | `4fd9e8725f529593f024a121e6f75826246707a1` |
| [#9](https://github.com/ParkerMorris11/ProvoParking/pull/9) | James / @Jammezy: active timer and copy refinement | `bb42fac`, `d6a6df6166317b62636d9e9bf039fec837430250` |
| [#10](https://github.com/ParkerMorris11/ProvoParking/pull/10) | James / @Jammezy: session persistence foundation | `7c2e8c4f95e4b2d2a1818f23aedbf1b28ed840e1` |
| [#11](https://github.com/ParkerMorris11/ProvoParking/pull/11) | Map, UI refinement and opt-in location | `aeace13`, `6b86f27`, `cfd38fa`, `7ea56d5` |

James's original commits identify the author as `James <james@example.com>`. They remain unchanged. The PRs belong to @Jammezy, who is also credited in the merge descriptions. GitHub account attribution may require an email associated with his account; future commits should use his verified or GitHub-provided no-reply address. Preserving history does not silently change the original email.

## Review and integration fixes

- Timer code review found no merge-blocking bugs.
- Persistence code review found that libpq query options could bypass the test fixture's local-only target check. Separate follow-up commits `4716d16` and `5693101` reject URI query/fragment overrides and strip inherited PostgreSQL connection overrides before invoking psql. Four guard tests cover those boundaries. James's original persistence commit remains intact.
- The only merge conflict was `.github/workflows/pages.yml`. Keep **both** timer HTML files and the map's `data/` folder in the published artifact.
- The contribution guide now documents merge commits to match the team's requested preservation of author history.

## Verification before map PR merge

- Combined source passes **74 tests**, no failures or skips, including the real PostgreSQL/RLS suite on a new disposable local PostgreSQL 18 cluster at loopback port 55439. No live Supabase schema or records were changed.
- Every JavaScript file passes syntax checks; `git diff --check` passes.
- Deployment artifact preparation includes `index.html`, `parking-setup.html`, `parking-timer.html`, CSS, JavaScript, and BYU boundary data.
- Browser walkthrough: 30-minute/no-reminder setup reaches review without starting; final confirmation opens the timer; refresh retains original timestamps/countdown; cancel preserves the active timer; confirmed ending produces completed state. The test session is a labeled sample saved only in the local preview's browser storage.
- Map/location verification remains in `map-integration.md` and `live-location.md`.

## What merging enables

P5/P6 provide the browser-local setup/review/timer flow linked from My car. They do not yet use the P7 database service, and their default location remains a labeled sample. Find My Car's map connection remains a placeholder.

P7 merges the owner-secured service and migration **source**. Real sign-in, applying the migration to the authorized Supabase project, and connecting P5/P6 to that service remain future work. Do not claim that merging this PR enabled live persistent sessions.

The Pages deployment and original-commit ancestry must be checked after the final merge; those external results are reported separately.
