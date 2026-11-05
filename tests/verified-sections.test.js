import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('section manifest preserves distinct GIS features and excludes ambiguous categories', () => {
  const sections = JSON.parse(readFileSync(new URL('../data/verified-byu-sections.json', import.meta.url)));
  assert.ok(sections.length > 50);
  assert.equal(new Set(sections.map(s => s.global_id)).size, sections.length);
  for (const id of [123,186,3,11]) assert.ok(sections.some(s => s.object_id === id), String(id));
  assert.notEqual(sections.find(s=>s.object_id===3).end,sections.find(s=>s.object_id===11).end);
  for (const id of [7,74,121,122,124,173,174]) assert.ok(!sections.some(s=>s.object_id===id),String(id));
  for (const s of sections) assert.ok(['A','G','Y','U'].includes(s.permit_type));
});
