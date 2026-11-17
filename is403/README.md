# Provo Parking — IS 403 full-stack project

This folder is a **separate** Express app for the IS 403 assignment. It lives on the `is403-express` branch and does **not** replace the live static Provo Parking site at the repo root. Do not merge this branch to `main` or point it at the live Supabase project.

Built the class way: **Node.js + Express**, **EJS** views, **Knex** with **PostgreSQL**, and **express-session** logins.

- Landing page with images of the Provo Parking app and live counts from the database.
- Login with `user_email` and `user_password` (bcrypt hashes; plain passwords are never stored).
- After login, hidden buttons appear, one per table: **Maintain Users**, **Maintain Records** (lots), **Maintain Permits**.
  Each one has Create, Read, Update and Delete.
- **Log out** destroys the session in the database, clears the `pp403.sid` cookie and hides the buttons.

## Files

```
is403/
  index.js                 Express app: setup, sessions, every route
  knexfile.js              Knex settings (reads DATABASE_URL)
  db/knex.js               shared Knex instance
  db/migrations/           creates users, permits, lots and session tables
  db/seeds/                BYU permits + 73 verified lots, and the TA admin user
  data/                    verified lot JSON used by the seed (copy of the static site data)
  views/                   EJS pages (partials/, users/, lots/, permits/)
  public/                  CSS and images
  tests/app.test.js        end-to-end tests against a local Postgres
```

## Run it locally

From this folder (`is403/`):

```bash
npm install
cp .env.example .env          # then fill in DATABASE_URL, SESSION_SECRET, SEED_ADMIN_*
npm run migrate
npm run seed                  # adds permits, lots and the admin login from SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD
npm start                     # http://localhost:3000
```

Use a **separate** local Postgres database, never the live Provo Parking Supabase project.

Tests also need a disposable **local** database:

```bash
TEST_DATABASE_URL=postgres://postgres:PASSWORD@localhost:5432/is403_test npm test
```

## Environment variables

| Name | What it is |
|---|---|
| `DATABASE_URL` | Postgres connection string for the IS 403 database (separate from the live Provo Parking database) |
| `DATABASE_SSL` | `true` for hosted Postgres (Supabase, Neon, RDS) |
| `DB_SCHEMA` | Optional schema name (default `public`) |
| `SESSION_SECRET` | Long random string that signs the session cookie (required in production) |
| `NODE_ENV` | `production` when deployed (turns on secure cookies) |
| `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` | The TA login created by `npm run seed` |

## Rubric checklist

| Requirement | Where it is |
|---|---|
| Hand-written back end (not a site generator) | `index.js` — Express routes written by hand |
| Login with email and password | `POST /login` uses `user_email` and `user_password`; hashes stored with bcrypt |
| Sessions | `express-session` + `connect-pg-simple`; session rows in Postgres; cookie `pp403.sid` |
| Logout that ends the session | `POST /logout` destroys the session and clears the cookie |
| Two or more Maintain screens with add, view, edit, delete | Maintain Users (`/users`), Maintain Records / lots (`/lots`), Maintain Permits (`/permits`) |
| Knex talking to PostgreSQL | `knexfile.js`, `db/migrations/`, `db/seeds/`, queries in `index.js` |

## Deploying (not done yet)

This is a normal long-running Express server (`npm start`), so any Node host works (Render free is a good fit; AWS also works). It needs its **own** database — a new free Supabase project, or Postgres on the host. Do not use the live Provo Parking database, and do not merge this branch to `main`.

1. Create the separate database, set `DATABASE_URL` and `DATABASE_SSL=true`, then run `npm run migrate` and `npm run seed` once from this folder.
2. Create the web service with build `npm install`, start `npm start`, root directory `is403`, and the variables above.
3. Log in with the TA account and check every Maintain page.
