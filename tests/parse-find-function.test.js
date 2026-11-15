import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { handleRequest } from '../supabase/functions/parse-find/handler.js';
import { sanitizeParse, validateRequest, readModelJson, buildPrompt, corsHeaders, isAllowedOrigin, normalizeAudioType, denverNow, RequestError } from '../supabase/functions/parse-find/sanitize.js';

const now = { day: 2, time: '09:30' };
const ids = { permitIds: [1, 2], destinationIds: [10, 11], now };
const AUDIO = 'A'.repeat(200);
const ENV = { GEMINI_API_KEY: 'test-gemini', SUPABASE_URL: 'https://example.supabase.co', SUPABASE_ANON_KEY: 'anon' };

test('sanitizeParse keeps valid IDs and drops anything the page did not offer', () => {
  const out = sanitizeParse({ permit_id: 2, use_saved_permit: true, destination_id: 10, live: false, day: 4, time: '15:00', confidence: 0.9 }, ids);
  assert.deepEqual(out, { permit_id: 2, use_saved_permit: false, destination_id: 10, live: false, day: 4, time: '15:00', confidence: 0.9 });
  const bad = sanitizeParse({ permit_id: 77, destination_id: 'JKB', use_saved_permit: true, confidence: 'high' }, ids);
  assert.deepEqual(bad, { permit_id: null, use_saved_permit: true, destination_id: null, live: true, day: null, time: null, confidence: 0 });
});

test('sanitizeParse: a time means a planned arrival and a missing day defaults to today', () => {
  const out = sanitizeParse({ live: true, time: '15:00', confidence: 0.8 }, ids);
  assert.equal(out.live, false);
  assert.equal(out.day, 2);
  assert.equal(out.time, '15:00');
});

test('sanitizeParse: malformed times and days are rejected; a day alone lowers confidence', () => {
  assert.equal(sanitizeParse({ time: '3pm', day: 8 }, ids).live, true);
  const dayOnly = sanitizeParse({ day: 5, confidence: 0.95 }, ids);
  assert.deepEqual([dayOnly.live, dayOnly.day, dayOnly.time], [false, 5, null]);
  assert.equal(dayOnly.confidence, 0.4);
  assert.equal(sanitizeParse({ confidence: 7 }, ids).confidence, 1);
  assert.equal(sanitizeParse('nonsense', ids).live, true);
});

test('response always has exactly the contract keys', () => {
  const out = sanitizeParse({ permit_id: 1, evil: '<script>', note: 'hi' }, ids);
  assert.deepEqual(Object.keys(out), ['permit_id', 'use_saved_permit', 'destination_id', 'live', 'day', 'time', 'confidence']);
});

test('validateRequest limits size and requires text or audio', () => {
  assert.throws(() => validateRequest({ permit_ids: [], destination_ids: [] }), RequestError);
  assert.throws(() => validateRequest({ text: 'x', permit_ids: 'nope', destination_ids: [] }), /array/);
  assert.throws(() => validateRequest({ audio: { mime_type: 'video/mp4', data_base64: AUDIO }, permit_ids: [], destination_ids: [] }), /Unsupported audio/);
  assert.throws(() => validateRequest({ audio: { mime_type: 'audio/mp4', data_base64: 'not base64!' }, permit_ids: [], destination_ids: [] }), /base64/);
  const ok = validateRequest({ text: 'x'.repeat(900), permit_ids: [1, 1, -4, 'a', 2], destination_ids: [3], audio: { mime_type: 'audio/webm;codecs=opus', data_base64: AUDIO } });
  assert.equal(ok.text.length, 500);
  assert.deepEqual(ok.permit_ids, [1, 2]);
  assert.equal(ok.audio.mime_type, 'audio/webm');
  assert.equal(normalizeAudioType('Audio/MP4'), 'audio/mp4');
});

test('readModelJson reads Gemini candidates and ignores junk', () => {
  const wrap = (text) => ({ candidates: [{ content: { parts: [{ text }] } }] });
  assert.deepEqual(readModelJson(wrap('{"a":1}')), { a: 1 });
  assert.deepEqual(readModelJson(wrap('```json\n{"a":1}\n```')), { a: 1 });
  assert.equal(readModelJson(wrap('not json')), null);
  assert.equal(readModelJson(wrap('[1]')), null);
  assert.equal(readModelJson({}), null);
});

