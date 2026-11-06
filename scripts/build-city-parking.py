#!/usr/bin/env python3
"""Rebuild data/provo-city-parking.json from Provo City GIS + OSM.

City GIS public facilities are kept as the named downtown/civic inventory.
OpenStreetMap amenity=parking fills in the rest of Provo city limits.
Neither source is treated as verified parking rules.
"""
from __future__ import annotations

import json
import math
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CITY_JSON = ROOT / "data" / "provo-city-parking.json"
OSM_GEOM = Path("/tmp/provo-osm-parking-geom.json")
CHECKED_ON = "2026-11-06"

BYU_RE = re.compile(r"brigham young|\bbyu\b|\bmtc\b", re.I)
LOTCODE_RE = re.compile(r"^\d+[A-Z]{1,3}\b")
PRIVATE = {"private", "no", "customers", "destination"}
# Generous BYU campus box so OSM campus lots are not duplicated on the city layer.
CAMPUS = (40.243, 40.270, -111.668, -111.638)


def round5(value: float) -> float:
    return round(value, 5)


def simplify_ring(ring: list[list[float]], min_deg: float = 0.0001) -> list[list[float]]:
    if len(ring) <= 4:
        return [[round5(p[0]), round5(p[1])] for p in ring]
    out = [ring[0]]
    for point in ring[1:-1]:
        prev = out[-1]
        if abs(point[0] - prev[0]) >= min_deg or abs(point[1] - prev[1]) >= min_deg:
            out.append(point)
    last = ring[-1]
    if out[-1] != last:
        out.append(last)
    if out[0] != out[-1]:
        out.append(out[0])
    if len(out) < 4:
        return [[round5(p[0]), round5(p[1])] for p in ring]
    return [[round5(p[0]), round5(p[1])] for p in out]


def centroid(lngs: list[float], lats: list[float]) -> tuple[float, float]:
    return (min(lats) + max(lats)) / 2, (min(lngs) + max(lngs)) / 2


def meters(a: tuple[float, float], b: tuple[float, float]) -> float:
    dlat = math.radians(b[0] - a[0])
    dlng = math.radians(b[1] - a[1])
    lat1, lat2 = math.radians(a[0]), math.radians(b[0])
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlng / 2) ** 2
    return 6371000 * 2 * math.asin(math.sqrt(h))


def on_campus(lat: float, lon: float) -> bool:
    s, n, w, e = CAMPUS
    return s <= lat <= n and w <= lon <= e


def is_byu(tags: dict) -> bool:
    blob = " ".join(filter(None, [tags.get("operator"), tags.get("name"), tags.get("owner"), tags.get("brand")]))
    return bool(BYU_RE.search(blob) or LOTCODE_RE.match(tags.get("name") or ""))


def kind_from_osm(tags: dict) -> str:
    parking = (tags.get("parking") or "").lower()
    structure = (tags.get("building") or "").lower()
    if parking in {"street_side", "lane"}:
        return "on_street"
    if parking in {"multi-storey", "underground"} or structure in {"garage", "parking"}:
        return "garage"
    return "lot"


def display_name(tags: dict) -> str:
    if tags.get("name"):
        return tags["name"].strip()
    if tags.get("operator"):
        return f"{tags['operator'].strip()} parking"
    parking = (tags.get("parking") or "").lower()
    if parking == "street_side":
        return "On-street parking"
    if parking == "lane":
        return "On-street (lane)"
    if parking == "multi-storey":
        return "Parking garage"
    if parking == "underground":
        return "Underground parking"
    return "Mapped parking lot"


def capacity(tags: dict):
    raw = tags.get("capacity")
    if raw is None:
        return None
    try:
        value = int(str(raw).split(";")[0].strip())
        return value if value > 0 else None
    except ValueError:
        return None


def way_geometry(element: dict):
    geom = element.get("geometry") or []
    if len(geom) < 3:
        return None
    ring = [[p["lon"], p["lat"]] for p in geom]
    if ring[0] != ring[-1]:
        ring.append(ring[0])
    if len(ring) < 4:
        lat = sum(p["lat"] for p in geom) / len(geom)
        lon = sum(p["lon"] for p in geom) / len(geom)
        return {"type": "Point", "coordinates": [round5(lon), round5(lat)]}
    simple = simplify_ring(ring)
    if len(simple) < 4:
        lats = [p[1] for p in simple]
        lngs = [p[0] for p in simple]
        return {"type": "Point", "coordinates": [round5((min(lngs) + max(lngs)) / 2), round5((min(lats) + max(lats)) / 2)]}
    return {"type": "Polygon", "coordinates": [simple]}


