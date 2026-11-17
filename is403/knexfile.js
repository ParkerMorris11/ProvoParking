// Knex settings. Every environment reads the same DATABASE_URL, so the app,
// migrations and seeds always point at one database.
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const schema = process.env.DB_SCHEMA || "public";

const shared = {
  client: "pg",
  connection: {
    connectionString: process.env.DATABASE_URL,
    // Hosted Postgres (Supabase, Neon, RDS) needs SSL; a local database does not.
    ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : false,
  },
  searchPath: [schema],
  pool: { min: 0, max: 5 },
  migrations: { directory: "./db/migrations", tableName: "knex_migrations", schemaName: schema },
  seeds: { directory: "./db/seeds" },
};

module.exports = { development: shared, test: shared, production: shared };
