import test from 'node:test';
import assert from 'node:assert/strict';
import { detectSpeechMode, isIosSafari, pickRecorderType, createSpeech, blobToBase64, speechErrorText } from '../js/lib/speech.js';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
const IPHONE_CHROME = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/123.0 Mobile/15E148 Safari/604.1';
const DESKTOP = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0 Safari/537.36';

const recorderBits = (supported = ['audio/mp4']) => ({
  MediaRecorder: class { static isTypeSupported(t) { return supported.includes(t); } },
  navigator: { mediaDevices: { getUserMedia() {} } },
});

test('iOS Safari is detected, other iOS browsers and desktops are not', () => {
  assert.equal(isIosSafari({ userAgent: IPHONE }), true);
  assert.equal(isIosSafari({ userAgent: IPHONE_CHROME }), false);
  assert.equal(isIosSafari({ userAgent: DESKTOP, platform: 'MacIntel', maxTouchPoints: 0 }), false);
  assert.equal(isIosSafari({ userAgent: DESKTOP.replace('Chrome/123.0 ', ''), platform: 'MacIntel', maxTouchPoints: 5 }), true, 'iPadOS pretends to be a Mac');
});

test('Web Speech API is used when available', () => {
  assert.equal(detectSpeechMode({ webkitSpeechRecognition: class {}, navigator: { userAgent: DESKTOP } }), 'recognition');
  assert.equal(detectSpeechMode({ SpeechRecognition: class {}, ...recorderBits(), navigator: { userAgent: DESKTOP, mediaDevices: { getUserMedia() {} } } }), 'recognition');
});

test('iOS Safari prefers the MediaRecorder fallback even if webkitSpeechRecognition exists', () => {
  const win = { webkitSpeechRecognition: class {}, ...recorderBits(), navigator: { userAgent: IPHONE, mediaDevices: { getUserMedia() {} } } };
  assert.equal(detectSpeechMode(win), 'recorder');
});

test('browsers with neither API get no mic (typing still works)', () => {
  assert.equal(detectSpeechMode({ navigator: { userAgent: DESKTOP } }), 'none');
  assert.equal(detectSpeechMode(undefined), 'none');
  const none = createSpeech({ win: { navigator: { userAgent: DESKTOP } } });
  assert.equal(none.mode, 'none');
  none.start();
  assert.equal(none.listening, false);
});

test('recorder format prefers mp4 (iOS) then webm', () => {
  assert.equal(pickRecorderType(recorderBits(['audio/mp4', 'audio/webm']).MediaRecorder), 'audio/mp4');
  assert.equal(pickRecorderType(recorderBits(['audio/webm']).MediaRecorder), 'audio/webm');
  assert.equal(pickRecorderType(recorderBits([]).MediaRecorder), '');
  assert.equal(pickRecorderType(undefined), '');
});

test('speech recognition streams the transcript, then reports the final text', () => {
  let instance;
  class Recognition { constructor() { instance = this; } start() { this.started = true; } stop() { this.onend(); } }
  const seen = [], states = [];
  const speech = createSpeech({ win: { webkitSpeechRecognition: Recognition, navigator: { userAgent: DESKTOP } }, onTranscript: (t, f) => seen.push([t, f]), onState: (s) => states.push(s) });
  speech.start();
  assert.equal(instance.started, true);
  assert.equal(instance.lang, 'en-US');
  assert.equal(speech.listening, true);
  instance.onresult({ results: [Object.assign([{ transcript: 'class at 3 ' }], { isFinal: false })] });
  instance.onresult({ results: [Object.assign([{ transcript: 'class at 3 pm' }], { isFinal: true })] });
  assert.deepEqual(seen, [['class at 3', false], ['class at 3 pm', true]]);
  speech.toggle();
  assert.equal(speech.listening, false);
  assert.deepEqual(states, ['listening', 'idle']);
});

test('speech recognition errors become plain messages', () => {
  let instance;
  class Recognition { constructor() { instance = this; } start() {} stop() {} }
  const errors = [];
  const speech = createSpeech({ win: { SpeechRecognition: Recognition, navigator: { userAgent: DESKTOP } }, onError: (m) => errors.push(m) });
  speech.start();
  instance.onerror({ error: 'not-allowed' });
  assert.match(errors[0], /blocked/);
  assert.equal(speech.listening, false);
  assert.match(speechErrorText('something-else'), /Type instead/);
});

test('recorder fallback records, stops the mic, and hands back base64 audio', async () => {
  const track = { stopped: false, stop() { this.stopped = true; } };
  let recorder;
  class MediaRecorder {
    static isTypeSupported(t) { return t === 'audio/mp4'; }
    constructor(stream, options) { recorder = this; this.options = options; this.mimeType = options.mimeType; this.state = 'inactive'; }
    start() { this.state = 'recording'; }
    stop() { this.state = 'inactive'; this.ondataavailable({ data: new Blob(['hello audio']) }); return this.onstop(); }
  }
  const win = { MediaRecorder, navigator: { userAgent: IPHONE, mediaDevices: { getUserMedia: async (c) => { assert.deepEqual(c, { audio: true }); return { getTracks: () => [track] }; } } } };
  const got = [], states = [];
  const speech = createSpeech({ win, onAudio: (a) => got.push(a), onState: (s) => states.push(s) });
  assert.equal(speech.mode, 'recorder');
  speech.start();
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(recorder.state, 'recording');
  assert.equal(recorder.options.mimeType, 'audio/mp4');
  speech.stop();
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(track.stopped, true, 'microphone released');
  assert.deepEqual(got, [{ data_base64: Buffer.from('hello audio').toString('base64'), mime_type: 'audio/mp4' }]);
  assert.deepEqual(states, ['listening', 'processing']);
});

test('recorder fallback reports a blocked microphone', async () => {
  class MediaRecorder { static isTypeSupported() { return true; } }
  const win = { MediaRecorder, navigator: { userAgent: IPHONE, mediaDevices: { getUserMedia: async () => { throw Object.assign(new Error('no'), { name: 'NotAllowedError' }); } } } };
  const errors = [];
  const speech = createSpeech({ win, onError: (m) => errors.push(m) });
  speech.start();
  await new Promise((r) => setTimeout(r, 0));
  assert.match(errors[0], /blocked/);
  assert.equal(speech.listening, false);
});

test('blobToBase64 round-trips', async () => {
  assert.equal(await blobToBase64(new Blob([new Uint8Array([0, 1, 2, 250, 255])])), Buffer.from([0, 1, 2, 250, 255]).toString('base64'));
});
