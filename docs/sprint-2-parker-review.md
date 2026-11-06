# Sprint 2 — Parker review evidence

Prepared November 5, 2026; live Pages and Lighthouse re-checked November 6, 2026. PR #29 was merged and deployed. PR #28 (walking-time sort) is still open, has no Trello card, and is not required to mark the Sprint 2 Parker cards Done.

| Card | Estimate on Trello | Allocated time | Evidence and remaining work |
| --- | --- | --- | --- |
| Parking timer to map | 3 points | 48 min | Provo-time filtering, nearby recommendations, location pause/resume and a review-before-timer suggestion are on `main`. Unit tests cover eligibility, location and suggestion behavior. **Signed-in physical-phone GPS is still Parker’s checklist** in [live-location.md](live-location.md#physical-phone-checklist). |
| Extend parking map | 5 points | 80 min | 28 downtown facilities are live. Guest click-through on Pages (Nov 6): **Downtown** pans the map; **City and Covey Center Parking → Show on map** opened the Leaflet popup with unverified-rules caution and **Get directions**. Lighthouse Areas accessibility 100 at 390px and 1280px. This is downtown coverage, not a complete city inventory. |
| BYU permit help | 3 points | 48 min | Permit table is live on Help (Y, G, A and the rest). Lighthouse Help re-check Nov 6 on Pages: **100/100/100** accessibility, best-practices, and SEO at 390px and 1280px. |
| README | 1 point | 16 min | Sprint 2 table, Sprint 1 PO acceptance, email-confirmation, and #28 status reconciled to `main` (walking-time sort is not described as shipped). |
| Manage team commits | 3 points | 48 min | #25–#27 remain in `main` through #29. [#28](https://github.com/ParkerMorris11/ProvoParking/pull/28) is open, mergeable, CI green, **no reviews**; the team has not decided. It does **not** block Sprint 2 Done. |

Parker supplied a four-hour total and asked that it be split across these five cards. The allocation above divides that total in proportion to their point estimates; it is an approximate allocation, not individually measured time.

## Verification

- Full suite with disposable local PostgreSQL: 160 passed, zero skipped before final copy/link-only changes. Subsequent non-database suite: 123 passed, seven database tests skipped.
- Local public-data preview: 102 BYU sections loaded; Y permit showed 33 eligible sections and mapped boundaries at the tested time. A downtown lot opened its corresponding popup. Guest lot-to-My-car flow did not start a session; restored local-timer link opened the standalone page.
- Lighthouse mobile accessibility: Help 100/100, Areas 100/100. Desktop Help and Areas 100/100. Screenshots were checked to confirm the real screens loaded. Audit preview set guest mode in a temporary copy, with the project's public configuration; it did not create an account or parking session.
- Audit screenshots: [Help mobile](screens/sprint-2-review/help-mobile.jpg), [Areas mobile](screens/sprint-2-review/areas-mobile.jpg), [Help desktop](screens/sprint-2-review/help-desktop.jpg), and [Areas desktop](screens/sprint-2-review/areas-desktop.jpg). Earlier desktop Areas runs captured the loading screen and were discarded.
- Phone-width layout was checked at 390 px without document overflow. Live Pages guest re-check November 6 confirmed downtown click-through and Help content. A physical phone, real GPS permissions, and signed-in timer flow remain outstanding ([checklist](live-location.md#physical-phone-checklist)).

The team architecture documentation is in [README architecture section](../README.md#system-architecture-sprint-1-review). The automation Level 1 DFD is separate work and should be linked when available.
