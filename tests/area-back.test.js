import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('details back link returns to the tab the lot was opened from', async () => {
  const { backTarget } = await import('../js/router.js');
  assert.deepEqual(backTarget('favorites'), { href: '#favorites', label: 'Back to favorites' });
  assert.deepEqual(backTarget('areas'), { href: '#areas', label: 'Back to areas' });
  assert.deepEqual(backTarget('lots'), { href: '#lots', label: 'Back to all lots' });
});

test('a direct link or any other screen falls back to Areas', async () => {
  const { backTarget } = await import('../js/router.js');
  for (const from of [null, undefined, 'find', 'help', 'area', 'nonsense']) {
    assert.deepEqual(backTarget(from), { href: '#areas', label: 'Back to areas' });
  }
});

test('the back link starts as Back to areas in the page markup', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /<a href="#areas" class="back" id="area-back">← Back to areas<\/a>/);
});
