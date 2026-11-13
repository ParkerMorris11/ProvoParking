// Voice input for the Find screen. Typed input always works; this only adds the mic button.
//   "recognition": the browser's Web Speech API (SpeechRecognition / webkitSpeechRecognition) gives text.
//   "recorder":    iOS Safari's speech recognition is unreliable, so we record a short clip with MediaRecorder
//                  and let the parse-find Edge Function (Gemini) hear it.
//   "none":        no mic button.
// Nothing is recorded or sent until the person taps the mic, and the clip is never stored.

export const MAX_RECORDING_MS = 30000;
const RECORDER_TYPES = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"];

export function isIosSafari(nav = globalThis.navigator) {
  if (!nav) return false;
  const ua = nav.userAgent || "";
  const ios = /iPad|iPhone|iPod/.test(ua) || (nav.platform === "MacIntel" && nav.maxTouchPoints > 1); // iPadOS reports as a Mac
  return ios && /WebKit/.test(ua) && !/(CriOS|FxiOS|EdgiOS|OPiOS)/.test(ua);
}

const recognitionCtor = (win) => win?.SpeechRecognition || win?.webkitSpeechRecognition || null;
const canRecord = (win) => Boolean(win?.MediaRecorder && win?.navigator?.mediaDevices?.getUserMedia);

export function detectSpeechMode(win = globalThis.window) {
  const recognition = Boolean(recognitionCtor(win)), recorder = canRecord(win);
  if (isIosSafari(win?.navigator)) return recorder ? "recorder" : recognition ? "recognition" : "none";
  return recognition ? "recognition" : recorder ? "recorder" : "none";
}

export function pickRecorderType(MediaRecorderCtor) {
  if (typeof MediaRecorderCtor?.isTypeSupported !== "function") return "";
  return RECORDER_TYPES.find((type) => MediaRecorderCtor.isTypeSupported(type)) || "";
}

export async function blobToBase64(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

const ERROR_TEXT = {
  "not-allowed": "Microphone access is blocked. Allow it in your browser settings, or type instead.",
  "service-not-allowed": "Microphone access is blocked. Allow it in your browser settings, or type instead.",
  "no-speech": "I didn't hear anything. Try again, or type instead.",
  "audio-capture": "No microphone was found. Type instead.",
  "network": "Voice input needs a connection. Type instead.",
};
export const speechErrorText = (code) => ERROR_TEXT[code] || "Voice input didn't work. Type instead.";

/**
 * Callbacks: onTranscript(text, isFinal) for recognition; onAudio({ data_base64, mime_type }) for the recorder;
 * onState("idle" | "listening" | "processing"); onError(message).
 */
export function createSpeech({ win = globalThis.window, onTranscript = () => {}, onAudio = () => {}, onState = () => {}, onError = () => {}, maxMs = MAX_RECORDING_MS } = {}) {
  const mode = detectSpeechMode(win);
  let listening = false, recognition = null, recorder = null, stream = null, timer = null;

  const setState = (next) => { listening = next === "listening"; onState(next); };
  const releaseStream = () => { stream?.getTracks?.().forEach((track) => track.stop()); stream = null; };

  function startRecognition() {
    const Ctor = recognitionCtor(win);
    recognition = new Ctor();
    recognition.lang = "en-US";
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event) => {
      let text = "", final = true;
      for (const result of Array.from(event.results)) { text += result[0].transcript; if (!result.isFinal) final = false; }
      onTranscript(text.trim(), final);
    };
    recognition.onerror = (event) => { onError(speechErrorText(event.error)); setState("idle"); };
    recognition.onend = () => { recognition = null; if (listening) setState("idle"); };
    setState("listening");
    recognition.start();
  }

  async function startRecorder() {
    setState("listening");
    try {
      stream = await win.navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (error) {
      setState("idle");
      return onError(speechErrorText(error?.name === "NotFoundError" ? "audio-capture" : "not-allowed"));
    }
    if (!listening) return releaseStream(); // stopped while the permission prompt was open
    const mimeType = pickRecorderType(win.MediaRecorder);
    const chunks = [];
    recorder = mimeType ? new win.MediaRecorder(stream, { mimeType }) : new win.MediaRecorder(stream);
    recorder.ondataavailable = (event) => { if (event.data?.size) chunks.push(event.data); };
    recorder.onstop = async () => {
      clearTimeout(timer);
      releaseStream();
      const type = recorder?.mimeType || mimeType || "audio/mp4";
      recorder = null;
      if (!chunks.length) return setState("idle");
      setState("processing");
      try {
        onAudio({ data_base64: await blobToBase64(new Blob(chunks, { type })), mime_type: type });
      } catch { onError(speechErrorText()); setState("idle"); }
    };
    recorder.start();
    timer = setTimeout(() => stop(), maxMs);
  }

  function start() {
    if (listening || mode === "none") return;
    if (mode === "recognition") startRecognition(); else void startRecorder();
  }

  function stop() {
    clearTimeout(timer);
    if (recognition) recognition.stop();
    else if (recorder && recorder.state !== "inactive") recorder.stop();
    else { releaseStream(); if (listening) setState("idle"); }
  }

  return { mode, get listening() { return listening; }, start, stop, toggle() { if (listening) stop(); else start(); }, done() { setState("idle"); } };
}
