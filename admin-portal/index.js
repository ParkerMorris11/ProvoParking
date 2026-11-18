// Provo Parking admin site (IS 403 group project, built on our IS 401 sprint project)
// Team 7: Parker Morris, Spencer, Liam, James Richardson
//
// What this file does:
//   - Shows a public landing page with a login form.
//   - Logs a user in with user_email and user_password (stored in the session).
//   - After login, shows "Maintain" buttons for Users, Lots, and Permits.
//   - Lets a logged-in user add, display, edit, and delete records in each table.
//   - Logs out by destroying the session and removing the cookie.
//
// Run it locally with:  node index.js   (then open http://localhost:3000/portal)

// Load settings from the .env file (database password, session secret) when running locally.
// On the hosting site these come from its environment variables instead.
require("dotenv").config();

// Libraries we installed with npm install
const express = require("express");
const session = require("express-session");
// Saves sessions in our Postgres database instead of server memory.
// Vercel runs the site as short-lived functions, so memory would forget who is logged in.
const PgSession = require("connect-pg-simple")(session);
const path = require("path");

const app = express();

// Database connection settings, read from environment variables (.env locally, Vercel settings online).
const dbSettings = {
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD || "admin",
  database: process.env.DB_NAME || "postgres",
  port: process.env.DB_PORT || 5432,
  // Supabase requires an encrypted (SSL) connection; a local Postgres usually doesn't.
  ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : false,
};
const port = process.env.PORT || 3000;

// Use EJS for our pages, and look for them in the "views" folder.
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Every page of the admin site lives under /portal, so it can share one website with the parking app
// (the parking app keeps "/" and its own pages). For example: /portal, /portal/users, /portal/lots.
const router = express.Router();

// Let Express serve files in "public" (images, css) at /portal/... without writing a route for each one.
app.use("/portal", express.static(path.join(__dirname, "public"), { redirect: false }));

// Lets us read form inputs with req.body (uses each input's name attribute).
app.use(express.urlencoded({ extended: true }));

// Sessions: the server remembers who is logged in; the browser only keeps a random id cookie.
// The session data is stored in the portal.session table (created automatically the first time).
app.use(
  session({
    store: new PgSession({
      conObject: dbSettings,
      schemaName: "portal",
      tableName: "session",
      createTableIfMissing: true,
    }),
    secret: process.env.SESSION_SECRET || "change-this-secret",
    resave: false, // only save the session when something changes
    saveUninitialized: false, // don't create a cookie until someone logs in
  })
);

// Connect to our Postgres database (Supabase) with Knex.
// searchPath "portal" means knex("users") reads portal.users, so the live app's tables are never touched.
const knex = require("knex")({
  client: "pg",
  connection: dbSettings,
  searchPath: ["portal"],
  pool: { min: 0, max: 3 }, // keep few connections open; Vercel may run several copies of the site
});

// Make "loggedIn" available to every EJS page so the header can show or hide the buttons.
app.use((req, res, next) => {
  res.locals.loggedIn = req.session.loggedIn || false;
  res.locals.userName = req.session.userName || "";
  next();
});

// Middleware: only let logged-in users through. Everyone else goes back to the home page.
// We put this on every maintain route, so typing a URL directly doesn't skip the login.
function requireLogin(req, res, next) {
  if (req.session.loggedIn) {
    next();
  } else {
    res.redirect("/portal");
  }
}

// ---------------------------------------------------------------
// Home page, login, logout
// ---------------------------------------------------------------

// Landing page. Shows the login form, or the maintain buttons if logged in.
router.get("/", (req, res) => {
  res.render("index", { error: null });
});

// Check the email and password against the users table.
router.post("/login", (req, res) => {
  const email = req.body.user_email;
  const password = req.body.user_password;

  knex("users")
    .where({ user_email: email, user_password: password })
    .first()
    .then((user) => {
      if (user) {
        // Found a matching user: remember them in the session.
        req.session.loggedIn = true;
        req.session.userName = user.first_name;
        res.redirect("/portal");
      } else {
        res.render("index", { error: "That email and password don't match. Please try again." });
      }
    })
    .catch((err) => {
      console.log(err);
      res.render("index", { error: "We couldn't reach the database. Please try again." });
    });
});

// Log out: delete the session on the server and remove the cookie in the browser.
router.get("/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("connect.sid");
    res.redirect("/portal");
  });
});

// ---------------------------------------------------------------
// Maintain Users (portal.users)
// ---------------------------------------------------------------

// Display all users.
router.get("/users", requireLogin, (req, res) => {
  knex("users")
    .select("user_email", "first_name", "last_name") // never send passwords to the page
    .orderBy("last_name")
    .then((users) => res.render("users", { users: users }))
    .catch((err) => showError(res, err));
});

// Show the blank add-user form.
router.get("/addUser", requireLogin, (req, res) => {
  res.render("addUser");
});

// Save a new user, then go back to the list.
router.post("/addUser", requireLogin, (req, res) => {
  knex("users")
    .insert({
      user_email: req.body.user_email,
      user_password: req.body.user_password,
      first_name: req.body.first_name,
      last_name: req.body.last_name,
    })
    .then(() => res.redirect("/portal/users"))
    .catch((err) => showError(res, err));
});

// Show the edit form filled in with one user's info. The email is in the URL (req.params).
router.get("/editUser/:email", requireLogin, (req, res) => {
  knex("users")
    .where("user_email", req.params.email)
    .first()
    .then((user) => res.render("editUser", { user: user }))
    .catch((err) => showError(res, err));
});

