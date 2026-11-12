# Clear daily parking rules

## What changed

Lot details now have a personal status card followed by a permit-independent 24-hour schedule. A day selector changes only the shared schedule, not the user's selected arrival. Each day partitions midnight to midnight into adjacent, non-overlapping periods: no parking, permit required (including accepted codes and recorded time limits), no permit restriction listed, or not verified. The proportional strip has an equivalent ordered text list, so color is never the only signal.

Stored schedule endpoints are inclusive to the minute. Display endpoints are exclusive: a row ending at 06:59 is shown as “until 7 AM.” Lot 1A's recorded normal weekday therefore reads:

| Hours | Ordinary-stall rule |
| --- | --- |
| Midnight–1 AM | No permit restriction listed |
| 1–5 AM | No parking |
| 5–7 AM | No permit restriction listed |
| 7 AM–7 PM | A permit required |
| 7 PM–midnight | No permit restriction listed |

The overnight closure ends at 5 AM, not 4:59 AM. The schedule uses each area's own data; no 1–5 AM closure or 7 PM enforcement ending is hardcoded onto other lots. Unknown periods stay unknown.

An explicit permit-free closure now takes precedence over overlapping permission rows in the shared eligibility engine, so the status, list filtering and daily overview agree. The live parking clock also refreshes lot details at minute boundaries.

## Source review — November 12, 2026

- [BYU Parking Rules and Regulations](https://security.byu.edu/parking-regulations): the accessible search-index rendering states that ordinary campus parking is prohibited 1–5 AM, with exemptions for BYU-owned vehicles and on-campus housing, and arrangements for approved overnight needs. It lists A/G/Y/U privilege coverage, vehicle registration requirements, and event/signage limitations. It also describes normal weekends and holidays as open to the public, subject to exceptions.
- That accessible rendering is labelled **released September 23, 2025**. The repo's previous verification documentation references a July 23, 2026 release. Direct retrieval returned 403, so this review does **not** claim to have freshly downloaded or reconciled that newer version.
- [Official campus parking map](https://map.byu.edu/?layer=parking): the page was accessible, but its [ArcGIS layer](https://services.arcgis.com/FvF9MZKp3JWPrSkg/arcgis/rest/services/Campus_Parking_Lots/FeatureServer/0) and Lot 1A object 147 could not be freshly retrieved in this environment. Lot 1A's 7 AM–7 PM weekday enforcement matches the checked-in, previously verified official GIS manifest and migration.
- Existing sources/recorded verification dates are shown under Sources and verification. No dates are advanced merely by changing the display. This PR does not change database rules or policy data.
- Because calendar exceptions and weekend eligibility are not fully represented in the current rows, missing weekend periods remain “Not verified.” Do not turn a missing record into permission. Freshly verifying and modeling the newer policy, weekend hours, holidays, reading days and finals is separate data work.

## Verification

Unit coverage includes all 1,440 weekday minutes for A, Y and no permit, exact 1/5/7/19-hour transitions, closure precedence, seven-day coverage without gaps or overlap, overnight windows, per-permit limits, U and housing-shaped rows, malformed/missing rules, and identical general rules across selected permits.

The dependency-free local tests passed. Browser/computer review was blocked: the in-app browser could not reach the local server, and native browser control stopped because it could not verify the active URL. No local screenshots or Lighthouse scores are claimed.

For reproducible review, serve the repository root and open `tests/manual/lot-rules.html`. It renders the production components against the Lot 1A source-shaped fixture, with no account or production database. Query parameters: `?theme=dark`, `?permit=1` (A), `?permit=2` (Y), `?time=03:00`.

The PR-only workflow `lot-rules.yml` installs pinned Lighthouse 12.8.2 and Playwright 1.56.1 in a temporary directory. It checks 320/390/768/1440px layouts in light and dark themes, day selection and focus, overflow, and runtime errors. Screenshots and mobile/desktop Lighthouse HTML/JSON reports are uploaded as a GitHub Actions artifact. It requires 100 in performance, accessibility, best practices and SEO for the **isolated lot-details fixture**. Inspect the run before claiming those scores.

The isolated audit does not measure the full authenticated app, Supabase/network performance, map resources, assistive-technology usability or all possible lot data. A perfect full-site score cannot be guaranteed from this preview. No code is deployed or merged by these checks.
