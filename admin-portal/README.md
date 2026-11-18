# Provo Parking admin site (IS 403)

A small Node.js website for maintaining Provo Parking's records. It is built the way we learned in IS 403:
**Express** for routes, **EJS** for pages, **Knex** + **pg** for the database, and **express-session** for login.

- Landing page with an image and a login form (`user_email`, `user_password`)
- After login: **Maintain Users**, **Maintain Lots**, and **Maintain Permits** buttons
- Each table can be displayed, added to, edited, and deleted from
- Every maintain page checks the session, so typing a URL while logged out sends you back home
- **Log out** destroys the session and removes the `connect.sid` cookie, which hides the buttons again

## Files

| File | What it is |
|---|---|
| `index.js` | The server: settings, login, logout, and all CRUD routes |
| `views/*.ejs` | The pages (`index`, `users`, `addUser`, `editUser`, `lots`, ..., `error`) |
| `views/partials/` | Shared header and footer, plus the lot and permit form fields used by Add and Edit |
| `public/` | Images and a small stylesheet |
| `db/setup.sql` | Creates the `portal` schema and its 3 tables, and copies real lots and permits into them |

The tables live in their own `portal` schema in our Supabase database. The live parking app never reads them, so
adding or deleting records here can't break the app. Supabase only exposes the `public` schema to browsers, so these
tables (including passwords) are only reachable from this server.

## Run it on your computer

1. `cd admin-portal`
2. `npm install`
3. Copy `.env.example` to `.env` and fill in the database password
   (or use your local pgAdmin Postgres and run `db/setup.sql` there first).
4. `node index.js`, then open http://localhost:3000

## Database setup (one time)

Open Supabase > SQL Editor, paste `db/setup.sql`, and run it.

## Deploy on Render

1. render.com > New > Web Service > connect the `ProvoParking` GitHub repo.
2. **Root Directory:** `admin-portal`. **Build command:** `npm install`. **Start command:** `node index.js`.
3. Add environment variables from `.env.example`, using the values from
   Supabase > Connect > **Session pooler** (host, port, user, password), plus `DB_SSL=true` and a long random `SESSION_SECRET`.
4. Deploy, then log in at the Render URL with the grader login below, in a private window.

The free Render plan sleeps when nobody uses it, so the first visit can take about a minute to load.

## Login for graders

- Email: `ta@provoparking.com`
- Password: `Parking403!`
