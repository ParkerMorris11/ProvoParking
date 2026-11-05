# Sprint 2 — Parker review evidence

Prepared November 5, 2026. The work below is in draft PR #29 and is not yet deployed.

| Card | Estimate on Trello | Evidence and remaining work |
| --- | --- | --- |
| Parking timer to map | 3 points | Provo-time filtering, nearby recommendations, location pause/resume and a review-before-timer suggestion are in PR #29. Unit tests cover eligibility, location and suggestion behavior. Signed-in and physical-phone GPS acceptance remain. |
| Extend parking map | 5 points | PR #29 adds 28 downtown facilities from the Provo City GIS snapshot. Local preview opened a selected city's lot popup; rules are labeled unverified. This is downtown coverage, not a complete city inventory. |
| BYU permit help | 3 points | PR #29 adds permit guidance, links and rule exceptions. Local guest preview and Lighthouse mobile/desktop audits were checked. |
| README | 1 point | PR #29 updates status and source descriptions. Reconcile after final integration. |
| Manage team commits | 3 points | PR #29 integrates original commits from #25, #26 and #27. Full integration, live verification and review remain. |

Actual time is not filled in here: use recorded Trello time or the team’s time tracker, rather than guessing.

## Verification

- Full suite with disposable local PostgreSQL: 160 passed, zero skipped before final copy/link-only changes. Subsequent non-database suite: 123 passed, seven database tests skipped.
- Local public-data preview: 102 BYU sections loaded; Y permit showed 33 eligible sections and mapped boundaries at the tested time. A downtown lot opened its corresponding popup. Guest lot-to-My-car flow did not start a session; restored local-timer link opened the standalone page.
- Lighthouse mobile accessibility: Help 100/100, Areas 100/100. Desktop Help 100/100. Screenshots were checked to confirm the real screens loaded. Audit preview set guest mode in a temporary copy, with the project's public configuration; it did not create an account or parking session.
- Audit screenshots: [Help mobile](screens/sprint-2-review/help-mobile.jpg), [Areas mobile](screens/sprint-2-review/areas-mobile.jpg), and [Help desktop](screens/sprint-2-review/help-desktop.jpg). Desktop Areas audits captured the loading screen and are not valid evidence.
- Phone-width layout was checked at 390 px without document overflow. A physical phone, real GPS permissions, signed-in timer flow and final deployed-site validation remain outstanding.

The team architecture documentation is in [README architecture section](../README.md#system-architecture-sprint-1-review). The automation Level 1 DFD is separate work and should be linked when available.
