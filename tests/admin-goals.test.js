import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultGoals, validateGoals, METRICS, metricPresentation } from '../js/domain/admin.js';
import { loadGoals, saveGoals } from '../js/data/admin-goals.js';

test('saved targets drive status, preserve fixed measures, and defaults are independent', () => {
  const goals = defaultGoals();
  goals.objectives[0] = '  Grow adoption  ';
  goals.metrics[0].title = 'Reach more drivers';
  goals.metrics[0].target = 50;
  const saved = validateGoals(goals);
  assert.equal(saved.objectives[0], 'Grow adoption');
  assert.equal(metricPresentation({ ...METRICS[0], ...saved.metrics[0] }, 25).kind, 'pending');
  assert.equal(defaultGoals().metrics[0].target, 25);
  for (const mutate of [
    g => g.metrics[0].target = 2.5,
    g => g.metrics[0].target = -1,
    g => g.metrics[0].target = Infinity,
    g => g.metrics[0].target = '',
    g => g.metrics[0].target = 1000000001,
    g => g.metrics[2].target = 0,
    g => g.metrics[1].key = 'arbitrary_measure',
    g => g.metrics.pop(),
    g => g.objectives.pop(),
    g => g.metrics[1].title = ' ',
    g => g.objectives[0] = 'a'.repeat(161),
  ]) {
    const invalid = defaultGoals(); mutate(invalid);
    assert.throws(() => validateGoals(invalid));
  }
  goals.metrics[0].target = 0;
  assert.equal(validateGoals(goals).metrics[0].target, 0);
});

test('goals load/save uses server revisions and propagates conflicts and denied access', async () => {
  const goals = defaultGoals(), calls = [];
  const client = { rpc: async (...args) => { calls.push(args); return { data: { goals, revision: 3 }, error: null }; } };
  assert.deepEqual(await loadGoals(client), { goals, revision: 3 });
  await saveGoals(client, goals, 2);
  assert.deepEqual(calls[1], ['save_admin_okr_goals', { goals, expected_revision: 2 }]);
  for (const code of ['40001', '42501']) {
    const error = { code };
    const denied = { rpc: async () => ({ data: null, error }) };
    await assert.rejects(saveGoals(denied, goals, 2), e => e === error);
    await assert.rejects(loadGoals(denied), e => e === error);
  }
});
