# Provo Parking

A lightweight parking finder for BYU and Provo, built with plain HTML, CSS and JavaScript. Supabase stores account data; GitHub Pages hosts the app. There is no frontend framework or build step.

## What the app currently does

- Email/password and optional Google sign-in, password recovery, remembered sessions, and guest browsing.
- Search and filter recorded BYU parking sections by a selected permit and arrival day/time. “Parking right now” uses Provo time and refreshes as the rules change.
- Full-screen campus map with a phone pull-up list and desktop side panel; optional foreground location, nearby sections, lot search, and distance sorting.
- Separate Provo City / OpenStreetMap facilities layer and All Lots directory. City records are informational; they are not verified BYU permit eligibility.
- Lot details with recorded rules, source links, verification dates, approximate directions, and favorites.
- One database-backed parking timer per signed-in account, available through the floating car button on every app page.
- Admin-only OKR metrics backed by protected database functions. Goal editing from the separate admin refresh PR is not included here.
- A sign-in loading screen using the transparent Y pin, theme-aware colors and reduced-motion support.

## Account timer behavior

The authoritative timer is the existing `public.parking_session` row. Starting one saves its lot, destination building, selected permit, note, duration, reminder and server-stamped start/end times.

- The database enforces **one active session per user**, including concurrent starts from different tabs/devices.
- Closing the popup, changing pages, closing the browser or reopening the app does not reset or end the timer.
- Remaining time is recomputed from its saved deadline. Both the floating countdown and popup use a monotonic clock anchored to a server response.
- The saved session refreshes on tab focus, visibility restoration, page restoration and reconnection, and every 30 seconds while the app is visible. Other tabs receive a lightweight refresh signal after changes.
- If a timer expires, it stays active and displays the overage until the user chooses **I left — end timer**. Expiration alone does not mean the car moved.
- A competing start restores the existing saved session rather than replacing it.
- The popup traps keyboard focus only while open, restores focus on close, and leaves normal page navigation available afterward.
- Rules are checked across the planned stay, including midnight, weekday transitions and Provo daylight-saving changes. Notices cover no-parking periods, permit mismatches, unknown coverage and recorded time limits. Notices also appear on the running timer.
- A notice does not prove real-world eligibility or automatically shorten/end the timer. Posted signs, temporary closures and actual vehicle registration still govern.
- **Reminders are foreground UI notices.** Closing the app does not schedule a push notification or phone alarm. The saved countdown resumes correctly when reopened.
- The old `parking-setup.html` and `parking-timer.html` URLs redirect to the main account timer. Legacy local-timer modules and `owned_parking_session` history remain for compatibility/testing; production pages no longer start independent timers through them.

The destination remains required for the existing course/admin distance metric.

## Data coverage and limitations

BYU ordinary sections use the checked-in official GIS manifest and database rules. The current manifest models 102 ordinary A/G/Y/U sections; it is not a complete map of every privilege, specialty stall or calendar exception. Legacy sample rows are retained for history and excluded from primary eligible results.

Provo City and OpenStreetMap facilities are a separate snapshot. Recorded hours and capacities are not live availability or verified parking permission. Coordinates identify approximate lot/section locations, not verified entrances or individual stalls.

Rules follow recorded normal-week schedules. Unknown periods remain unknown. Events, holidays, finals, reading days, breaks, specialty stalls and on-campus housing can require different treatment. See [source notes](docs/verified-byu-sections.md) and the links shown in the app. This PR does not refresh the underlying policy dataset.

## Run locally

Requires Node 20+ for tests. Serve the files over HTTP; do not open `index.html` directly from disk.

1. Clone this repository.
2. Copy `config.example.js` to `config.js`.
3. Set `SUPABASE_URL` and `SUPABASE_ANON_KEY` in `window.APP_CONFIG`. The latter is the project's browser-safe publishable/legacy anon key. Never use a service-role or secret key.
4. Run `npm start` (uses `npx serve`), or use a local static HTTP server.
5. Open the server's address.

