import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');

test('app loads Bootstrap 5 from CDN', () => {
  assert.match(html, /cdn\.jsdelivr\.net\/npm\/bootstrap@5\.3/);
  assert.match(html, /sha384-QWTKZyjpPEjISv5WaRU9OFeRpok6YctnYmDr5pNlyT2bRjXh0JMhjY6hW\+ALEwIH/);
});

test('Areas HTML lists matching lots before the nearby panel', () => {
  const lots = html.indexOf('id="area-list"');
  const nearby = html.indexOf('id="nearby-list"');
  assert.ok(lots > 0 && nearby > 0);
  assert.ok(lots < nearby, 'lot cards must appear before nearby in the DOM so keyboard and layout both start with results');
});

test('mobile pane toggle markup exists and defaults to lots', () => {
  assert.match(html, /id="areas-pane-toggle"/);
  assert.match(html, /data-areas-pane="list"/);
  assert.match(html, /aria-pressed="true"[^>]*>Lots|Lots[\s\S]*aria-pressed="true"/);
});

test('Find asks where you can park and keeps destination optional', () => {
  assert.match(html, /Where can you park\?/);
  assert.match(html, /not a guarantee/i);
  assert.match(html, /id="find-destination"/);
  assert.match(html, /Destination \(optional\)/);
});

test('Help keeps Y valid in Y and U and downtown unverified copy', () => {
  assert.match(html, /id="help-permits"/);
  assert.match(html, /<th scope="row">Y<\/th>[\s\S]*Y, U/);
  assert.match(html, /city records|not verified/i);
});

test('guest My car copy tells people to create an account before a timer', () => {
  assert.match(html, /id="car-guest"/);
  assert.match(html, /Create a free account to start a timer/);
});
