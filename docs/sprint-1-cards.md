# Sprint 1 card playbook

Step-by-step instructions for every Sprint 1 card (Oct 28 to Nov 3). Read "Every card" once, then jump to your card.

Points are 1 pt = about 15 minutes. If a card is taking more than double its estimate, say so at the next scrum instead of struggling alone.

Some cards are partly done already because the app existed before Sprint 1. Each card says **Check first** so you do not redo working code. These notes come from reading the code, not from running it against the live database, so confirm what you see on your own screen.

## The plan at a glance (65 points)

Everyone has a mix of code and non-code cards. Parker and Liam own the database cards, James and Spencer own screen work. Totals follow the course range (about 16 to 20 points, 4 to 5 hours each).

| Person | Backend or data | Screen (HTML/CSS/JS) | Not code | Total |
|---|---|---|---|---|
| Parker (Scrum Master) | P2 Run pending SQL, verify Supabase (5) | P5 Account page placeholder (3) | P1 Scrum Master duties (2), P3 Architecture diagram (3), P4 Review, merge, deploy (3) | 16 |
| Liam | L1 Verified BYU lot data (8) | L2 Permit picker on Areas (5) | L3 README (3) | 16 |
| James | | J1 Mobile layout (5), J3 Loading, empty, error states (3), J4 Icon + text and keyboard focus (3) | J2 Design feedback (5) | 16 |
| Spencer (Product Owner) | | S1 Desktop layout (5), S2 Lighthouse fixes (5), S3 Favorites check and fix (3) | S4 KR definitions (1), S5 PO acceptance (3) | 17 |

## Build order

Cards are ordered so nobody waits on someone else for long. Merge in this order to avoid conflicts in `css/styles.css` and `index.html`.