`config.js` is ignored by Git and generated from repository secrets during Pages deployment. Auth provider/redirect configuration must match the URL where the app runs.

## Database setup and timer rollout

Use the existing team Supabase project. **Do not rerun the sample schema/seed on production.**

For a new disposable development database, apply `supabase/schema.sql`, then `supabase/policies.sql`, then the checked-in `supabase/migrations/` files in filename order. Database tests provide a local Auth stand-in; a real project uses Supabase Auth. The old dated demo-policy files outside `migrations/` are historical and should not be replayed after account sign-in.

Before deploying this timer update, apply:

`supabase/migrations/20261113002000_single_account_timer.sql`

It adds the recorded permit, a partial unique index for active sessions, server-owned timing, and authenticated security-invoker timer RPCs. Existing per-user row security remains in place.

If an account already has multiple active sessions, the migration keeps the newest active and marks older ones ended. No session rows, favorites or notes are deleted. Review this reconciliation before rollout. The migration is repeatable and runs in a transaction; database tests cover repeated application, cross-account access and concurrent starts.

Deploy the app after the migration. Missing RPCs are an installation error, not a reason to fall back to a second timer store. This PR prepares the migration; it does not apply it to the live project or deploy the app.

## Code map

| Path | Responsibility |
| --- | --- |
| `index.html`, `css/styles.css` | App screens and shared design tokens |
| `js/main.js`, `js/router.js` | Authentication lifecycle, shared state and hash navigation |
| `js/pages/` | Individual page rendering and event handling |
| `js/data/load.js` | Reference/account data loading and timer restoration |
| `js/data/sessions.js` | Account timer RPCs and cross-tab refresh signals |
| `js/domain/eligibility.js`, `js/domain/stay-warnings.js` | Recorded-rule evaluation and whole-stay notices |
| `js/lib/server-clock.js` | Server-anchored monotonic countdown time |
| `js/components/car-fab.js` | Floating timer indicator across app pages |
| `js/data/visit-tracker.js` | Best-effort visit/start metrics; never a prerequisite for parking |
| `data/` | Sourced map/destination snapshots |
| `supabase/migrations/` | Ordered database changes; never edit already-applied migrations |
| `tests/` | Unit, integration and disposable PostgreSQL tests |

Preserve the existing plain-module architecture. Data calls belong in `js/data/`; business rules belong in `js/domain/`.

## Tests and review

`npm test` runs dependency-free Node tests. `npm run check` also syntax-checks the entry point. GitHub Checks syntax-checks all JavaScript and runs the database tests against a disposable PostgreSQL 17 service.

Database tests require `psql` and the exact local disposable database URI:

`P7_TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/provo_parking_p7_test`

The helpers reject non-local targets and URI overrides. These fixtures reset their named test database schemas; never point them at production.

New timer coverage includes simultaneous starts, account isolation, duplicate reconciliation, server-owned deadlines, restoration without restarting, stale-end safety, overnight rule crossings, unknown rules, time limits, and daylight-saving transitions.

The timer browser fixture uses the production UI with synthetic account data. Its separate workflow checks phone/desktop layouts, popup keyboard focus, page navigation, restoration and shared-tab state. It does not access a production account.

## Deployment and collaboration

GitHub Actions publishes `main` to GitHub Pages using `SUPABASE_URL` and `SUPABASE_ANON_KEY` repository secrets. Test and Pages workflows are separate; repository maintainers should require successful PR checks before merging.

Open a focused branch and PR, include validation and any migration steps, and wait for team review. Do not push directly to main. See [contributing](docs/CONTRIBUTING.md).

The separate PP-choice removal and daily rule-timeline PRs remain independent; this README does not claim those unmerged UI changes are deployed.

## Loading asset

The Y pin is a 224 × 301 transparent PNG displayed at approximately 112 × 151 CSS pixels. Its optimized size is **44,339 bytes**, down from 900,514 bytes (about 95% smaller), with no runtime image-generation or new dependency.
