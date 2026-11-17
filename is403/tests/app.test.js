// End-to-end tests for the IS 403 site: run against a disposable local Postgres.
// Set TEST_DATABASE_URL (never a hosted database); the tests rebuild the tables each run.
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");

const url = process.env.TEST_DATABASE_URL;
if (!url || !/@(localhost|127\.0\.0\.1)[:/]/.test(url)) {
  test("database tests", { skip: "set TEST_DATABASE_URL to a local Postgres" }, () => {});
  return;
}
process.env.DATABASE_URL = url;
process.env.DATABASE_SSL = "false";
process.env.SEED_ADMIN_EMAIL = "ta@test.local";
process.env.SEED_ADMIN_PASSWORD = "test-password-123";

const request = require("supertest");
const knex = require("../db/knex");
const app = require("../index");

before(async () => {
  await knex.migrate.rollback(undefined, true);
  await knex.migrate.latest();
  await knex.seed.run();
});
after(() => knex.destroy());

// Log in and return the agent, which keeps the session cookie like a browser.
async function loggedIn() {
  const agent = request.agent(app);
  const res = await agent.post("/login").type("form").send({ user_email: "ta@test.local", user_password: "test-password-123" });
  assert.equal(res.status, 302);
  return agent;
}

test("landing page has an image and no maintain buttons when logged out", async () => {
  const res = await request(app).get("/");
  assert.equal(res.status, 200);
  assert.match(res.text, /<img[^>]+app-desktop\.jpg/);
  assert.doesNotMatch(res.text, /Maintain Users|Maintain Records/);
  assert.match(res.text, /73<\/strong> lots/);
});

test("maintain pages require login", async () => {
  for (const path of ["/users", "/lots", "/permits", "/lots/add"]) {
    const res = await request(app).get(path);
    assert.equal(res.status, 302, path);
    assert.equal(res.headers.location, "/login");
  }
});

test("wrong password is rejected and passwords are stored hashed", async () => {
  const res = await request(app).post("/login").type("form").send({ user_email: "ta@test.local", user_password: "nope-nope" });
  assert.equal(res.status, 401);
  const row = await knex("users").where({ user_email: "ta@test.local" }).first();
  assert.match(row.user_password, /^\$2[aby]\$10\$/);
});

test("login sets an httpOnly session cookie and shows the maintain buttons", async () => {
  const agent = request.agent(app);
  const res = await agent.post("/login").type("form").send({ user_email: "TA@test.local ", user_password: "test-password-123" });
  assert.match(res.headers["set-cookie"].join(";"), /pp403\.sid=.*HttpOnly/i);
  const home = await agent.get("/");
  assert.match(home.text, /Maintain Users/);
  assert.match(home.text, /Maintain Records/);
  assert.match(home.text, /Maintain Permits/);
});

test("lots: create, read, update, delete", async () => {
  const agent = await loggedIn();
  const y = await knex("permits").where({ permit_code: "Y" }).first();
  let res = await agent.post("/lots/add").type("form").send({ lot_code: "99z", lot_name: "Test Lot", permit_id: y.permit_id, latitude: "40.25", longitude: "-111.65", total_spaces: "12", is_free: "on" });
  assert.equal(res.status, 302);
  const lot = await knex("lots").where({ lot_code: "99Z" }).first();
  assert.equal(lot.total_spaces, 12);
  res = await agent.get("/lots?q=99Z");
  assert.match(res.text, /Test Lot/);
  res = await agent.post("/lots/add").type("form").send({ lot_code: "99Z", lot_name: "Dupe" });
  assert.equal(res.status, 400);
  assert.match(res.text, /already exists/);
  await agent.post(`/lots/edit/${lot.lot_id}`).type("form").send({ lot_code: "99Z", lot_name: "Renamed Lot", permit_id: "", total_spaces: "" });
  const edited = await knex("lots").where({ lot_id: lot.lot_id }).first();
  assert.equal(edited.lot_name, "Renamed Lot");
  assert.equal(edited.permit_id, null);
  assert.equal(edited.is_free, false);
  await agent.post(`/lots/delete/${lot.lot_id}`);
  assert.equal(await knex("lots").where({ lot_id: lot.lot_id }).first(), undefined);
});

test("users: create, read, update, delete; cannot delete yourself", async () => {
  const agent = await loggedIn();
  await agent.post("/users/add").type("form").send({ user_email: "new@test.local", user_password: "another-pass-1", first_name: "New" });
  const u = await knex("users").where({ user_email: "new@test.local" }).first();
  assert.ok(u);
  assert.doesNotMatch((await agent.get("/users")).text, /\$2[aby]\$/); // hashes never shown
  await agent.post(`/users/edit/${u.user_id}`).type("form").send({ user_email: "new@test.local", user_password: "", first_name: "Renamed" });
  const after = await knex("users").where({ user_id: u.user_id }).first();
  assert.equal(after.first_name, "Renamed");
  assert.equal(after.user_password, u.user_password); // blank password kept the old one
  await agent.post(`/users/delete/${u.user_id}`);
  assert.equal(await knex("users").where({ user_id: u.user_id }).first(), undefined);
  const me = await knex("users").where({ user_email: "ta@test.local" }).first();
  await agent.post(`/users/delete/${me.user_id}`);
  assert.ok(await knex("users").where({ user_id: me.user_id }).first());
});

test("permits: create, read, update, delete leaves lots without a permit", async () => {
  const agent = await loggedIn();
  await agent.post("/permits/add").type("form").send({ permit_code: "zz", permit_name: "Test permit" });
  const p = await knex("permits").where({ permit_code: "ZZ" }).first();
  const [lot] = await knex("lots").insert({ lot_code: "98ZZ", lot_name: "ZZ lot", permit_id: p.permit_id }).returning("*");
  assert.match((await agent.get("/permits")).text, /Test permit/);
  await agent.post(`/permits/edit/${p.permit_id}`).type("form").send({ permit_code: "ZZ", permit_name: "Edited permit", price: "$1" });
  assert.equal((await knex("permits").where({ permit_id: p.permit_id }).first()).price, "$1");
  await agent.post(`/permits/delete/${p.permit_id}`);
  assert.equal((await knex("lots").where({ lot_id: lot.lot_id }).first()).permit_id, null);
  await knex("lots").where({ lot_id: lot.lot_id }).del();
});

test("logout destroys the session, clears the cookie and hides the buttons", async () => {
  const agent = await loggedIn();
  const before = await knex("session").count({ n: "*" }).first();
  const res = await agent.post("/logout");
  assert.equal(res.status, 302);
  assert.match(res.headers["set-cookie"].join(";"), /pp403\.sid=;.*Expires=Thu, 01 Jan 1970/i);
  const afterCount = await knex("session").count({ n: "*" }).first();
  assert.equal(+afterCount.n, +before.n - 1);
  assert.doesNotMatch((await agent.get("/")).text, /Maintain Users/);
  assert.equal((await agent.get("/users")).status, 302);
});
