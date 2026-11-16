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
  let listening = false, recognition = null, recorder = null, stream = null, timer = null, generation = 0;

  const setState = (next) => { listening = next === "listening"; onState(next); };
  const stopTracks = (media) => media?.getTracks?.().forEach((track) => track.stop());
  const releaseStream = () => { stopTracks(stream); stream = null; };

  function startRecognition(version) {
    const Ctor = recognitionCtor(win);
    const active = recognition = new Ctor();
    const current = () => version === generation && recognition === active;
    active.lang = "en-US";
    active.interimResults = true;
    active.continuous = false;
    active.maxAlternatives = 1;
    active.onresult = (event) => {
      if (!current()) return;
      let text = "", final = true;
      for (const result of Array.from(event.results)) { text += result[0].transcript; if (!result.isFinal) final = false; }
      onTranscript(text.trim(), final);
    };
    active.onerror = (event) => {
      if (!current()) return;
      clearTimeout(timer);
      recognition = null;
      onError(speechErrorText(event.error));
      setState("idle");
    };
    active.onend = () => {
      if (!current()) return;
      clearTimeout(timer);
      recognition = null;
      if (listening) setState("idle");
    };
    setState("listening");
    try {
      active.start();
    } catch {
      recognition = null;
      setState("idle");
      return onError(speechErrorText());
    }
    // Some browsers (e.g. Chromium builds without Google's speech service) never fire result, error, or end.
    timer = setTimeout(() => stop(), maxMs);
  }

  async function startRecorder(version) {
    setState("listening");
    let media;
    try {
      media = await win.navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (error) {
      if (version !== generation) return;
      setState("idle");
      return onError(speechErrorText(error?.name === "NotFoundError" ? "audio-capture" : "not-allowed"));
    }
    if (version !== generation || !listening) return stopTracks(media);
    stream = media;
    const mimeType = pickRecorderType(win.MediaRecorder);
    const chunks = [];
    try {
      const active = recorder = mimeType ? new win.MediaRecorder(stream, { mimeType }) : new win.MediaRecorder(stream);
      active.ondataavailable = (event) => { if (version === generation && event.data?.size) chunks.push(event.data); };
      active.onstop = async () => {
        if (version !== generation || recorder !== active) return;
        clearTimeout(timer);
        releaseStream();
        const type = active.mimeType || mimeType || "audio/mp4";
        recorder = null;
        if (!chunks.length) return setState("idle");
        setState("processing");
        try {
          const data_base64 = await blobToBase64(new Blob(chunks, { type }));
          if (version === generation) onAudio({ data_base64, mime_type: type });
        } catch {
          if (version === generation) { onError(speechErrorText()); setState("idle"); }
        }
      };
      active.start();
      timer = setTimeout(() => stop(), maxMs);
    } catch {
      recorder = null;
      releaseStream();
      onError(speechErrorText());
      setState("idle");
    }
  }

  function start() {
    if (listening || mode === "none") return;
    const version = ++generation;
    if (mode === "recognition") startRecognition(version); else void startRecorder(version);
  }

  function stop() {
    clearTimeout(timer);
    if (recognition) {
      const active = recognition;
      try { active.stop(); } catch { /* already stopped */ }
      // If the browser never answers stop() with "end", give the button back anyway.
      setTimeout(() => { if (recognition === active) { recognition = null; if (listening) setState("idle"); } }, 1500);
    }
    else if (recorder && recorder.state !== "inactive") recorder.stop();
    else if (!recorder && listening) cancel(); // Permission may still be pending.
  }

  // A normal stop submits the final result. Account changes must discard it instead.
  function cancel() {
    generation++;
    clearTimeout(timer);
    const oldRecognition = recognition, oldRecorder = recorder;
    recognition = recorder = null;
    try {
      if (oldRecognition?.abort) oldRecognition.abort();
      else oldRecognition?.stop();
    } catch { /* already stopped */ }
    try { if (oldRecorder && oldRecorder.state !== "inactive") oldRecorder.stop(); } catch { /* already stopped */ }
    releaseStream();
    setState("idle");
  }

  return { mode, get listening() { return listening; }, start, stop, cancel, toggle() { if (listening) stop(); else start(); }, done() { setState("idle"); } };
}
