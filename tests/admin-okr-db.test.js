import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { assertDisposableTestTarget, isolatedPostgresEnvironment } from './helpers/database-target.js';

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
  for (const path of ['supabase/schema.sql', 'supabase/policies.sql', 'supabase/migrations/20261029143325_enable_parking_reference_reads.sql', 'supabase/migrations/20261102040636_account_sign_in.sql', 'supabase/migrations/20261104155225_verified_byu_lots.sql']) run(file(path));
  const migration = file('supabase/migrations/20261105000109_admin_okr_tracking.sql');
  run(migration); run(migration);
  run(file('tests/fixtures/admin-okr-assertions.sql'));
});
