import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { assertDisposableTestTarget, isolatedPostgresEnvironment } from './helpers/database-target.js';
import { PRODUCTION_BASE, ADMIN_MIGRATION } from './helpers/migration-order.js';

const database = process.env.P7_TEST_DATABASE_URL;
const file = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
test('admin OKR migration: real aggregates, RLS, timestamp protection, revocation and empty state', { skip: !database && 'Set the disposable local test database URL.' }, () => {
  assertDisposableTestTarget(database);
  const run = sql => {
    const result = spawnSync(process.env.P7_PSQL || 'psql', ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-d', database], { input: sql, encoding: 'utf8', env: isolatedPostgresEnvironment(process.env) });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(result.stderr);
  };
  run(file('tests/fixtures/admin-okr-bootstrap.sql'));
  // Production order (see docs/admin-okr.md): visit_metrics is already live before admin tracking.
  for (const path of PRODUCTION_BASE) run(file(path));
  const migration = file(ADMIN_MIGRATION);
  run(migration); run(migration);
  run(file('tests/fixtures/admin-okr-assertions.sql'));
});
