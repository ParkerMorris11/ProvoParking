# Working on Provo Parking

How the code is organized and how the four of us change it without stepping on each other.

## The stack in one paragraph
Plain HTML, CSS and JavaScript (no React, no build step). The browser loads `index.html`, which loads `js/main.js` as an ES module. Data lives in Supabase (PostgreSQL plus an automatic REST API), which we call with `supabase-js`. GitHub Actions publishes `main` to GitHub Pages. You only need a browser, Git, and Node 20+ (Node is only used for tests and a local server).

## Where things live

```
index.html              All screens (one <section id="view-NAME"> per page) and the tab bar
css/styles.css          All styles
js/
  main.js               Entry point: loads data, wires shared clicks (hearts, tabs, Park here)
  router.js             Hash routes (#find, #areas, #area/3, #favorites, #car, #help)
  state.js              Shared state (areas, permits, rules, favorites, session, Find choices)
  lib/                  Helpers with no app logic: format.js, dom.js, storage.js
  domain/eligibility.js "Can this permit park here at this time?" Pure functions, unit tested
  data/                 Every Supabase call: load.js, favorites.js, sessions.js
  components/           Reusable HTML pieces (area-card.js)
  pages/                One file per screen: find, areas, area-detail, favorites, car
tests/                  Unit tests (node --test), no installs needed
supabase/               schema.sql, policies.sql, and dated change files
docs/                   ERD, rules reference, screenshots, this guide
```

Rules of thumb:
- **A page file owns its screen.** Put rendering and that screen's event handlers in `js/pages/<page>.js`.
- **All database calls go in `js/data/`.** Pages call these functions; they never call `state.db.from(...)` directly. That keeps the Sprint 2 switch from the demo user to real sign-in in one place.
- **Business rules go in `js/domain/`** as pure functions (data in, result out) with a test in `tests/`.
- **Shared look goes in `css/styles.css`.** Add new classes near the screen they belong to.

## Adding a new page (example: Account)
1. In `index.html`, add a tab button `<button type="button" class="tab" data-view="account">Account</button>` and a section `<section id="view-account" aria-labelledby="h-account" hidden><h2 id="h-account" tabindex="-1">Account</h2>…</section>`.
2. Create `js/pages/account.js` with `export function renderAccount() { … }` and, if needed, `export function initAccount() { … }` for its event listeners.
3. In `js/router.js`, add `"account"` to `VIEWS` and call `renderAccount()` in `showView()`.
4. If it needs data, add a function in `js/data/` and call it from the page.

## Local setup (10 minutes)
1. `git clone https://github.com/ParkerMorris11/ProvoParking.git && cd ProvoParking`
2. Copy `config.example.js` to `config.js` and paste the Supabase URL and anon key (ask Parker; never commit `config.js`).
3. `npm start` (or `python3 -m http.server 8000`) and open the printed address. Opening `index.html` as a file will not work, because ES modules need a web server.
4. `npm test` runs the unit tests.

## Branches and pull requests
- `main` is always deployable. Never push to it directly.
- One branch per Trello card: `<name>/<short-card-title>`, for example `liam/permit-picker`.
- Keep PRs small (one card). Fill in the PR template, link the Trello card, and ask one teammate to review.
- The **Checks** workflow runs syntax checks and unit tests on every PR. Fix red checks before asking for review.
- The reviewer pulls the branch, runs it, and clicks through the change before approving. Merge with "Squash and merge".
- After merging, check the live site once the **Deploy to GitHub Pages** run finishes.

## Database changes
- Never edit a SQL file that has already been run on the live project.
- Add a new file named `supabase/YYYY-MM-DD-what-it-does.sql`. Make it safe to run twice (`IF NOT EXISTS`, `DROP POLICY IF EXISTS`).
- Prefer adding tables and columns over renaming or dropping them.
- Say in the PR that the file needs to be run, and who ran it on the live project.
- Every new table needs Row Level Security and a policy before the app can read it.

## Sprint 1 file map (who is likely to touch what)
Step-by-step instructions for each card are in [docs/sprint-1-cards.md](sprint-1-cards.md).

| Card | Main files |
|---|---|
| Verified BYU lot data (Liam) | new `supabase/2026-xx-xx-verified-lots.sql`, `docs/parking-rules-reference.md` |
| Permit picker on Areas (Liam) | `js/pages/areas.js`, `index.html` (view-areas), `css/styles.css` |
| Favorite heart survives refresh (Liam) | `js/pages/favorites.js`, `js/data/favorites.js` |
| Mobile layout (James), desktop layout (Spencer) | `css/styles.css`, `index.html` |
| Loading, empty and error states (James) | `js/pages/areas.js`, `js/lib/dom.js`, `css/styles.css` |
| Icon + text status, keyboard focus (James) | `js/components/area-card.js`, `css/styles.css` |
| Lighthouse fixes (Spencer), design feedback (James) | `index.html`, `css/styles.css`, page files as needed |
| README (Spencer) | `README.md` |
| Supabase check, merge and deploy (Parker) | `supabase/`, GitHub Actions |

Two people editing `css/styles.css` at once is the most likely merge conflict. Pull `main` before you start and again before you open your PR.
