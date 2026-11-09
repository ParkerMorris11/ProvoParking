import { validFacilities } from "../domain/city-parking.js";

let cached;

async function readCitySnapshot(fetchImpl) {
  const response = await fetchImpl("data/provo-city-parking.json");
  if (!response.ok) throw new Error(`City parking request failed (${response.status})`);
  const collection = await response.json();
  return { facilities: validFacilities(collection), source: collection.source || {} };
}

export function loadCitySnapshot(fetchImpl = globalThis.fetch) {
  if (fetchImpl !== globalThis.fetch) return readCitySnapshot(fetchImpl);
  cached ??= readCitySnapshot(fetchImpl).catch(error => { cached = null; throw error; });
  return cached;
}
