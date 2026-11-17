// Creates the first admin (the TA login) from environment variables, so no password is ever committed.
// Running it again updates that account's password instead of adding a duplicate.
const bcrypt = require("bcryptjs");

exports.seed = async function (knex) {
  const email = (process.env.SEED_ADMIN_EMAIL || "").trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD || "";
  if (!email || password.length < 8) {
    console.log("Skipping admin user: set SEED_ADMIN_EMAIL and an 8+ character SEED_ADMIN_PASSWORD.");
    return;
  }
  const hash = await bcrypt.hash(password, 10);
  await knex("users")
    .insert({ user_email: email, user_password: hash, first_name: "Teaching", last_name: "Assistant" })
    .onConflict("user_email")
    .merge({ user_password: hash });
};
