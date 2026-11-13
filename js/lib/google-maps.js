// Loads the Google Maps JavaScript API (beta channel, for Photorealistic 3D) on demand.
// The key comes from config.js (window.APP_CONFIG.GOOGLE_MAPS_API_KEY); it is never in the code.
// Restrict that key to this site's address in Google Cloud (HTTP referrers) since browsers can read it.
export const MAPS_LIBRARIES = "maps3d,places,marker";
const CALLBACK_NAME = "__provoParkingMapsReady";

export function getMapsApiKey(config = globalThis.window?.APP_CONFIG) {
  const key = typeof config?.GOOGLE_MAPS_API_KEY === "string" ? config.GOOGLE_MAPS_API_KEY.trim() : "";
  return !key || /^YOUR[-_]/i.test(key) ? "" : key;
}

export function mapsScriptUrl(key) {
  return `https://maps.googleapis.com/maps/api/js?loading=async&key=${encodeURIComponent(key)}&libraries=${MAPS_LIBRARIES}&v=beta&callback=${CALLBACK_NAME}`;
}

const authListeners = new Set();
/** Called when Google rejects the key (wrong referrer, billing off, API not enabled). Returns an unsubscribe. */
export function onMapsAuthFailure(listener) {
  authListeners.add(listener);
  return () => authListeners.delete(listener);
}

const loads = new WeakMap(); // one script load per window

export function loadGoogleMaps({ key = getMapsApiKey(), doc = globalThis.document, win = globalThis.window } = {}) {
  if (typeof win?.google?.maps?.importLibrary === "function") return Promise.resolve(win.google.maps);
  if (!key) return Promise.reject(new Error("No Google Maps API key configured"));
  if (loads.has(win)) return loads.get(win);
  win.gm_authFailure = () => authListeners.forEach(listener => listener());
  const loading = new Promise((resolve, reject) => {
    let settled = false;
    let timer = null;
    const finish = () => {
      if (settled) return;
      if (typeof win.google?.maps?.importLibrary === "function") {
        settled = true;
        clearTimeout(timer);
        delete win[CALLBACK_NAME];
        resolve(win.google.maps);
      }
    };
    const fail = (message) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      delete win[CALLBACK_NAME];
      reject(new Error(message));
    };
    win[CALLBACK_NAME] = finish;
    const script = doc.createElement("script");
    script.src = mapsScriptUrl(key);
    script.async = true;
    script.onload = () => {
      finish();
      if (!settled) timer = setTimeout(() => fail("Google Maps loaded without importLibrary"), 15000);
    };
    script.onerror = () => fail("Google Maps script failed to load");
    doc.head.append(script);
  }).catch(error => { loads.delete(win); throw error; });
  loads.set(win, loading);
  return loading;
}
