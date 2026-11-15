// Pure map helpers shared by the 2D and 3D views: lot colors and GeoJSON -> {lat, lng} shapes. No DOM.
export const CAMPUS_CENTER = { lat: 40.2518, lng: -111.6493 };
export const DOWNTOWN_CENTER = { lat: 40.2338, lng: -111.6595 };
export const CITY_COLOR = "#7a4fb5";

export const PERMIT_CATEGORIES = [
  { label: "Student · Y / G", color: "#3168dc", codes: ["Y", "G"] },
  { label: "Employee · A", color: "#b07b23", codes: ["A"] },
  { label: "Visitor · V", color: "#07859a", codes: ["V"] },
  { label: "Free · U", color: "#16806b", codes: ["U"] },
  { label: "Housing", color: "#8062b3", codes: ["B", "C", "D", "YM", "YV", "BCD"] },
  { label: "Timed · T / EV", color: "#c2643a", codes: ["T", "EV"] },
  { label: "Restricted / other", color: "#687589", codes: [] },
];

export function permitCategory(code) {
  return PERMIT_CATEGORIES.find(item => item.codes.includes(code)) || PERMIT_CATEGORIES.at(-1);
}

const validPoint = p => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]) && Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 90;

/** Outer rings of a Polygon or MultiPolygon as arrays of {lat, lng}. Holes are ignored. */
export function outerRings(geometry) {
  const polygons = geometry?.type === "Polygon" ? [geometry.coordinates]
    : geometry?.type === "MultiPolygon" ? geometry.coordinates : [];
  return (polygons || [])
    .map(polygon => (polygon?.[0] || []).filter(validPoint).map(([lng, lat]) => ({ lat, lng })))
    .filter(ring => ring.length >= 3);
}

export function boundsOf(points) {
  if (!points.length) return null;
  const lats = points.map(p => p.lat), lngs = points.map(p => p.lng);
  return { south: Math.min(...lats), west: Math.min(...lngs), north: Math.max(...lats), east: Math.max(...lngs) };
}

export function boundsCenter(bounds) {
  return bounds ? { lat: (bounds.south + bounds.north) / 2, lng: (bounds.west + bounds.east) / 2 } : null;
}

/** [[south, west], [north, east]] (what cityLayerBounds returns) -> { south, west, north, east }. */
export function boundsFromCorners(corners) {
  if (!Array.isArray(corners) || corners.length !== 2) return null;
  const [[south, west], [north, east]] = corners;
  return [south, west, north, east].every(Number.isFinite) ? { south, west, north, east } : null;
}

/** A BYU boundary feature as a drawable shape. Returns null when it has no usable outline. */
export function byuShape(feature) {
  const rings = outerRings(feature?.geometry);
  if (!rings.length) return null;
  const bounds = boundsOf(rings.flat());
  return {
    key: `byu-${feature.properties?.OBJECTID ?? feature.id}`,
    kind: "polygon", rings, bounds, center: boundsCenter(bounds),
    color: permitCategory(feature.properties?.permit_typ).color,
    source: { type: "byu", feature },
  };
}

/** A Provo city/OSM facility (polygon or point) as a drawable shape. */
export function cityShape(feature, index) {
  const rings = outerRings(feature?.geometry);
  if (rings.length) {
    const bounds = boundsOf(rings.flat());
    return { key: `city-${index}`, kind: "polygon", rings, bounds, center: boundsCenter(bounds), color: CITY_COLOR, source: { type: "city", index } };
  }
  const coordinates = feature?.geometry?.type === "Point" ? feature.geometry.coordinates : null;
  if (!validPoint(coordinates)) return null;
  const center = { lat: coordinates[1], lng: coordinates[0] };
  return { key: `city-${index}`, kind: "point", center, color: CITY_COLOR, source: { type: "city", index } };
}

/** Hex color plus an opacity (0-1) as #rrggbbaa, which both Google 3D polygons and CSS accept. */
export function withAlpha(hex, alpha) {
  const byte = Math.round(Math.min(1, Math.max(0, alpha)) * 255).toString(16).padStart(2, "0");
  return `${hex}${byte}`;
}