| When | Who | What |
|---|---|---|
| **Tonight (Wed Oct 28)** | Parker | Merge PR #2 (P4, first part). Run the pending SQL (P2) and check the permit dropdown fills on the live site. Tell the team "main is ready". |
| **Thu Oct 29** (Scrum 1 after class) | Parker | P5 Account placeholder, then merge it. |
| | Liam | L1 lot research and SQL file (needs P2). |
| | James | J1 Mobile layout (merge before Spencer's S1). |
| | Spencer | S4 KR definitions on Trello (15 minutes), then start S1 Desktop layout after J1 merges. |
| **Fri Oct 30 to Sun Nov 1** | Liam | L1 finish, then L2 Permit picker. |
| | James | J3 States, J4 Focus, then J2 Design feedback (needs a working page to show). |
| | Spencer | S1 Desktop, S3 Favorites check and fix (needs P2). |
| | Parker | P3 Architecture diagram, review PRs as they come in (P4). |
| **Mon Nov 2** (Scrum 2) | Spencer | S2 Lighthouse, once J1, J3, J4 and S1 are merged. Fix what it lists. |
| | Liam | L3 README (add the diagram and Lighthouse score last). |
| | Everyone | Merge anything left. Freeze goal: all PRs merged by end of Mon if you can. |
| **Tue Nov 3** (Scrum 3) | Spencer | S5 PO acceptance on every Done card. Anything that fails goes back with a reason. |
| | Parker | Burndown screenshot, commit screenshots, FigJam "Sprint 1 Review" page. |
| | Everyone | Freeze at end of day: nothing new merges after this. |

**If someone gets stuck:** say so at the scrum or in the team chat the same day. The order above lets James or Parker pick up a small card from someone else without redoing work.

## Every card

1. **Trello:** make sure you are the one Member on the card, move it to **In progress**, start the timer.
2. **Branch:** `git checkout main && git pull`, then `git checkout -b yourname/short-card-name` (for example `liam/permit-picker`). Branch from `main` only after PR #2 is merged. Until then, branch from `claude/project-thread-oynv4n`.
3. **Run it:** copy `config.example.js` to `config.js` and paste the Supabase URL and anon key (ask Parker, never commit `config.js`). Run `npm start`, open the address it prints. `npm test` runs the unit tests.
4. **Change the files listed on your card.** Keep the PR to one card.
5. **Check it:** work through your card's **Done when** list in the browser. For layout cards, use browser dev tools (device toolbar) at 375 px and 1280 px.
6. **Commit and push:** a clear message such as `Show loading state on Areas`. Open a pull request into `main` and fill in the template (Trello card link, what changed, how you tested, screenshot).
7. **Review:** ask one teammate. The reviewer pulls the branch, runs it, clicks through the change, then approves. Squash and merge.
8. **After merge:** wait for the **Deploy to GitHub Pages** run, open https://parkermorris11.github.io/ProvoParking/ and check your change is live. Stop the timer, move the card to **Done**, tell Spencer so the PO can accept it.

**Definition of Done (the PO checks all six):** responsive on phone and desktop, works end to end with the real database, Lighthouse Accessibility 90 or higher, README updated if setup or features changed, merged to main by reviewed PR, live at the public URL.

**Where things live:** see `docs/CONTRIBUTING.md`. Short version: screens in `js/pages/`, database calls in `js/data/`, the parking-rule logic in `js/domain/eligibility.js`, HTML in `index.html`, styles in `css/styles.css`.

---

## Parker

### P1. Scrum Master duties (2 pts)
**Goal:** three live scrums, a working Burndown, and the board matches the plan.
**Steps**
1. Daily scrums (live, Zoom is fine, Slack does not count): Thu Oct 29, Mon Nov 2, Tue Nov 3, after class. Each person says: done since last time, doing next, blocked. Write 3 lines per person in the FigJam "Sprint 1 Review" page.
2. In Trello open the Burndown Charts power-up, create Sprint 1 (Oct 28 to Nov 3), include the lists Sprint Backlog, In progress, Done, Accepted by Product Owner - Sprint #1.
3. Check every Sprint Backlog card has exactly one Member and a size in the title.
4. Give the TA (taforlauracutler@byu.edu) access to Trello and FigJam.
**Done when:** three scrum notes exist, Burndown shows the sprint, every card has one owner.

### P2. Verify Supabase and run the pending SQL (5 pts) **do this first, others depend on it**
**Goal:** the live database has the permissions the app needs, so permits, rules and the car timer work.
**Check first:** open the live site. If the permit dropdown on Find is empty or every area says "No rules on file", the SQL has not been run.
**Steps**
1. Open the Supabase project `provo-parking` > SQL Editor.
2. Look at the current state. Run each of these and write the answers in your PR:
   - `select count(*) from permit;`
   - `select count(*) from parking_rule;`
   - `select tablename, policyname from pg_policies where schemaname = 'public' order by 1, 2;`
3. Paste `supabase/2026-10-14-screens-policies.sql` and click Run. It is safe to run twice (each policy is dropped first).
4. If `permit` or `parking_rule` have no useful rows, say so in the PR. Liam's card P6 below fills in the real lot data.
5. Re-run the policies query and confirm you now see read policies on `permit`, `parking_rule`, `tow_company` and `parking_session`.
6. Reload the live site and check the permit dropdown has options.
**Done when:** the permit dropdown fills on the live site, and your PR (or a comment on the card) lists the three query results before and after.
**Watch out:** the free Supabase project pauses when idle. If the site says "Failed to fetch", open the project and click Restore.

### P3. Architecture diagram (3 pts)
**Goal:** one diagram, in the README and on the FigJam "Sprint 1 Review" page.
**Steps**
1. Boxes: Customer app (browser, HTML/CSS/JS), GitHub Pages (hosting), GitHub Actions (build and deploy), Supabase (database and API), Admin portal (**mark as planned**, Express/Node on AWS), external services (Claude AI for the Sprint 2 rule check, official BYU and Provo rule pages it reads).
2. Arrows with labels, for example: browser to Supabase "reads areas and rules, saves favorites over HTTPS", GitHub Actions to GitHub Pages "deploys main", rule pages to AI "page text".
3. Draw it in FigJam, export an image to `docs/architecture.png`, and embed it in `README.md` under a heading "Architecture".
**Done when:** the image shows in the README on GitHub and the FigJam page has the same diagram.

### P4. Review, merge and deploy (3 pts)
1. Merge PR #2 first (it is the new structure everyone branches from). Check **Checks** is green, click through the live site after the deploy.
2. For every later PR: confirm a different person reviewed it, CI is green, then squash and merge. After each merge open the live site.
**Done when:** every merged PR had a second person, and the live site still loads after each one.

### P5. Account page placeholder and tab order (3 pts)
**Goal:** the five-page structure exists, so Sprint 2 (sign-in) and Sprint 3 (Account) have a place to land. No new features yet.
**Check first:** `js/router.js` lists the pages in `VIEWS`. Today they are find, areas, area, favorites, car, help.
**Steps**
1. Follow "Adding a new page" in `docs/CONTRIBUTING.md` for an **Account** page: a tab button and `<section id="view-account">` in `index.html`, `js/pages/account.js` with `renderAccount()`, `"account"` added to `VIEWS` in `js/router.js`, and a call in `showView()`.
2. The page says: "Account. Sign-in and saved settings arrive in Sprint 2." and has an `<h2 tabindex="-1">` like the other pages.
3. Tab order: Areas, Favorites, My car, Account. Keep Find and Help working for now (Liam's permit-picker card decides what happens to Find later).
4. Run `npm test` and click every tab.
**Done when:** all tabs open a page, the Account tab shows the placeholder, no console errors, CI green.
**Do before:** the layout cards (J1, S1) start, since you both edit `index.html` and `css/styles.css`. Merge this one first.

---

## Liam

### L1. Verified BYU lot data (8 pts)
**Goal:** at least 6 BYU lots with real rules and a source link on each rule.
**Check first:** run `select area_name, lot_code from parking_area;` and `select count(*) from parking_rule;` in Supabase to see what exists.
**Steps**
1. Read `docs/parking-rules-reference.md` (section 3 has BYU permits; it marks which rules were checked).
2. For each lot, find its rule on https://security.byu.edu/parking-regulations. Write down: lot, permit letters allowed, days, start and end time, any blocked hours (1 to 5 a.m. for most), maximum stay, and the page URL.
3. Create `supabase/2026-xx-xx-verified-lots.sql` (use today's date). Use `INSERT ... ON CONFLICT DO NOTHING` or `UPDATE` so it can be run twice. Look at `supabase/2026-10-07-cited-rules-update.sql` for the style and at `supabase/schema.sql` for column names (`parking_rule` has `area_id`, `permit_id`, `days_of_week`, `start_time`, `end_time`, `max_stay_minutes`, `blocked_start`, `blocked_end`, `source_url`, `last_verified_on`, `rule_note`).
4. Set `last_verified_on` to the date you checked. If you cannot verify a rule, leave it out or say so in `rule_note`.
5. Ask Parker to run the file (or run it yourself if you have SQL Editor access). Put the file in your PR.
6. Update `docs/parking-rules-reference.md` with the new rows.
**Done when:** the live Areas page shows at least 6 lots, and opening a lot's details shows rule text and a "source" link.
**Depends on:** P2.

### L2. Permit picker on Areas (5 pts)
**Goal:** choose your permit on the Areas page itself and see every lot re-check at once.
**Check first:** today the permit is chosen on **Find** (`js/pages/find.js`), and Areas only shows a sentence about it. The check itself is `evaluate()` in `js/domain/eligibility.js` via `evaluateArea()` in `js/components/area-card.js`.
**Steps**
1. In `index.html`, inside `<section id="view-areas">`, add a labelled `<select id="areas-permit">` above the list (use a `<label for=...>`).
2. In `js/pages/areas.js`, fill it from `state.permits` the same way `find.js` does. Set its value from `state.find.permitId`.
3. On `change`: set `state.find.permitId`, call `savePermit(id)` from `js/lib/storage.js`, then call `renderAreas()`.
4. Register the listener once. Add `export function initAreas()` and call it from `js/main.js` next to `initFind` and `initCar`.
5. Keep the sort order (usable lots first) that `renderAreas` already does.
**Done when:** changing the dropdown changes the icon and words on at least two lots; reload and the choice is still there; the dropdown can be used with the keyboard only.
**Depends on:** P2.

### L3. README (3 pts)
Make sure `README.md` explains: what the app is and who it is for, how to run it (`npm start`, `config.js`), the stack, the folder structure, links to the live site and the architecture diagram (from P3), and the Lighthouse score.
**Done when:** a new teammate could run the app from the README alone.
**Depends on:** P3 (architecture diagram) and S2 (Lighthouse score). Write the structure and run instructions early, add the diagram and score last.

---

## James

### J1. Mobile layout (5 pts)
**Goal:** the Areas page works on a 375 px phone.
**Steps**
1. Open the site, press F12, toggle the device toolbar, choose 375 px wide.
2. Walk the Areas page and the tab bar. Fix: any sideways scrolling, text cut off, buttons smaller than 44 px (tabs already use `min-height: 44px`; check the heart and "Rules & details" link).
3. All styles are in `css/styles.css`. Add changes next to the `.card` / `.heart` rules. Prefer relative units and `flex-wrap` over fixed widths.
4. Take before and after screenshots for the PR.
**Done when:** no sideways scroll at 360, 375 and 390 px, every tap target is at least 44 px.
**Watch out:** S1 (Spencer's desktop layout) also edits `css/styles.css`. Pull `main` before you start and before you open the PR.

### J2. Design feedback (5 pts)
1. Show the live Areas page to at least 3 people outside the team (phone in hand). Ask them: "Which lots can you park in with your permit? What would you tap next?"
2. Write each critique on its own Trello card or FigJam sticky (course asks one item per critique).
3. For each, write: what we changed, or why we did not.
**Done when:** at least 3 people, every comment answered.

### J3. Loading, empty and error states (3 pts)
**Check first:** `index.html` has "Loading parking areas…" in the status line. Look for what happens when Supabase fails or there are zero areas.
**Steps**
1. Loading: the status line should say loading until `loadData()` finishes (`init()` in `js/main.js`). Keep it, and make sure it is announced (it is a `role="status"`).
2. Empty: in `js/pages/areas.js`, if `state.areas.length === 0`, show "No parking areas yet." in `#area-list` instead of an empty list.
3. Error: `init()` in `main.js` catches failures. Make sure the message says what to do ("Could not load parking areas. Check your connection and reload.") and is red (`setStatus(message, true)`).
4. Test the error by turning Wi-Fi off, then reloading.
4. Text fixes spotted on the Areas page: the summary reads "with the Y permit permit" (the permit name already ends in "permit"; see `renderAreas` in `js/pages/areas.js`), and a second near-identical summary line appears above the heading (`#status` from `main.js` and `#areas-summary`). Keep one.
**Done when:** you have seen all three states in the browser and have a screenshot of each.

### J4. Icon plus text status and keyboard focus (3 pts)
**Check first:** `cardHtml` already prints an icon and words. Confirm the icon is hidden from screen readers (`aria-hidden="true"`) and the words alone carry the meaning.
**Steps**
1. Tab through the page with only the keyboard. Every control (tabs, hearts, links, selects) needs a clearly visible focus ring. If `css/styles.css` removes outlines, add `:focus-visible { outline: 3px solid #002e5d; outline-offset: 2px; }`.
2. The tab order should follow the visual order.
3. Check text colors have enough contrast (Lighthouse reports failures).
**Done when:** you can use Areas with the keyboard only, and focus is always visible.

---

## Spencer

### S1. Desktop layout (5 pts)
**Goal:** Areas uses the width of a laptop screen.
**Steps**
1. Today `main` is limited to 720 px. At 1024 px and wider, put the cards in a two-column grid: for example `@media (min-width: 1024px) { main { max-width: 1100px; } .cards { grid-template-columns: 1fr 1fr; } }`.
2. Check the Favorites page too, since it uses the same `.cards` list.
3. Screenshot at 1280 px.
**Done when:** at 1280 px the Areas page shows two columns and nothing overlaps; at 375 px it is still one column.
**Watch out:** James's mobile card (J1) also edits `css/styles.css`. Pull `main` before you start and before you open the PR. If you have never edited CSS, ask James at the scrum; this card is a good place to learn it.

### S2. Lighthouse accessibility (5 pts)
1. In Chrome open the live Areas page, F12 > Lighthouse > Accessibility only, run it once on Mobile and once on Desktop.
2. Fix what it lists (usually contrast, missing labels). Run it after J1, J3, J4 and your own S1 are merged so you do not fix the same thing twice.
3. Save a screenshot of both scores to `docs/screenshots/lighthouse-areas.png`.
**Done when:** both scores are 90 or higher, and the screenshot is in the PR.

### S3. Favorites check and fix (3 pts)
**Check first:** this may already work. `loadData()` reads `favorite_area` and `addFavorite` / `removeFavorite` in `js/data/favorites.js` write to it. Test it before changing anything.
**Steps**
1. Tap a heart on Areas. Reload. Is it still filled? Open Favorites: is the lot there?
2. Turn off Wi-Fi and tap a heart. You should see a red error message (from `toggleFavorite` in `js/pages/favorites.js`) and the heart should not change.
3. With a screen reader (or Chrome dev tools Accessibility tab), check the button announces "pressed" and its label changes between Save and Remove.
4. Fix anything that fails. If everything passes, write the test results in the PR and ask the PO to accept.
**Done when:** all four checks pass on the live site, and you have written the results in your PR. This is a good first code card: most of the time you are testing, and any fix is small.
**Depends on:** P2.

### S4. KR definitions (1 pt)
Copy the four definitions from the Product Vision doc into the Trello OKR card and the matching Track KR cards.

### S5. Product Owner acceptance (3 pts)
For every card in **Done**: open the live site, check the six Definition of Done items, then move it to **Accepted by Product Owner - Sprint #1** or write why it goes back.

---

## Before the Sprint 1 Review (Wed Nov 4)
- Everyone: at least one meaningful commit this sprint (the review needs a screenshot of each person's commits).
- Burndown chart screenshot, architecture diagram, the working Areas page.
- Retro notes and the Sprint 2 backlog (it must include the AI automation card) on the FigJam "Sprint 1 Review" page.