test('prompt lists only the allowed IDs and tells the model today in Provo', () => {
  const prompt = buildPrompt({ text: 'class at 3', permits: [{ id: 1, label: 'Y - Undergraduate' }], destinations: [{ id: 10, label: 'Jesse Knight Building (JKB)' }], now });
  assert.match(prompt, /- 1: Y - Undergraduate/);
  assert.match(prompt, /- 10: Jesse Knight Building \(JKB\)/);
  assert.match(prompt, /Tuesday/);
  assert.match(prompt, /class at 3/);
  assert.equal(denverNow(new Date('2026-11-11T17:00:00Z')).time, '10:00');
});

test('CORS allows GitHub Pages and localhost only', () => {
  assert.equal(isAllowedOrigin('https://parkermorris11.github.io'), true);
  assert.equal(isAllowedOrigin('http://localhost:8000'), true);
  assert.equal(isAllowedOrigin('http://127.0.0.1:3000'), true);
  assert.equal(isAllowedOrigin('https://evil.example'), false);
  assert.equal(isAllowedOrigin('https://localhost:8000'), false);
  assert.equal(isAllowedOrigin('https://other.example', ['https://other.example']), true);
  assert.equal(corsHeaders('https://evil.example')['Access-Control-Allow-Origin'], undefined);
  assert.equal(corsHeaders('http://localhost:8000')['Access-Control-Allow-Origin'], 'http://localhost:8000');
});

function fakeFetch({ gemini, labels = true } = {}) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url: String(url), init });
    if (String(url).includes('generativelanguage.googleapis.com')) return gemini instanceof Error ? Promise.reject(gemini) : gemini ?? new Response('{}', { status: 500 });
    if (String(url).includes('/rest/v1/permit')) return labels ? Response.json([{ permit_id: 1, permit_code: 'Y', permit_name: 'Undergraduate' }]) : new Response('no', { status: 500 });
    if (String(url).includes('/rest/v1/destination')) return labels ? Response.json([{ destination_id: 10, building_code: 'JKB', name: 'Jesse Knight Building' }]) : new Response('no', { status: 500 });
    throw new Error(`unexpected ${url}`);
  };
  return { impl, calls };
}
const geminiSays = (obj) => Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] });
const post = (body, headers = {}) => new Request('https://x.supabase.co/functions/v1/parse-find', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:8000', ...headers }, body: JSON.stringify(body) });

test('happy path: text in, strict JSON out, model called with the secret and a schema', async () => {
  const { impl, calls } = fakeFetch({ gemini: geminiSays({ permit_id: null, use_saved_permit: true, destination_id: 10, live: false, day: 2, time: '15:00', confidence: 0.92 }) });
  const res = await handleRequest(post({ text: 'class at 3 pm at the JKB with my current permit', permit_ids: [1], destination_ids: [10] }), { env: ENV, fetchImpl: impl, now: new Date('2026-11-10T16:00:00Z') });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), 'http://localhost:8000');
  assert.deepEqual(await res.json(), { permit_id: null, use_saved_permit: true, destination_id: 10, live: false, day: 2, time: '15:00', confidence: 0.92 });
  const call = calls.find((c) => c.url.includes('generativelanguage'));
  assert.equal(call.init.headers['x-goog-api-key'], 'test-gemini');
  assert.doesNotMatch(call.url, /test-gemini/, 'key never goes in the URL');
  const sent = JSON.parse(call.init.body);
  assert.equal(sent.generationConfig.responseMimeType, 'application/json');
  assert.equal(sent.generationConfig.responseSchema.type, 'OBJECT');
  assert.match(sent.contents[0].parts.at(-1).text, /Jesse Knight Building \(JKB\)/);
});

test('model answers with an ID the page never offered: it is nulled', async () => {
  const { impl } = fakeFetch({ gemini: geminiSays({ permit_id: 5, use_saved_permit: false, destination_id: 99, live: true, day: null, time: null, confidence: 0.9 }) });
  const res = await handleRequest(post({ text: 'hi', permit_ids: [1], destination_ids: [10] }), { env: ENV, fetchImpl: impl });
  const body = await res.json();
  assert.equal(body.permit_id, null);
  assert.equal(body.destination_id, null);
});

