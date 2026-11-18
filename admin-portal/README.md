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
4. `node index.js`, then open http://localhost:3000/portal

## Database setup (one time)

Open Supabase > SQL Editor, paste `db/setup.sql`, and run it.

## Deploy on Vercel

The admin site shares the parking app's Vercel project and lives at **/portal**
(for example https://provo-parking.vercel.app/portal). Nothing about the parking app's pages changes.

- `vercel.json` (repo root) installs this folder's packages and sends every `/portal` request to `api/portal.js`.
- `api/portal.js` loads the Express app from this folder.
- Sessions are saved in the `portal.session` table, because Vercel doesn't keep memory between requests.

One-time setup in the existing Vercel project (Settings > Environment Variables), using Supabase > Connect > **Transaction pooler**:
`DB_HOST`, `DB_PORT` (`6543`), `DB_NAME` (`postgres`), `DB_USER` (`postgres.rikekjksneoymybnehpo`),
`DB_PASSWORD`, `DB_SSL` (`true`), and a long random `SESSION_SECRET`. Then redeploy.

## Login for graders

- Email: `ta@provoparking.com`
- Password: `Parking403!`
