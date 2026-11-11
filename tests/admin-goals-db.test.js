import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { assertDisposableTestTarget, isolatedPostgresEnvironment } from './helpers/database-target.js';
const database = process.env.P7_TEST_DATABASE_URL;
const file = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
test('shared goals persist, reject invalid targets and conflicts, and require current admin access', { skip: !database && 'Set the disposable local test database URL.' }, () => {
  assertDisposableTestTarget(database);
  const migration = file('supabase/migrations/20261111213837_admin_okr_goals.sql');
  const sql = file('tests/fixtures/admin-okr-bootstrap.sql') +
    'CREATE SCHEMA parking_private; GRANT USAGE ON SCHEMA parking_private TO authenticated; CREATE TABLE parking_private.admin_account(auth_id uuid PRIMARY KEY);' +
    migration + migration + file('tests/fixtures/admin-goals-assertions.sql');
  const result = spawnSync(process.env.P7_PSQL || 'psql', ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-d', database], { input: sql, encoding: 'utf8', env: isolatedPostgresEnvironment(process.env) });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr);
});
