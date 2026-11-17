# Provo Parking — IS 403

A full-stack admin site for the Provo Parking project, built with Node.js, Express, EJS, Knex, and PostgreSQL. It lives in this `is403/` folder on the `is403-express` branch and does not replace the live static app on `main`.

## Stack

![Provo Parking IS 403 stack: the browser talks to Express routes on Render (planned). Express uses EJS views, express-session with a Postgres session store, and bcrypt auth middleware, then Knex, then a Supabase Postgres database (planned) with users, lots, permits, and session tables.](docs/stack-diagram.png)

```mermaid
flowchart TB
  Browser["Browser"]
  Browser --> Routes

  subgraph Render["Render (planned)"]
    direction TB
    Routes["Express routes"]
    Routes --> Views["EJS views"]
    Routes --> Sess["express-session<br/>Postgres session store"]
    Routes --> Auth["bcrypt auth middleware"]
    Routes --> Knex["Knex"]
  end

  subgraph Postgres["Supabase Postgres (planned)"]
    direction LR
    Users["users"]
    Lots["lots"]
    Permits["permits"]
    SessTbl["session"]
  end

  Knex --> Users
  Knex --> Lots
  Knex --> Permits
  Sess --> SessTbl

  classDef client fill:#002E5D,stroke:#002E5D,color:#FFFFFF
  classDef route fill:#FFFFFF,stroke:#002E5D,color:#002E5D
  classDef knex fill:#0062B8,stroke:#0062B8,color:#FFFFFF
  classDef table fill:#002E5D,stroke:#002E5D,color:#FFFFFF
  classDef sess fill:#FFFFFF,stroke:#002E5D,color:#002E5D
  class Browser client
  class Routes,Views,Sess,Auth route
  class Knex knex
  class Users,Lots,Permits table
  class SessTbl sess
```

## How it meets the assignment

- [x] Landing page with images — wordmark plus desktop and phone screenshots of the app
- [x] Login with `user_email` and `user_password` — passwords are stored as bcrypt hashes, never in plain text
- [x] Hidden **Maintain Users**, **Maintain Records** (lots), and **Maintain Permits** buttons, shown only after login
- [x] Add, view, edit, and delete on every table, including users
- [x] Logout clears the `pp403.sid` cookie, removes the session, and hides the buttons
- [x] Comments in the server, database, and views
- [ ] Deployed — not hosted yet. Plan is Render for the app and a separate Supabase Postgres database.

## For TAs

| | |
|---|---|
| **Live URL** | TBD — not deployed yet |
| **Test login** | TBD — will be provided when the site is hosted |

This app is only on the `is403-express` branch. Please do not use the live Provo Parking site or its database.

## Run locally

From this folder (`is403/`):

```bash
npm install
cp .env.example .env
# fill in the variables in the table below
npm run migrate
npm run seed
npm start
```

Then open http://localhost:3000. Use a **local** Postgres database, never the live Provo Parking database.

## Environment variables

| Name | What it is |
|---|---|
| `DATABASE_URL` | Postgres connection string for this project's database |
| `DATABASE_SSL` | Set to `true` for hosted Postgres |
| `SESSION_SECRET` | Random string used to sign the session cookie |
| `NODE_ENV` | Set to `production` when deployed |
| `SEED_ADMIN_EMAIL` | Email for the TA login created by `npm run seed` |
| `SEED_ADMIN_PASSWORD` | Password for that TA login |

Optional: `PORT` (default 3000) and `DB_SCHEMA` (default `public`).

## Folder layout

```
is403/
  index.js                 Express app, sessions, and routes
  knexfile.js              Knex config (reads DATABASE_URL)
  db/knex.js               Shared Knex instance
  db/migrations/           users, permits, lots, and session tables
  db/seeds/                BYU permits, verified lots, and the admin user
  data/                    Lot JSON used by the seed
  views/                   EJS pages (landing, login, users, lots, permits)
  public/                  CSS and images
  tests/app.test.js        End-to-end tests
  docs/stack-diagram.png   Stack diagram used above
```

## Database tables

| Table | Purpose |
|---|---|
| `users` | Logins. Key columns: `user_email`, `user_password` (bcrypt hash), name, and `created_at` |
| `permits` | Permit types (A, Y, U, and others) |
| `lots` | Parking lots. Optional link to a permit (`ON DELETE SET NULL`) |
| `session` | `express-session` store used by `connect-pg-simple` |

`npm run seed` loads the permit types and 73 verified lots, then creates the admin user from `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD`.

## Tests

Eight end-to-end tests in `tests/app.test.js` cover the landing page, login and hashed passwords, hidden Maintain buttons, add/view/edit/delete for lots, users, and permits, and logout clearing the session cookie.

They need a disposable **local** database:

```bash
TEST_DATABASE_URL=postgres://USER:PASSWORD@localhost:5432/is403_test npm test
```
