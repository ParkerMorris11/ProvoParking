// Provo Parking — IS 403 full-stack project.
// Node + Express serve EJS pages; Knex talks to PostgreSQL; express-session keeps people signed in
// with a cookie whose session data is stored in the database (so it also works on serverless hosts).
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });
const express = require("express");
const session = require("express-session");
const PgSession = require("connect-pg-simple")(session);
const bcrypt = require("bcryptjs");
const knex = require("./db/knex");

const app = express();
const PORT = process.env.PORT || 3000;
const IS_PRODUCTION = process.env.NODE_ENV === "production";
const COOKIE_NAME = "pp403.sid";

// ---- App setup -----------------------------------------------------------------------------
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
// Hosts like Vercel and Render sit behind a proxy; trusting it lets secure cookies work over HTTPS.
app.set("trust proxy", 1);

app.use(express.urlencoded({ extended: false })); // read HTML form posts into req.body
app.use(express.static(path.join(__dirname, "public"))); // CSS and images

if (!process.env.SESSION_SECRET && IS_PRODUCTION) {
  throw new Error("SESSION_SECRET must be set in production.");
}

// Sessions: the browser only holds a signed session id cookie; the data lives in the "session" table.
app.use(
  session({
    name: COOKIE_NAME,
    store: new PgSession({
      conObject: knex.client.config.connection,
      tableName: "session",
      schemaName: process.env.DB_SCHEMA || "public",
    }),
    secret: process.env.SESSION_SECRET || "local-development-only-secret",
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: "lax", secure: IS_PRODUCTION, maxAge: 1000 * 60 * 60 * 4 }, // 4 hours
  })
);

// Every view can read who is signed in (to show or hide the Maintain buttons) and a one-time message.
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  res.locals.flash = req.session.flash || null;
  delete req.session.flash;
  next();
});

// Only signed-in users may reach the maintain pages; everyone else is sent to the login page.
function requireLogin(req, res, next) {
  if (req.session.user) return next();
  req.session.flash = { type: "error", text: "Please log in to maintain records." };
  return res.redirect("/login");
}

// Store a message to show on the next page (used after add, edit and delete).
function flash(req, type, text) {
  req.session.flash = { type, text };
}

// Turn blank form fields into null and trim the rest.
function clean(value) {
  const text = (value ?? "").toString().trim();
  return text === "" ? null : text;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ---- Landing, login and logout -----------------------------------------------------------------
app.get("/", async (req, res) => {
  // A few live counts make the landing page show real data from the database.
  const [lots, permits, users] = await Promise.all([
    knex("lots").count({ n: "*" }).first(),
    knex("permits").count({ n: "*" }).first(),
    knex("users").count({ n: "*" }).first(),
  ]);
  res.render("index", { title: "Provo Parking", counts: { lots: +lots.n, permits: +permits.n, users: +users.n } });
});

app.get("/login", (req, res) => {
  if (req.session.user) return res.redirect("/");
  res.render("login", { title: "Log in", email: "", error: null });
});

app.post("/login", async (req, res) => {
  const email = (clean(req.body.user_email) || "").toLowerCase();
  const password = req.body.user_password || "";
  const found = email ? await knex("users").where({ user_email: email }).first() : null;
  // bcrypt.compare checks the typed password against the stored hash.
  const ok = found && (await bcrypt.compare(password, found.user_password));
  if (!ok) {
    return res.status(401).render("login", { title: "Log in", email, error: "That email and password don't match." });
  }
  // A fresh session id on login prevents session fixation.
  req.session.regenerate((err) => {
    if (err) return res.status(500).send("Could not start a session.");
    req.session.user = { user_id: found.user_id, user_email: found.user_email, first_name: found.first_name };
    flash(req, "success", `Welcome, ${found.first_name || found.user_email}.`);
    req.session.save(() => res.redirect("/"));
  });
});

// Logout removes the session from the database and clears the cookie, which hides the Maintain buttons.
app.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie(COOKIE_NAME, { httpOnly: true, sameSite: "lax", secure: IS_PRODUCTION });
    res.redirect("/");
  });
});

// ---- Maintain Users ------------------------------------------------------------------------------
app.get("/users", requireLogin, async (req, res) => {
  const users = await knex("users").select("user_id", "user_email", "first_name", "last_name", "created_at").orderBy("user_id");
  res.render("users/index", { title: "Maintain Users", users });
});

app.get("/users/add", requireLogin, (req, res) => {
  res.render("users/form", { title: "Add user", record: {}, action: "/users/add", error: null, isEdit: false });
});

