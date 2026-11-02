import test from "node:test";
import assert from "node:assert/strict";
import { assertDisposableTestTarget, isolatedPostgresEnvironment } from "./helpers/database-target.js";

test("disposable database target accepts explicit local PostgreSQL URIs", () => {
  for (const host of ["localhost", "127.0.0.1", "[::1]"]) {
    assert.doesNotThrow(() => assertDisposableTestTarget(`postgresql://postgres@${host}:55439/provo_parking_p7_test`));
  }
});
test("destructive fixtures reject remote and non-disposable targets", () => {
  for (const uri of ["postgresql://remote.example/provo_parking_p7_test", "postgresql://localhost/postgres", "https://localhost/provo_parking_p7_test", "not a connection URI"]) {
    assert.throws(() => assertDisposableTestTarget(uri));
  }
});
test("libpq host, hostaddr, dbname and service overrides are rejected before connection", () => {
  const base = "postgresql://postgres@127.0.0.1/provo_parking_p7_test";
  for (const suffix of ["?host=remote.example", "?hostaddr=192.0.2.1", "?dbname=postgres", "?service=production", "?host=%2Ftmp%2Fsocket", "#fragment"]) {
    assert.throws(() => assertDisposableTestTarget(base + suffix), /overrides or fragments/);
  }
});
test("disposable fixtures do not inherit libpq connection overrides", () => {
  const clean = isolatedPostgresEnvironment({ PATH: '/bin', P7_PSQL: '/bin/psql', PGHOSTADDR: '192.0.2.1', PGSERVICE: 'production', PGDATABASE: 'postgres', PGOPTIONS: '-c role=other' });
  assert.deepEqual(clean, { PATH: '/bin', P7_PSQL: '/bin/psql' });
});
