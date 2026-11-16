# Provo Parking

Provo Parking helps BYU drivers see where their permit lets them park right now, read the rules in plain language, time their stay, and save favorite lots. Provo city lots are shown alongside campus lots as unverified city/OpenStreetMap records.

IS 401-001, Fall 2026, Team 007: Parker Morris, Liam Tanaka, Spencer Warren, James Richardson.

**Live app:** https://provo-parking.vercel.app/ (also on GitHub Pages: https://parkermorris11.github.io/ProvoParking/)

## Contents

- [What the app does](#what-the-app-does)
- [Screens](#screens)
- [System architecture](#system-architecture)
- [Data flow diagrams](#data-flow-diagrams)
- [Data model (ERD)](#data-model-erd)
- [Run it locally](#run-it-locally)
- [Configuration and keys](#configuration-and-keys)
- [Database setup and migrations](#database-setup-and-migrations)
- [Deploy](#deploy)
- [Tests and checks](#tests-and-checks)
- [Project structure](#project-structure)
- [Known limits](#known-limits)
- [More documentation](#more-documentation)

## What the app does

Students who drive to BYU often circle lots that are full or that their permit doesn't cover, which makes them late and leads to tickets. Our persona, Emma Carter, is a BYU junior who commutes for 8 a.m. classes. Provo Parking lets a driver pick their permit and arrival time (or just type what they need), then shows which parking areas they may use, explains each lot's rules in plain language, times their stay, and remembers favorite lots.

| Feature | What it does |
|---|---|
| **Map home** | The map fills the screen and the app floats on it, laid out like familiar phone map apps (our own branding and icons). See [Map home](#map-home). |
| **Find** | Pick a permit, destination building, and "now" or a planned day/time. Results only include lots your permit allows at that time. |
| **AI search** | Type a request such as *"class at 3 pm at the JKB with my current permit"* (or use the mic) and the form fills in for you to review. Gemini runs in the `parse-find` Supabase Edge Function. See [AI search](#ai-search-parse-find). |
| **Areas and All Lots** | Areas lists the lots that match your Find choices. All Lots is a searchable catalog of BYU sections and Provo city lots. |
| **Lot details** | Rules grouped by schedule, source link and checked date, a heart to save it, a directions button (Apple Maps on iPhone/iPad, Google Maps elsewhere), and **Park here**. |
| **Favorites** | A saved-places list: each row shows the lot or your nickname for it (for example "Class"), a short status, **Go** for driving directions, and a ⋯ menu to rename or remove. Removing offers **Undo**. |
| **My Car (parking timer)** | One account timer at a time, saved in the database, so it survives refreshes, closed tabs and other devices. Shows a countdown, rule warnings for the planned stay, and "Time's up" when it runs out. |
| **Accounts** | Email + password or *Continue with Google*, optional permit step, *Keep me signed in*, *Forgot password*, and *Continue as guest*. |
| **Guest mode** | Guests can browse lots and rules. Guest mode lasts only for the current browser tab (`sessionStorage` key `provoParking.guest`), so every new visit starts on the sign-up / log-in screen. |
| **Loading screen** | A branded splash while the app starts and while a sign-in finishes. |
| **Dark mode** | Starts dark on a first visit. The moon/sun button switches it; the choice is saved on that device (`localStorage` key `pp-theme`). |
| **Help** | BYU permit table, how to read results, Provo rules, and what to do about a citation, with source links. |
| **Admin dashboard** | `admin.html`, a separate team-only sign-in. Reports the four OKR Key Results from database aggregates and lets the team edit objective and key-result titles and targets. See [docs/admin-okr.md](docs/admin-okr.md). |

### Map home

Built at runtime by `js/pages/fullscreen-map.js` from the existing screens and styled in `css/fullscreen-map.css`.

- **Bottom sheet** (a left sidebar on laptops): a grabber, the search bar, and a round profile button. On phones it drags between lowered, half and full.
- **Suggestions:** your parked car (while a timer runs), up to two favorites, then the first lots your permit allows now.
- **Browse:** round shortcuts to Find, Areas, All Lots, Favorites, Help and My Car. Other screens open in the sheet with a close button back to the map.
- **Profile menu:** *Sign up or log in* (guests) or log out, Quick guide, Help & account page, and an *Admin dashboard (team only)* link. The link opens `admin.html`, which has its own sign-in.
- **Top-left tile:** your permit, the time, and how many areas are open. Tap it to change the permit.
- **Right control pill (map only):** satellite/road, a 2D/3D switch, your location, zoom (laptops), and dark mode.
- **Selected lot:** the lot you open is highlighted on the map.

| Phone (half sheet) | Laptop |
|---|---|
| <img src="docs/screens/apple-maps-style/phone-half-light.png" alt="Map home on a phone with the sheet at half height" width="260"> | <img src="docs/screens/apple-maps-style/laptop-light.png" alt="Map home on a laptop with the left sidebar" width="480"> |

These screenshots were taken against a stubbed Supabase and a drawn stand-in map, not the live database or Google Maps.

## Screens

| # | Screen | Data it uses |
|---|---|---|
| 0 | **Sign up / Log in** | Supabase Auth, `app_user`, `user_permit`, `permit` |
| 1 | **Find** (with AI search) | `permit`, `user_permit`, `destination`, `parse-find` Edge Function |
| 2 | **Areas** and **All Lots** | `parking_area`, `parking_rule`, `favorite_area`, `data/*.json` lot outlines |
| 3 | **Area details** | `parking_rule`, `permit`, `tow_company` |
| 4 | **Favorites** | `favorite_area` (including `nickname`) |
| 5 | **My Car** | `parking_session`, `app_visit` |
| + | **Help** | static content with source links |
| + | **Admin dashboard** (`admin.html`) | KR aggregates, admin goal tables |

**Eligibility rule:** a lot is usable if a rule that applies on the chosen day and time is open to everyone or lists your permit, and the time is not in that rule's no-parking window (for example BYU's 1–5 a.m.). This is decided by `js/domain/eligibility.js`, never by the AI. A valid permit does not mean a space is open.

## System architecture

The customer app is a static site (no build step) that talks to Supabase. The rule-extraction AI and the AWS admin portal are **planned**, not deployed.

```mermaid
flowchart LR
  U[Driver] -->|permit, day, time, typed request| UI[HTML / CSS / JS app]
  GH[GitHub repository] -->|GitHub Actions| P[GitHub Pages]
  GH -->|Vercel Git integration| V[Vercel]
  P -->|serves app| UI
  V -->|serves app| UI
  UI -->|queries and auth| API[Supabase API and Auth]
  API -->|rows| DB[(Supabase PostgreSQL)]
  UI -->|2D / 3D map| GMaps[Google Maps JavaScript API v=beta]
  UI -->|plain-language or voice trip| Parse[Supabase Edge Function parse-find]
  Parse -->|text or audio + allowed IDs| Gemini[Gemini Flash]
  Parse -->|permit and building names| API
  CityGIS[Provo City GIS + OSM snapshot] -->|lot outlines and notes| UI
  Admin[Admin dashboard admin.html] -->|KR aggregates, goals| API
  UI -->|lot coordinates| Dir[Apple / Google Maps directions]
  A[Admin user - planned] -->|login and changes| WEB[Admin HTML / CSS - planned AWS]
  WEB -->|lot and rule edits| S[Express / Node - planned AWS]
  S -->|pending edits| AD[(Admin database - planned AWS)]
  S -->|approved rules - planned| DB
  Sources[BYU and Provo rule pages] -->|source text - planned| AI[AI rule extraction - planned]
  AI -->|proposed rule changes - planned| S
```

The planned rule-extraction AI requires human approval before any rule change is published. The live `parse-find` AI only fills in the Find form; the person reviews it and the stored rules decide what is allowed.

## Data flow diagrams

Logical names (what happens to the data), not product names. Dashed lines are planned or optional (voice). Processes 5.0 and 6.0 are planned.

**Level 0 (context diagram)**

```mermaid
flowchart LR
  Driver([Driver])
  Admin([Team admin])
  Sites([Parking rule websites])
  AI([AI service: Gemini Flash])
  Maps([Map service: Google Maps])
  Speech([Browser speech service])

  P0((0 Provo Parking))

  Driver -->|sign-up details, trip details, parking start/end, favorite pick| P0
  Driver -->|typed or spoken trip| P0
  P0 -->|eligible lots, time left, filled-in Find form| Driver
  Driver -.->|voice| Speech
  Speech -.->|transcript| P0
  P0 -->|trip text or audio, allowed permit and building IDs| AI
  AI -->|structured fields: permit, building, live, day, time, confidence| P0
  P0 -->|map load request| Maps
  Maps -->|2D tiles, 3D scene| P0
  Admin -->|approval decisions, goal edits| P0
  P0 -->|proposals, KR values| Admin
  Sites -.->|rule page text, planned| P0
```

**Level 1**

```mermaid
flowchart TB
  Driver([Driver])
  Admin([Team admin])
  Sites([Parking rule websites])
  AI([AI service: Gemini Flash])
  Maps([Map service: Google Maps])
  Speech([Browser speech service])

  P1(1.0 Register driver)
  P2(2.0 Find eligible parking)
  P3(3.0 Save favorite lots)
  P4(4.0 Track parking session)
  P5(5.0 Extract rule changes - planned)
  P6(6.0 Approve rule changes - planned)
  P7(7.0 Report key results)
  P8(8.0 Interpret trip request)
  P9(9.0 Draw map)

  D1[(D1 Drivers)]
  D2[(D2 Parking areas and rules)]
  D3[(D3 Favorites)]
  D4[(D4 Sessions and visits)]
  D5[(D5 Destinations)]
  D6[(D6 Rule change proposals - planned)]

  Driver -->|sign-up details| P1
  P1 -->|driver record| D1
  D1 -->|saved permit| P8
  Driver -->|typed trip| P8
  Driver -.->|voice| Speech
  Speech -.->|transcript| P8
  D5 -->|building list| P8
  D2 -->|permit list| P8
  P8 -->|text or audio + allowed IDs| AI
  AI -->|permit, building, live, day, time, confidence| P8
  P8 -->|filled-in Find form for review| Driver
  Driver -->|reviewed or typed permit, building, day, time| P2
  D2 -->|lot rules| P2
  D5 -->|destination| P2
  P2 -->|eligible lots| Driver
  P2 -->|eligible lots| P9
  D2 -->|lot outlines| P9
  P9 -->|map load request| Maps
  Maps -->|2D tiles, 3D scene| P9
  P9 -->|map, selected lot| Driver
  Driver -->|favorite pick, nickname| P3
  P3 -->|favorite record| D3
  Driver -->|parking start/end| P4
  P4 -->|session record| D4
  P4 -->|time left| Driver
  D4 -->|session and visit times| P7
  D1 -->|sign-ups| P7
  D3 -->|favorites per user| P7
  P7 -->|KR values| Admin
  Sites -.->|rule page text| P5
  D2 -.->|current rules| P5
  P5 -.->|extracted changes| P6
  P6 -.->|proposal| D6
  Admin -->|approval decisions| P6
  D6 -.->|pending proposals| P6
  P6 -.->|approved rules| D2
```

| Data store | Tables today |
|---|---|
| D1 Drivers | `app_user`, `user_permit` |
| D2 Parking areas and rules | `parking_area`, `parking_rule`, `permit`, `tow_company` (plus the `data/*.json` lot outlines the map draws) |
| D3 Favorites | `favorite_area` |
| D4 Sessions and visits | `parking_session`, `app_visit` |
| D5 Destinations | `destination` |
| D6 Rule change proposals | `rule_change_proposal` (planned) |

PNG and HTML versions of both diagrams are in [`docs/dfd/`](docs/dfd/).

## Data model (ERD)

![Provo Parking ERD](docs/erd.png)

Source: [`docs/erd.mmd`](docs/erd.mmd) (Mermaid).

| Relationship | Cardinality |
|---|---|
| app_user ↔ permit, through `user_permit` | many-to-many |
| app_user ↔ parking_area as favorites, through `favorite_area` (optional `nickname`) | many-to-many |
| app_user → parking_session | one-to-many |
| parking_area → parking_session | one-to-many |
| parking_area → parking_rule | one-to-many |
| permit → parking_rule (optional; no permit = open to all) | one-to-many |
| tow_company → parking_area | one-to-many |

The admin dashboard and visit metrics add `app_visit` and the admin goal tables; see [docs/admin-okr.md](docs/admin-okr.md) and [docs/visit-metrics-handoff.md](docs/visit-metrics-handoff.md).

## Run it locally

Needs Node 20+ (or Python 3) and a Supabase project.

1. `git clone https://github.com/ParkerMorris11/ProvoParking.git` and `cd ProvoParking`.
2. Copy `config.example.js` to `config.js` and fill in your Supabase URL and anon key, plus a Google Maps key if you want the map. `config.js` is in `.gitignore`.
3. Start a local server: `npm start` or `python3 -m http.server 8000`. Opening `index.html` as a file does not work because the app uses JavaScript modules.
4. Open `http://localhost:8000` (or the address `npm start` prints).

Without a Google Maps key the map area shows a short message and the lists still work. Without the `parse-find` function deployed, AI search says it isn't set up and the normal form still works.

## Configuration and keys

| Setting | Where it lives | Notes |
|---|---|---|
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | `config.js` locally; repository secrets for GitHub Pages | The anon key is meant for browsers. Row Level Security limits visitors to public reference data and signed-in users to their own rows. |
| `GOOGLE_MAPS_API_KEY` | `config.js`; optional repository secret | Visible to visitors, so restrict it in Google Cloud to HTTP referrers `https://provo-parking.vercel.app/*`, `https://parkermorris11.github.io/ProvoParking/*` and `http://localhost:*/*`, limit it to the Maps JavaScript API, and set a budget alert. |
| `GEMINI_API_KEY` | Supabase secret (`supabase secrets set GEMINI_API_KEY=...`) | Never in the browser. Optional: `GEMINI_MODEL` (default `gemini-flash-latest`) and `ALLOWED_ORIGINS` (extra comma-separated sites). |

Supabase Auth settings used by the team (set in the Supabase dashboard, not in code): **Confirm email** off; Site URL and Redirect URLs covering the Vercel site, Vercel preview URLs, the GitHub Pages URL and `http://localhost:8000/**`; Google provider enabled with an OAuth client whose redirect URI is `https://<project-ref>.supabase.co/auth/v1/callback`. *Continue with Google* only appears once the provider is on.

### AI search (parse-find)

`POST /functions/v1/parse-find` with `{ text, permit_ids, destination_ids }` (optionally `audio: { data_base64, mime_type }` for the iOS Safari fallback) returns exactly `{ permit_id, use_saved_permit, destination_id, live, day, time, confidence }`.

- The function checks the model's answer: IDs not in the lists the page sent become `null`, bad days/times are dropped, text is capped at 500 characters and audio at about 2 MB.
- CORS allows `https://parkermorris11.github.io`, `https://provo-parking.vercel.app`, `https://provo-parking-*.vercel.app` previews, `localhost` and `127.0.0.1`, plus any `ALLOWED_ORIGINS`.
- Confidence below 0.5 asks the person to check every field. Nothing is submitted for them.
- **Privacy:** only what the person types or says, plus permit and building IDs/names, goes to Gemini. No account details, location or favorites are sent, and audio is not stored.

Code path: `js/pages/find.js` → `js/lib/speech.js` (Web Speech API, or MediaRecorder on iOS Safari) → `js/data/parse-find.js` → `supabase/functions/parse-find/` (`index.ts`, `handler.js`, `sanitize.js`).

To turn it on: get a Gemini key from Google AI Studio, run `supabase secrets set GEMINI_API_KEY=<key>`, then `supabase functions deploy parse-find`. Test locally with `supabase functions serve parse-find --env-file <file>`.

## Database setup and migrations

**Do not rerun `supabase/schema.sql` or its sample seed on the team's production project.** Production changes go through the dated files in [`supabase/migrations/`](supabase/migrations/), which are additive.

New project (once):

1. Create a Supabase project. In **SQL Editor**, run [`supabase/schema.sql`](supabase/schema.sql), then [`supabase/policies.sql`](supabase/policies.sql).
2. Run every file in `supabase/migrations/` in name order:

| Migration | Adds |
|---|---|
| `20261029143325_enable_parking_reference_reads` | Public read access to permits, rules, tow companies |
| `20261029224555_parking_session_persistence` | Saved parking sessions |
| `20261102040636_account_sign_in` | Accounts: `app_user` trigger, per-user row security |
| `20261104155225_verified_byu_lots` | First four verified BYU lots |
| `20261104202009_google_sign_in_names` | Names from Google sign-in |
| `20261105025053_verified_byu_sections` | 102 verified BYU lot sections |
| `20261105032816_visit_metrics` | `app_visit` for KR 2b |
| `20261105040000_admin_okr_tracking` | Admin dashboard and KR aggregates |
| `20261111213837_admin_okr_goals` | Editable OKR titles and targets |
| `20261113002000_single_account_timer` | One active timer per user, server-owned timing, timer RPCs |
| `20261116050000_favorite_nicknames` | `favorite_area.nickname` and the rename policy |

3. Copy the Project URL and anon key from **Project Settings > API** into `config.js`.

Before deploying app code that needs a new migration, confirm the migration is applied to the team project. Without the nickname migration, favorites still load but renaming fails. Admin access setup is in [docs/admin-okr.md](docs/admin-okr.md).

## Deploy

- **GitHub Pages:** `.github/workflows/pages.yml` runs on every push to `main`. It writes `config.js` from the repository secrets `SUPABASE_URL`, `SUPABASE_ANON_KEY` and optional `GOOGLE_MAPS_API_KEY`, then publishes `index.html`, `admin.html`, the parking timer pages, `css/`, `js/`, `data/` and `assets/`. Set **Settings > Pages > Source** to **GitHub Actions**.
- **Vercel:** https://provo-parking.vercel.app/ with per-PR preview URLs. Its settings live in the Vercel dashboard, not in this repo.
- **Edge Function:** `supabase functions deploy parse-find` (manual; not part of either site deploy).

All code reaches `main` through reviewed pull requests, merged with merge commits so each teammate's authorship is kept. See [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md).

## Tests and checks

```bash
npm test        # unit tests (Node 20+, nothing to install)
npm run check   # syntax check of js/main.js, then the tests
```

Database tests (`tests/*-db.test.js`) need a disposable PostgreSQL in `P7_TEST_DATABASE_URL` and are skipped without it.

| Workflow | Runs on | What it checks |
|---|---|---|
| `ci.yml` (Checks) | every PR and push to `main` | `node --check` on every JS file, then `npm test` against a PostgreSQL 17 service |
| `account-timer.yml` | PRs touching app code | Playwright: timer navigation, restore and keyboard checks |
| `lot-rules.yml` | PRs touching eligibility, lot details or styles | Playwright desktop/phone/theme checks and Lighthouse, served gzipped like Pages (`scripts/serve-gzip.py`) |

## Project structure

```
index.html            app shell, sign-in and screens
admin.html            admin OKR dashboard (own sign-in)
parking-setup.html    older local-only timer pages (P5/P6), not synced with My Car
parking-timer.html
config.example.js     copy to config.js
css/                  styles.css (tokens + dark mode), fullscreen-map.css, area-detail.css, admin.css
js/main.js            entry point
js/pages/             one file per screen; fullscreen-map.js builds the map home
js/data/              every Supabase and Edge Function call
js/domain/            eligibility and other pure logic (unit tested)
js/lib/               Google Maps loader, speech, storage, clocks, formatting
js/components/        shared pieces (lot cards, car button, loading screen)
data/                 BYU sections, BYU destinations, Provo city lot snapshots
supabase/             schema, policies, migrations, functions/parse-find
scripts/              data builders and browser/Lighthouse audit scripts
tests/                node:test suites, fixtures, manual browser pages
docs/                 design notes, DFD, ERD, screenshots, sprint evidence
```

## Known limits

- **Rules are not live.** BYU sections use official map locations and published permit/hour rules checked November 4, 2026. Events, posted signs, finals, holidays and breaks can override them, and the app does not model calendar exceptions. Capacity and live availability are unknown.
- **Provo city lots are unverified.** City GIS and OpenStreetMap records are shown for directions only, never used for permit matching or the timer. Residential permit zones and most on-street time limits are missing.
- **Eligibility is based on the permit the user picks,** not a verified BYU account.
- **Reminders are on-screen only.** Closing the app does not schedule a push notification or alarm; the saved countdown resumes when reopened.
- **AI search can be wrong or unavailable.** It depends on Gemini and the deployed `parse-find` function. The person always reviews the filled-in form, and the form works without AI.
- **Rule-change extraction (DFD 5.0/6.0) and the AWS admin portal are planned,** not built.
- `parking-setup.html` and `parking-timer.html` are the older local-only timer pages kept for the P5/P6 course contract. They do not sync with My Car.
- Some README screenshots were taken against stubbed data, as noted under each one.

## More documentation

- [Contributing: branches, PRs, database changes](docs/CONTRIBUTING.md)
- [Admin OKR dashboard and goal editing](docs/admin-okr.md) · [Visit metrics](docs/visit-metrics-handoff.md)
- [Verified BYU sections](docs/verified-byu-sections.md) · [Verified lots](docs/verified-byu-lots.md) · [Parking rules reference](docs/parking-rules-reference.md)
- [Map integration](docs/map-integration.md) · [Live location](docs/live-location.md) · [Residential permit coverage](docs/residential-permit-coverage.md)
- [Parking session persistence](docs/parking-session-persistence.md) · [Older P5/P6 timer pages](docs/parking-timer-setup.md)
- Sprint evidence: [Sprint 1 verification](docs/sprint-1-parker-verification.md), [Sprint 2 review](docs/sprint-2-parker-review.md), [P2 live data check](docs/p2-live-data-check.md)