app.post("/users/add", requireLogin, async (req, res) => {
  const record = { user_email: (clean(req.body.user_email) || "").toLowerCase(), first_name: clean(req.body.first_name), last_name: clean(req.body.last_name) };
  const password = req.body.user_password || "";
  const error = !EMAIL_PATTERN.test(record.user_email) ? "Enter a valid email." : password.length < 8 ? "Password must be at least 8 characters." : null;
  if (error) return res.status(400).render("users/form", { title: "Add user", record, action: "/users/add", error, isEdit: false });
  try {
    await knex("users").insert({ ...record, user_password: await bcrypt.hash(password, 10) });
  } catch (e) {
    if (e.code === "23505") return res.status(400).render("users/form", { title: "Add user", record, action: "/users/add", error: "That email is already in use.", isEdit: false });
    throw e;
  }
  flash(req, "success", `Added ${record.user_email}.`);
  res.redirect("/users");
});

app.get("/users/edit/:id", requireLogin, async (req, res) => {
  const record = await knex("users").select("user_id", "user_email", "first_name", "last_name").where({ user_id: req.params.id }).first();
  if (!record) return res.status(404).render("not-found", { title: "Not found" });
  res.render("users/form", { title: "Edit user", record, action: `/users/edit/${record.user_id}`, error: null, isEdit: true });
});

app.post("/users/edit/:id", requireLogin, async (req, res) => {
  const id = Number(req.params.id);
  const record = { user_id: id, user_email: (clean(req.body.user_email) || "").toLowerCase(), first_name: clean(req.body.first_name), last_name: clean(req.body.last_name) };
  const password = req.body.user_password || ""; // blank keeps the current password
  const error = !EMAIL_PATTERN.test(record.user_email) ? "Enter a valid email." : password && password.length < 8 ? "Password must be at least 8 characters." : null;
  const render = (msg) => res.status(400).render("users/form", { title: "Edit user", record, action: `/users/edit/${id}`, error: msg, isEdit: true });
  if (error) return render(error);
  const changes = { user_email: record.user_email, first_name: record.first_name, last_name: record.last_name };
  if (password) changes.user_password = await bcrypt.hash(password, 10);
  try {
    await knex("users").where({ user_id: id }).update(changes);
  } catch (e) {
    if (e.code === "23505") return render("That email is already in use.");
    throw e;
  }
  if (req.session.user.user_id === id) req.session.user.user_email = record.user_email; // keep the header current
  flash(req, "success", `Saved ${record.user_email}.`);
  res.redirect("/users");
});

app.post("/users/delete/:id", requireLogin, async (req, res) => {
  const id = Number(req.params.id);
  // Deleting yourself would lock you out mid-session, so it is not allowed.
  if (req.session.user.user_id === id) {
    flash(req, "error", "You can't delete the account you're logged in with.");
    return res.redirect("/users");
  }
  await knex("users").where({ user_id: id }).del();
  flash(req, "success", "User deleted.");
  res.redirect("/users");
});

// ---- Maintain Lots (records) ---------------------------------------------------------------------
// Read the lot form into a row, checking the few fields that must be valid.
function lotFromForm(body) {
  const row = {
    lot_code: (clean(body.lot_code) || "").toUpperCase(),
    lot_name: clean(body.lot_name),
    permit_id: clean(body.permit_id) ? Number(body.permit_id) : null,
    latitude: clean(body.latitude),
    longitude: clean(body.longitude),
    total_spaces: clean(body.total_spaces),
    is_free: body.is_free === "on",
    notes: clean(body.notes),
  };
  let error = null;
  if (!row.lot_code || !row.lot_name) error = "Lot code and lot name are required.";
  else if (row.latitude !== null && !(Math.abs(Number(row.latitude)) <= 90)) error = "Latitude must be a number between -90 and 90.";
  else if (row.longitude !== null && !(Math.abs(Number(row.longitude)) <= 180)) error = "Longitude must be a number between -180 and 180.";
  else if (row.total_spaces !== null && !(Number.isInteger(Number(row.total_spaces)) && Number(row.total_spaces) >= 0)) error = "Total spaces must be a whole number.";
  return { row, error };
}

app.get("/lots", requireLogin, async (req, res) => {
  const search = clean(req.query.q);
  const query = knex("lots").leftJoin("permits", "lots.permit_id", "permits.permit_id").select("lots.*", "permits.permit_code").orderBy("lots.lot_id");
  if (search) query.whereILike("lots.lot_code", `%${search}%`).orWhereILike("lots.lot_name", `%${search}%`);
  res.render("lots/index", { title: "Maintain Lots", lots: await query, search: search || "" });
});

app.get("/lots/add", requireLogin, async (req, res) => {
  res.render("lots/form", { title: "Add lot", record: { is_free: true }, permits: await knex("permits").orderBy("permit_code"), action: "/lots/add", error: null });
});

app.post("/lots/add", requireLogin, async (req, res) => {
  const { row, error } = lotFromForm(req.body);
  const render = async (msg) => res.status(400).render("lots/form", { title: "Add lot", record: row, permits: await knex("permits").orderBy("permit_code"), action: "/lots/add", error: msg });
  if (error) return render(error);
  try {
    await knex("lots").insert(row);
  } catch (e) {
    if (e.code === "23505") return render(`Lot ${row.lot_code} already exists.`);
    throw e;
  }
  flash(req, "success", `Added lot ${row.lot_code}.`);
  res.redirect("/lots");
});

