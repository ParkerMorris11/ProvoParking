// libpq URI query fields can override the apparent host and database.
// Validate before invoking psql or running any destructive fixture SQL.
export function assertDisposableTestTarget(connectionString) {
  let url;
  try { url = new URL(connectionString); } catch { throw new Error("Use a PostgreSQL URI for the disposable local test database."); }
  if (!["postgres:", "postgresql:"].includes(url.protocol)) throw new Error("Database tests require a PostgreSQL URI.");
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) throw new Error("Database tests are local-only.");
  if (url.pathname !== "/provo_parking_p7_test") throw new Error("Use the exact disposable test database name.");
  if (url.search || url.hash) throw new Error("Database test URIs must not contain query overrides or fragments.");
}

export function isolatedPostgresEnvironment(environment) {
  // PGHOSTADDR/PGSERVICE can redirect libpq even when the URI looks local.
  return Object.fromEntries(Object.entries(environment).filter(([name]) => !name.toUpperCase().startsWith("PG")));
}
