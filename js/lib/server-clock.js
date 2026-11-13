// Monotonic server time keeps both countdown views consistent when a device clock is wrong.
let anchor = null;
const monotonic = () => globalThis.performance?.now?.() ?? Date.now();
export function syncParkingClock(serverNow) {
  const value = Date.parse(serverNow);
  if (Number.isFinite(value)) anchor = { server: value, local: monotonic() };
}
export function parkingNow() { return anchor ? anchor.server + monotonic() - anchor.local : Date.now(); }
export function resetParkingClock() { anchor = null; }
