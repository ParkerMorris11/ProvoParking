// Creates the four IS 403 tables: users, permits, lots and the session store.
// These live in their own database (or schema), never in the live ProvoParking tables.

exports.up = async function (knex) {
  // App users who may sign in and maintain records. user_password holds a bcrypt hash, never plain text.
  await knex.schema.createTable("users", (t) => {
    t.increments("user_id").primary();
    t.string("user_email", 255).notNullable().unique();
    t.string("user_password", 255).notNullable();
    t.string("first_name", 60);
    t.string("last_name", 60);
    t.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
  });

  // BYU parking permit types (A, G, Y, U, ...).
  await knex.schema.createTable("permits", (t) => {
    t.increments("permit_id").primary();
    t.string("permit_code", 10).notNullable().unique();
    t.string("permit_name", 100).notNullable();
    t.text("description");
    t.string("price", 60);
  });

  // Parking lots. A lot belongs to one permit type; deleting a permit leaves its lots without one.
  await knex.schema.createTable("lots", (t) => {
    t.increments("lot_id").primary();
    t.string("lot_code", 20).notNullable().unique();
    t.string("lot_name", 100).notNullable();
    t.integer("permit_id").references("permit_id").inTable("permits").onDelete("SET NULL");
    t.decimal("latitude", 9, 6);
    t.decimal("longitude", 9, 6);
    t.integer("total_spaces");
    t.boolean("is_free").notNullable().defaultTo(false);
    t.text("notes");
  });

  // express-session store used by connect-pg-simple (its documented table layout).
  await knex.schema.createTable("session", (t) => {
    t.string("sid").primary();
    t.json("sess").notNullable();
    t.timestamp("expire", { precision: 6 }).notNullable().index("IDX_session_expire");
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists("session");
  await knex.schema.dropTableIfExists("lots");
  await knex.schema.dropTableIfExists("permits");
  await knex.schema.dropTableIfExists("users");
};
