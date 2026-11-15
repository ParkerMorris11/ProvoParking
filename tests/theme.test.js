import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const script = await readFile(new URL('../js/theme.js', import.meta.url), 'utf8');
function runTheme(saved, systemDark = false) {
  const attrs = new Map(), events = {}, storage = new Map(saved ? [['pp-theme', saved]] : []);
  const root = { setAttribute: (k, v) => attrs.set(k, v), removeAttribute: k => attrs.delete(k) };
  const document = { documentElement: root, querySelectorAll: () => [], addEventListener: (name, fn) => { events[name] = fn; } };
  vm.runInNewContext(script, { document, window: { matchMedia: () => ({ matches: systemDark, addEventListener() {} }) }, localStorage: { getItem: k => storage.get(k), setItem: (k, v) => storage.set(k, v) } });
  return { attrs, storage, click: () => events.click({ target: { closest: () => ({}) } }) };
}

test('a new device starts dark even when the system prefers light', () => {
  assert.equal(runTheme(null).attrs.get('data-theme-active'), 'dark');
});
test('saved light and dark choices override the default and survive toggling', () => {
  for (const saved of ['light', 'dark']) {
    const theme = runTheme(saved, true);
    assert.equal(theme.attrs.get('data-theme-active'), saved);
    theme.click();
    const next = saved === 'light' ? 'dark' : 'light';
    assert.equal(theme.attrs.get('data-theme-active'), next);
    assert.equal(theme.storage.get('pp-theme'), next);
  }
});
