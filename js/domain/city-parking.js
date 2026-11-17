// Provo City GIS + OpenStreetMap parking snapshots. Pure helpers, no DOM.
// These records are NOT eligibility rules: hours and notes are what the source recorded,
// so the app always labels them unverified and never says "you may park here".

function ringPoints(ring) {
  if (!Array.isArray(ring)) return [];
  return ring.filter(p => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]) &&
    Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 90);
}

function geometryPoints(geometry) {
  if (!geometry) return [];
  if (geometry.type === "Point") return ringPoints([geometry.coordinates]);
  if (geometry.type === "Polygon") return ringPoints(geometry.coordinates?.[0]);
  if (geometry.type === "MultiPolygon") {
    return (geometry.coordinates || []).flatMap(polygon => ringPoints(polygon?.[0]));
  }
  return [];
}

export function facilityCenter(feature) {
  const points = geometryPoints(feature?.geometry);
  if (feature?.geometry?.type === "Point") {
    const point = points[0];
    return point ? { latitude: point[1], longitude: point[0] } : null;
  }
  if (points.length < 3) return null;
  const lats = points.map(p => p[1]), lngs = points.map(p => p[0]);
  return { latitude: (Math.min(...lats) + Math.max(...lats)) / 2, longitude: (Math.min(...lngs) + Math.max(...lngs)) / 2 };
}

function insideRing(lng, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * A point inside the lot for directions. The box center of an L-shaped lot or a street strip can sit outside
 * it (up to ~36 m in the Provo snapshot), so fall back to the middle of the widest east-west run through it.
 */
export function facilityDirectionsPoint(feature) {
  const center = facilityCenter(feature);
  const geometry = feature?.geometry;
  if (!center || geometry?.type === "Point") return center;
  const rings = geometry.type === "Polygon" ? [geometry.coordinates?.[0]] : (geometry.coordinates || []).map((polygon) => polygon?.[0]);
  const clean = rings.map(ringPoints).filter((ring) => ring.length >= 3);
  if (clean.some((ring) => insideRing(center.longitude, center.latitude, ring))) return center;
  let best = null;
  for (const ring of clean) {
    const lats = ring.map((p) => p[1]);
    for (const fraction of [0.5, 0.4, 0.6, 0.3, 0.7]) {
      const lat = Math.min(...lats) + (Math.max(...lats) - Math.min(...lats)) * fraction;
      const hits = [];
      for (let i = 0; i + 1 < ring.length; i++) {
        const [a, b] = [ring[i], ring[i + 1]];
        if ((a[1] > lat) !== (b[1] > lat)) hits.push(a[0] + ((lat - a[1]) * (b[0] - a[0])) / (b[1] - a[1]));
      }
      hits.sort((x, y) => x - y);
      for (let k = 0; k + 1 < hits.length; k += 2) {
        const width = hits[k + 1] - hits[k];
        if (!best || width > best.width) best = { width, latitude: lat, longitude: (hits[k] + hits[k + 1]) / 2 };
      }
    }
  }
  return best ? { latitude: best.latitude, longitude: best.longitude } : center;
}

export function cityLayerBounds(facilities) {
  const lats = [], lngs = [];
  for (const feature of facilities || []) {
    const center = facilityCenter(feature);
    if (!center) continue;
    lats.push(center.latitude);
    lngs.push(center.longitude);
  }
  if (!lats.length) return null;
  return [[Math.min(...lats), Math.min(...lngs)], [Math.max(...lats), Math.max(...lngs)]];
}

// Keep only well-formed facilities with a name and a drawable outline or point.
export function validFacilities(collection) {
  if (collection?.type !== "FeatureCollection" || !Array.isArray(collection.features)) return [];
  return collection.features.filter(f => typeof f?.properties?.name === "string" && f.properties.name.trim() && facilityCenter(f));
}

function kindLabel(kind) {
  if (kind === "garage") return "Parking garage";
  if (kind === "on_street") return "On-street parking";
  return "Surface lot";
}

function spacesText(properties) {
  if (!Number.isInteger(properties.spaces) || properties.spaces <= 0) return "Space count unknown";
  return properties.record_source === "osm"
    ? `${properties.spaces} spaces recorded in OpenStreetMap`
    : `${properties.spaces} spaces recorded by the city`;
}

function provenance(properties, source) {
  const checked = source.checked_on || "date unknown";
  if (properties.record_source === "osm") {
    const ref = properties.osm_type && properties.osm_id ? `${properties.osm_type}/${properties.osm_id}` : "feature";
    return `OpenStreetMap ${ref} · checked ${checked}`;
  }
  return `Provo City record edited ${properties.city_edited_on || "date unknown"} · checked ${checked}`;
}

// Plain-language facts for a popup or list card. Missing values say "unknown", never a guess.
export function facilitySummary(feature, source = {}) {
  const p = feature.properties;
  const osm = p.record_source === "osm";
  return {
    name: p.name.trim(),
    kind: kindLabel(p.kind),
    spaces: spacesText(p),
    hours: p.recorded_hours ? `Recorded hours: ${p.recorded_hours}` : "Hours unknown",
    notes: p.notes || null,
    access: osm
      ? (p.access_status === "reported_public" ? "Public access reported by OpenStreetMap" : "Public access unknown")
      : null,
    caution: "Rules not verified by this app. Check posted signs.",
    provenance: provenance(p, source),
    sourceUrl: osm
      ? (p.osm_type && p.osm_id ? `https://www.openstreetmap.org/${p.osm_type}/${p.osm_id}` : source.osm_url || null)
      : (source.info_url || source.url || null),
    sourceLabel: osm ? "OpenStreetMap" : "Provo Parking",
    center: facilityCenter(feature),
    directionsPoint: facilityDirectionsPoint(feature),
  };
}