app.get("/lots/edit/:id", requireLogin, async (req, res) => {
  const record = await knex("lots").where({ lot_id: req.params.id }).first();
  if (!record) return res.status(404).render("not-found", { title: "Not found" });
  res.render("lots/form", { title: `Edit lot ${record.lot_code}`, record, permits: await knex("permits").orderBy("permit_code"), action: `/lots/edit/${record.lot_id}`, error: null });
});

app.post("/lots/edit/:id", requireLogin, async (req, res) => {
  const id = Number(req.params.id);
  const { row, error } = lotFromForm(req.body);
  const render = async (msg) => res.status(400).render("lots/form", { title: "Edit lot", record: { ...row, lot_id: id }, permits: await knex("permits").orderBy("permit_code"), action: `/lots/edit/${id}`, error: msg });
  if (error) return render(error);
  try {
    await knex("lots").where({ lot_id: id }).update(row);
  } catch (e) {
    if (e.code === "23505") return render(`Lot ${row.lot_code} already exists.`);
    throw e;
  }
  flash(req, "success", `Saved lot ${row.lot_code}.`);
  res.redirect("/lots");
});

app.post("/lots/delete/:id", requireLogin, async (req, res) => {
  await knex("lots").where({ lot_id: req.params.id }).del();
  flash(req, "success", "Lot deleted.");
  res.redirect("/lots");
});

// ---- Maintain Permits (records) ------------------------------------------------------------------
function permitFromForm(body) {
  const row = { permit_code: (clean(body.permit_code) || "").toUpperCase(), permit_name: clean(body.permit_name), description: clean(body.description), price: clean(body.price) };
  return { row, error: !row.permit_code || !row.permit_name ? "Permit code and name are required." : null };
}

app.get("/permits", requireLogin, async (req, res) => {
  // Show how many lots use each permit so people know what a delete affects.
  const permits = await knex("permits")
    .leftJoin("lots", "permits.permit_id", "lots.permit_id")
    .select("permits.*")
    .count({ lot_count: "lots.lot_id" })
    .groupBy("permits.permit_id")
    .orderBy("permits.permit_code");
  res.render("permits/index", { title: "Maintain Permits", permits });
});

app.get("/permits/add", requireLogin, (req, res) => {
  res.render("permits/form", { title: "Add permit", record: {}, action: "/permits/add", error: null });
});

app.post("/permits/add", requireLogin, async (req, res) => {
  const { row, error } = permitFromForm(req.body);
  const render = (msg) => res.status(400).render("permits/form", { title: "Add permit", record: row, action: "/permits/add", error: msg });
  if (error) return render(error);
  try {
    await knex("permits").insert(row);
  } catch (e) {
    if (e.code === "23505") return render(`Permit ${row.permit_code} already exists.`);
    throw e;
  }
  flash(req, "success", `Added permit ${row.permit_code}.`);
  res.redirect("/permits");
});

app.get("/permits/edit/:id", requireLogin, async (req, res) => {
  const record = await knex("permits").where({ permit_id: req.params.id }).first();
  if (!record) return res.status(404).render("not-found", { title: "Not found" });
  res.render("permits/form", { title: `Edit permit ${record.permit_code}`, record, action: `/permits/edit/${record.permit_id}`, error: null });
});

app.post("/permits/edit/:id", requireLogin, async (req, res) => {
  const id = Number(req.params.id);
  const { row, error } = permitFromForm(req.body);
  const render = (msg) => res.status(400).render("permits/form", { title: "Edit permit", record: { ...row, permit_id: id }, action: `/permits/edit/${id}`, error: msg });
  if (error) return render(error);
  try {
    await knex("permits").where({ permit_id: id }).update(row);
  } catch (e) {
    if (e.code === "23505") return render(`Permit ${row.permit_code} already exists.`);
    throw e;
  }
  flash(req, "success", `Saved permit ${row.permit_code}.`);
  res.redirect("/permits");
});

app.post("/permits/delete/:id", requireLogin, async (req, res) => {
  // Lots that used this permit keep existing with no permit (ON DELETE SET NULL).
  await knex("permits").where({ permit_id: req.params.id }).del();
  flash(req, "success", "Permit deleted. Its lots now show no permit.");
  res.redirect("/permits");
});

// ---- Errors ----------------------------------------------------------------------------------------
app.use((req, res) => res.status(404).render("not-found", { title: "Not found" }));

// Express 5 passes errors from async routes here; log them and show a plain message.
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).render("error", { title: "Something went wrong" });
});

// Run a normal server locally (npm start); serverless hosts import the app instead.
if (require.main === module) {
  app.listen(PORT, () => console.log(`Provo Parking IS 403 running at http://localhost:${PORT}`));
}

module.exports = app;