// Save changes to a user. The email is the primary key, so it can't be changed here.
router.post("/editUser/:email", requireLogin, (req, res) => {
  const changes = {
    first_name: req.body.first_name,
    last_name: req.body.last_name,
  };
  // Only change the password if a new one was typed in.
  if (req.body.user_password) {
    changes.user_password = req.body.user_password;
  }

  knex("users")
    .where("user_email", req.params.email)
    .update(changes)
    .then(() => res.redirect("/portal/users"))
    .catch((err) => showError(res, err));
});

// Delete a user.
router.post("/deleteUser/:email", requireLogin, (req, res) => {
  knex("users")
    .where("user_email", req.params.email)
    .del()
    .then(() => res.redirect("/portal/users"))
    .catch((err) => showError(res, err));
});

// ---------------------------------------------------------------
// Maintain Lots (portal.lots)
// ---------------------------------------------------------------

// Display all parking lots.
router.get("/lots", requireLogin, (req, res) => {
  knex("lots")
    .select()
    .orderBy("lot_name")
    .then((lots) => res.render("lots", { lots: lots }))
    .catch((err) => showError(res, err));
});

// Show the blank add-lot form.
router.get("/addLot", requireLogin, (req, res) => {
  res.render("addLot");
});

// Save a new lot.
router.post("/addLot", requireLogin, (req, res) => {
  knex("lots")
    .insert(lotFromForm(req.body))
    .then(() => res.redirect("/portal/lots"))
    .catch((err) => showError(res, err));
});

// Show the edit form for one lot.
router.get("/editLot/:id", requireLogin, (req, res) => {
  knex("lots")
    .where("lot_id", req.params.id)
    .first()
    .then((lot) => res.render("editLot", { lot: lot }))
    .catch((err) => showError(res, err));
});

// Save changes to a lot.
router.post("/editLot/:id", requireLogin, (req, res) => {
  knex("lots")
    .where("lot_id", req.params.id)
    .update(lotFromForm(req.body))
    .then(() => res.redirect("/portal/lots"))
    .catch((err) => showError(res, err));
});

// Delete a lot.
router.post("/deleteLot/:id", requireLogin, (req, res) => {
  knex("lots")
    .where("lot_id", req.params.id)
    .del()
    .then(() => res.redirect("/portal/lots"))
    .catch((err) => showError(res, err));
});

// Turn the lot form's inputs into a row for the lots table.
function lotFromForm(body) {
  return {
    lot_name: body.lot_name,
    lot_code: body.lot_code || null,
    operator: body.operator,
    // An empty box means "we don't know how many spaces".
    total_spaces: body.total_spaces === "" ? null : parseInt(body.total_spaces),
    // A checkbox only sends a value when it is checked.
    is_free: body.is_free === "on",
  };
}

// ---------------------------------------------------------------
// Maintain Permits (portal.permits)
// ---------------------------------------------------------------

// Display all permits.
router.get("/permits", requireLogin, (req, res) => {
  knex("permits")
    .select()
    .orderBy("permit_code")
    .then((permits) => res.render("permits", { permits: permits }))
    .catch((err) => showError(res, err));
});

// Show the blank add-permit form.
router.get("/addPermit", requireLogin, (req, res) => {
  res.render("addPermit");
});

// Save a new permit.
router.post("/addPermit", requireLogin, (req, res) => {
  knex("permits")
    .insert({
      permit_code: req.body.permit_code,
      permit_name: req.body.permit_name,
      issuer: req.body.issuer,
      description: req.body.description,
    })
    .then(() => res.redirect("/portal/permits"))
    .catch((err) => showError(res, err));
});

// Show the edit form for one permit.
router.get("/editPermit/:id", requireLogin, (req, res) => {
  knex("permits")
    .where("permit_id", req.params.id)
    .first()
    .then((permit) => res.render("editPermit", { permit: permit }))
    .catch((err) => showError(res, err));
});

// Save changes to a permit.
router.post("/editPermit/:id", requireLogin, (req, res) => {
  knex("permits")
    .where("permit_id", req.params.id)
    .update({
      permit_code: req.body.permit_code,
      permit_name: req.body.permit_name,
      issuer: req.body.issuer,
      description: req.body.description,
    })
    .then(() => res.redirect("/portal/permits"))
    .catch((err) => showError(res, err));
});

// Delete a permit.
router.post("/deletePermit/:id", requireLogin, (req, res) => {
  knex("permits")
    .where("permit_id", req.params.id)
    .del()
    .then(() => res.redirect("/portal/permits"))
    .catch((err) => showError(res, err));
});

// ---------------------------------------------------------------
// Helpers and start-up
// ---------------------------------------------------------------

// Log a database error and show a simple message instead of crashing.
function showError(res, err) {
  console.log(err);
  res.status(500).render("error", { message: "Something went wrong saving or loading that record." });
}

// Put all the routes above under /portal.
app.use("/portal", router);

// When running on your own computer, send http://localhost:3000/ to the admin home page.
app.get("/", (req, res) => res.redirect("/portal"));

// Start the server last, after all the routes are set up.
// On Vercel, api/portal.js (in the repo root) loads the app through the export below, so we only call listen when run with "node index.js".
if (require.main === module) {
  app.listen(port, () => console.log(`Admin site running on http://localhost:${port}`));
}

module.exports = app;
