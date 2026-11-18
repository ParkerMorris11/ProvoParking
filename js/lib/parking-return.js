import { parkingReturn } from "../domain/mobile-sheet.js";

const KEY = "pp.parkingReturn";
const TTL = 15 * 60 * 1000;

export function saveParkingReturn(hash, destinationId) {
  const place = parkingReturn(hash, destinationId);
  if (!place) return;
  try { sessionStorage.setItem(KEY, JSON.stringify({ ...place, expires: Date.now() + TTL })); }
  catch { /* The account flow is still available without browser storage. */ }
}

export function takeParkingReturn() {
  try {
    const value = JSON.parse(sessionStorage.getItem(KEY) || "null");
    sessionStorage.removeItem(KEY);
    return value?.expires >= Date.now() ? parkingReturn(value.hash, value.destinationId) : null;
  } catch { return null; }
}
