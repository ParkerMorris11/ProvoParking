import { validLocation } from "../domain/nearby.js";

// Consent is requested only by start(). Coordinates never leave this controller through storage.
export function createLocationTracker({ geolocation, onChange, now = Date.now, staleAfterMs = 90000, scheduleRetry = (fn) => setTimeout(fn, 2000), cancelRetry = clearTimeout, scheduleWatchdog = (fn) => setTimeout(fn, 25000), cancelWatchdog = clearTimeout }) {
  let watchId = null, generation = 0, active = false, enabled = false, staleTimer, retryTimer = null, retries = 0, fallback = false, hasFix = false, watchdog = null, refineWatch = null, refining = false, refineActive = false, lastFix = null;
  function clear() {
    active = false;
    generation++;
    clearTimeout(staleTimer);
    if (watchdog !== null) cancelWatchdog(watchdog);
    watchdog = null;
    if (refineWatch !== null) geolocation.clearWatch(refineWatch);
    refineWatch = null;
    refining = false;
    refineActive = false;
    lastFix = null;
    if (retryTimer !== null) cancelRetry(retryTimer);
    retryTimer = null;
    if (watchId !== null) geolocation.clearWatch(watchId);
    watchId = null;
  }
  function stop(message = "Location off. Use your location to find nearby lots.") {
    enabled = false;
    clear();
    onChange({ status: "idle", position: null, message });
  }
  function pause() {
    if (!enabled) return;
    clear();
    onChange({ status: "paused", position: null, message: "Location paused while the map is not visible." });
  }
  function resume() { if (enabled && !active) { retries = 0; fallback = false; begin(); } }
  function fail(message) {
    enabled = false;
    clear();
    onChange({ status: "error", position: null, message });
  }
  function start() { enabled = true; retries = 0; fallback = false; begin(); }
  function begin() {
    if (active) return;
    if (!geolocation) { fail("Your browser does not support location. You can still explore the map."); return; }
    active = true;
    hasFix = false;
    const token = ++generation;
    onChange({ status: "waiting", position: null, message: fallback ? "Trying an approximate location…" : "Waiting for location permission and a position…" });
    watchdog = scheduleWatchdog(() => { if (active && token === generation && !hasFix) fail("Location took too long. Check your browser permission and try again."); });
    watchdog?.unref?.();
    try {
      const id = geolocation.watchPosition(fix => {
        if (!active || token !== generation) return;
        const { latitude, longitude, accuracy } = fix.coords || {};
        if (!validLocation({ latitude, longitude }) || !Number.isFinite(accuracy) || accuracy < 0 || !Number.isFinite(fix.timestamp) || now() - fix.timestamp >= staleAfterMs) {
          fail("Location could not be confirmed. Try your location again."); return;
        }
        if (lastFix && (fix.timestamp < lastFix.timestamp || (fix.timestamp === lastFix.timestamp && accuracy >= lastFix.accuracy))) return;
        lastFix = { accuracy, timestamp: fix.timestamp };
        retries = 0;
        hasFix = true;
        if (watchdog !== null) cancelWatchdog(watchdog);
        watchdog = null;
        clearTimeout(staleTimer);
        staleTimer = setTimeout(() => fail("Location is out of date. Use your location again for fresh suggestions."), Math.max(0, staleAfterMs - Math.max(0, now() - fix.timestamp)));
        staleTimer.unref?.();
        onChange({ status: "live", position: { latitude, longitude, accuracy, timestamp: fix.timestamp }, message: `${accuracy > 200 ? "Approximate location" : "Location live"} · accuracy ±${Math.round(accuracy)} m · updated ${new Date(fix.timestamp).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` });
        if (fallback && !refining) {
          refining = true;
          refineActive = true;
          try {
            const refinementId = geolocation.watchPosition(refined => {
              if (!active || token !== generation) return;
              const point = refined.coords || {};
              if (!validLocation(point) || !Number.isFinite(point.accuracy) || point.accuracy < 0 || !Number.isFinite(refined.timestamp) || now() - refined.timestamp >= staleAfterMs) return;
              if (lastFix && (refined.timestamp < lastFix.timestamp || (refined.timestamp === lastFix.timestamp && point.accuracy >= lastFix.accuracy))) return;
              lastFix = { accuracy: point.accuracy, timestamp: refined.timestamp };
              clearTimeout(staleTimer);
              staleTimer = setTimeout(() => fail("Location is out of date. Use your location again for fresh suggestions."), Math.max(0, staleAfterMs - Math.max(0, now() - refined.timestamp)));
              staleTimer.unref?.();
              onChange({ status: "live", position: { latitude: point.latitude, longitude: point.longitude, accuracy: point.accuracy, timestamp: refined.timestamp }, message: `${point.accuracy > 200 ? "Approximate location" : "Location live"} · accuracy ±${Math.round(point.accuracy)} m · updated ${new Date(refined.timestamp).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` });
            }, () => { if (!active || token !== generation) return; refineActive = false; if (refineWatch !== null) geolocation.clearWatch(refineWatch); refineWatch = null; }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 });
            if (active && token === generation && refineActive) refineWatch = refinementId; else geolocation.clearWatch(refinementId);
          } catch { /* Keep the approximate watch and its last fix. */ }
        }
      }, error => {
        if (!active || token !== generation) return;
        if ((error.code === 2 || (error.code === 3 && !hasFix)) && retries < 1) {
          retries++;
          fallback = true;
          clear();
          onChange({ status: "waiting", position: null, message: "Trying an approximate location…" });
          retryTimer = scheduleRetry(() => { retryTimer = null; if (enabled) begin(); });
          return;
        }
        const messages = {
          1: "Location permission was denied. Allow location in your browser settings, then try again.",
          2: "Your position is unavailable. Check location services and try again.",
          3: "Finding your location timed out. Try again, or keep exploring the map.",
        };
        fail(messages[error.code] || "Location unavailable. Try again, or keep exploring the map.");
      }, { enableHighAccuracy: !fallback, maximumAge: 5000, timeout: 15000 });
      // Also safe when a test/platform calls back synchronously before returning its watch ID.
      if (active && token === generation) watchId = id; else geolocation.clearWatch(id);
    } catch {
      fail("Location is unavailable here. Use HTTPS or localhost and try again.");
    }
  }
  return { start, stop, pause, resume };
}