test('audio is sent to the model as inline data (iOS Safari fallback)', async () => {
  const { impl, calls } = fakeFetch({ gemini: geminiSays({ permit_id: 1, use_saved_permit: false, destination_id: null, live: true, day: null, time: null, confidence: 0.7 }) });
  const res = await handleRequest(post({ permit_ids: [1], destination_ids: [], audio: { mime_type: 'audio/mp4', data_base64: AUDIO } }), { env: ENV, fetchImpl: impl });
  assert.equal(res.status, 200);
  const parts = JSON.parse(calls.find((c) => c.url.includes('generativelanguage')).init.body).contents[0].parts;
  assert.deepEqual(parts[0].inline_data, { mime_type: 'audio/mp4', data: AUDIO });
  assert.match(parts[1].text, /attached audio/);
});

test('falls back to labels from the page when the database lookup fails', async () => {
  const { impl, calls } = fakeFetch({ labels: false, gemini: geminiSays({ permit_id: 1, use_saved_permit: false, destination_id: null, live: true, day: null, time: null, confidence: 0.7 }) });
  const res = await handleRequest(post({ text: 'Y permit', permit_ids: [1], destination_ids: [], permit_labels: [{ id: 1, label: 'Y - Undergrad' }] }), { env: ENV, fetchImpl: impl });
  assert.equal(res.status, 200);
  assert.match(JSON.parse(calls.find((c) => c.url.includes('generativelanguage')).init.body).contents[0].parts[0].text, /- 1: Y - Undergrad/);
});

test('preflight succeeds for allowed origins and a stranger gets 403', async () => {
  const ok = await handleRequest(new Request('https://x/f', { method: 'OPTIONS', headers: { Origin: 'https://parkermorris11.github.io' } }), { env: ENV });
  assert.equal(ok.status, 204);
  assert.equal(ok.headers.get('Access-Control-Allow-Origin'), 'https://parkermorris11.github.io');
  assert.match(ok.headers.get('Access-Control-Allow-Headers'), /authorization/);
  const bad = await handleRequest(post({ text: 'x', permit_ids: [], destination_ids: [] }, { Origin: 'https://evil.example' }), { env: ENV, fetchImpl: () => assert.fail('must not call anything') });
  assert.equal(bad.status, 403);
});

test('errors: not configured, bad JSON, bad request, model down, junk model output', async () => {
  assert.equal((await handleRequest(post({ text: 'x', permit_ids: [], destination_ids: [] }), { env: {} })).status, 503);
  const badJson = new Request('https://x/f', { method: 'POST', body: '{nope', headers: { Origin: 'http://localhost:8000' } });
  assert.equal((await handleRequest(badJson, { env: ENV, fetchImpl: fakeFetch().impl })).status, 400);
  assert.equal((await handleRequest(post({ permit_ids: [], destination_ids: [] }), { env: ENV, fetchImpl: fakeFetch().impl })).status, 400);
  const down = fakeFetch({ gemini: new Response('x', { status: 429 }) });
  assert.equal((await handleRequest(post({ text: 'x', permit_ids: [1], destination_ids: [] }), { env: ENV, fetchImpl: down.impl })).status, 502);
  const unreachable = fakeFetch({ gemini: new Error('offline') });
  assert.equal((await handleRequest(post({ text: 'x', permit_ids: [1], destination_ids: [] }), { env: ENV, fetchImpl: unreachable.impl })).status, 502);
  const junk = fakeFetch({ gemini: Response.json({ candidates: [] }) });
  const res = await handleRequest(post({ text: 'x', permit_ids: [1], destination_ids: [] }), { env: ENV, fetchImpl: junk.impl });
  assert.equal(res.status, 502);
  assert.equal((await res.json()).error, 'bad_model_output');
  const get = await handleRequest(new Request('https://x/f', { method: 'GET' }), { env: ENV });
  assert.equal(get.status, 405);
});

test('index.ts reads the Gemini key from Deno.env and serves the handler', async () => {
  const source = await readFile(new URL('../supabase/functions/parse-find/index.ts', import.meta.url), 'utf8');
  assert.match(source, /Deno\.env\.get\("GEMINI_API_KEY"\)/);
  assert.match(source, /Deno\.serve/);
  assert.doesNotMatch(source, /AIza[0-9A-Za-z_-]{20,}/);
});