def relation_geometry(element: dict):
    outers = []
    for member in element.get("members") or []:
        if member.get("type") != "way" or member.get("role") not in {"outer", ""}:
            continue
        geom = member.get("geometry") or []
        if len(geom) < 3:
            continue
        ring = [[p["lon"], p["lat"]] for p in geom]
        if ring[0] != ring[-1]:
            ring.append(ring[0])
        simple = simplify_ring(ring)
        if len(simple) >= 4:
            outers.append(simple)
    if not outers:
        bounds = element.get("bounds") or {}
        if {"minlat", "maxlat", "minlon", "maxlon"} <= bounds.keys():
            lat = (bounds["minlat"] + bounds["maxlat"]) / 2
            lon = (bounds["minlon"] + bounds["maxlon"]) / 2
            return {"type": "Point", "coordinates": [round5(lon), round5(lat)]}
        return None
    if len(outers) == 1:
        return {"type": "Polygon", "coordinates": outers}
    return {"type": "MultiPolygon", "coordinates": [[ring] for ring in outers]}


def feature_center(geometry: dict):
    if geometry["type"] == "Point":
        lon, lat = geometry["coordinates"]
        return lat, lon
    rings = []
    if geometry["type"] == "Polygon":
        rings = geometry["coordinates"]
    elif geometry["type"] == "MultiPolygon":
        rings = [ring for poly in geometry["coordinates"] for ring in poly]
    pts = [p for ring in rings for p in ring]
    if not pts:
        return None
    return centroid([p[0] for p in pts], [p[1] for p in pts])


def osm_feature(element: dict):
    tags = element.get("tags") or {}
    if is_byu(tags):
        return None
    access = (tags.get("access") or "yes").lower()
    if access in PRIVATE:
        return None
    if element["type"] == "node":
        geometry = {"type": "Point", "coordinates": [round5(element["lon"]), round5(element["lat"])]}
    elif element["type"] == "way":
        geometry = way_geometry(element)
    else:
        geometry = relation_geometry(element)
    if not geometry:
        return None
    center = feature_center(geometry)
    if not center or on_campus(*center):
        return None
    lat, lon = center
    if not (40.19 <= lat <= 40.34 and -111.74 <= lon <= -111.55):
        return None
    notes = tags.get("description") or tags.get("note")
    access_note = None
    if access not in {"yes", ""}:
        access_note = f"OSM access={access}"
    extra = "; ".join(filter(None, [access_note, notes]))
    spaces = capacity(tags)
    return {
        "type": "Feature",
        "geometry": geometry,
        "properties": {
            "osm_type": element["type"],
            "osm_id": element["id"],
            "name": display_name(tags),
            "kind": kind_from_osm(tags),
            "structure_type": tags.get("parking") or tags.get("building") or "parking",
            "spaces": spaces,
            "recorded_hours": tags.get("opening_hours") or None,
            "notes": extra or None,
            "record_source": "osm",
        },
    }


def main() -> None:
    city = json.loads(CITY_JSON.read_text())
    city_features = []
    city_centers = []
    for feature in city["features"]:
        props = dict(feature["properties"])
        if props.get("record_source") == "osm" or props.get("osm_id"):
            continue
        props["record_source"] = "provo_city"
        city_features.append({"type": "Feature", "geometry": feature["geometry"], "properties": props})
        ring = feature["geometry"]["coordinates"][0]
        city_centers.append(centroid([p[0] for p in ring], [p[1] for p in ring]))

    osm_raw = json.loads(OSM_GEOM.read_text())["elements"]
    osm_features = []
    skipped_near_city = 0
    for element in osm_raw:
        feature = osm_feature(element)
        if not feature:
            continue
        center = feature_center(feature["geometry"])
        if feature["properties"]["kind"] != "on_street" and any(meters(center, c) < 80 for c in city_centers):
            skipped_near_city += 1
            continue
        osm_features.append(feature)

    osm_features.sort(key=lambda f: (f["properties"]["name"].lower(), f["properties"]["osm_id"]))

    collection = {
        "type": "FeatureCollection",
        "source": {
            "name": "Provo City GIS public parking facilities plus OpenStreetMap amenity=parking inside Provo city limits",
            "url": "https://services2.arcgis.com/u1JcjHKiYxDeQU3C/arcgis/rest/services/Provo_Parking_Facilities/FeatureServer/0",
            "info_url": "https://www.provo.gov/273/Parking",
            "osm_url": "https://www.openstreetmap.org",
            "checked_on": CHECKED_ON,
            "note": (
                "Provo City GIS: public lots/garages only (city records edited 2018–2023); outlines simplified to about 10 m. "
                "OSM: amenity=parking in OSM relation 198903 (Provo), excluding BYU/MTC campus lots and access=private/customers. "
                "Hours, space counts and whether you may park are not verified by this app. On-street coverage is only OSM street_side/lane tags."
            ),
            "city_gis_public_count": len(city_features),
            "osm_added_count": len(osm_features),
            "osm_skipped_near_city_gis": skipped_near_city,
        },
        "features": city_features + osm_features,
    }
    CITY_JSON.write_text(json.dumps(collection, indent=1) + "\n")
    print(
        f"wrote {CITY_JSON} city={len(city_features)} osm={len(osm_features)} "
        f"skipped_near_city={skipped_near_city} total={len(collection['features'])}"
    )


if __name__ == "__main__":
    main()
