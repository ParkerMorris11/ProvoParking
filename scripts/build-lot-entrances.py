"""Finds the drive-in entrance of every verified BYU parking section, for exact directions links.

The pins in parking_area are interior points of each BYU GIS section polygon. Google and Apple Maps route a
coordinate to the nearest road segment, which for a pin in the middle of a lot is sometimes a street with no
way into the lot. This script uses OpenStreetMap roads to find where a drivable way crosses into the lot that
holds each section, and writes a point ~12 m inside that entrance to js/data/lot-entrances.js.

  python3 scripts/build-lot-entrances.py OSM.json PARKING_AREA.json AUDIT_OUT.json
OSM.json: Overpass result for
  [out:json];(way["highway"](40.238,-111.668,40.270,-111.636);way["amenity"="parking"](40.238,-111.668,40.270,-111.636););out geom tags;
PARKING_AREA.json: `select * from parking_area` (to audit the stored pins). Needs shapely.
"""
import json, math, sys
from shapely.geometry import Polygon, Point, LineString, MultiPolygon
from shapely.ops import unary_union, nearest_points

REPO='.'
OSM_PATH, AREAS_PATH, AUDIT_PATH = sys.argv[1:4]
LAT0, LON0 = 40.25, -111.65
KX = math.cos(math.radians(LAT0))*111320; KY = 110540
def xy(lon, lat): return ((lon-LON0)*KX, (lat-LAT0)*KY)
def ll(x, y): return (round(y/KY+LAT0, 6), round(x/KX+LON0, 6))

areas = json.load(open(AREAS_PATH))
gis = {f['properties']['OBJECTID']: f for f in json.load(open(f'{REPO}/data/byu-campus-parking.json'))['features']}
secjson = {s['object_id']: s for s in json.load(open(f'{REPO}/data/verified-byu-sections.json'))}
osm = json.load(open(OSM_PATH))['elements']

def poly_of(geom):
    if geom['type'] == 'Polygon':
        return Polygon([xy(*p) for p in geom['coordinates'][0]], [[xy(*p) for p in r] for r in geom['coordinates'][1:]]).buffer(0)
    return unary_union([Polygon([xy(*p) for p in poly[0]]).buffer(0) for poly in geom['coordinates']])

DRIVABLE = {'service','residential','tertiary','secondary','primary','unclassified','living_street','tertiary_link','secondary_link','primary_link'}
PUBLIC = {'residential','tertiary','secondary','primary','unclassified','living_street','tertiary_link','secondary_link','primary_link','trunk','trunk_link'}
ways, lots = [], []
for e in osm:
    t = e.get('tags', {}); g = e.get('geometry')
    if not g: continue
    pts = [xy(p['lon'], p['lat']) for p in g]
    if t.get('amenity') == 'parking' and len(pts) >= 4 and pts[0] == pts[-1]:
        p = Polygon(pts).buffer(0)
        if p.area > 50: lots.append((p, t))
    hw = t.get('highway')
    if hw in DRIVABLE and t.get('service') not in ('emergency_access', 'drive-through') and t.get('access') not in ('no', 'private') and t.get('motor_vehicle') not in ('no','private') and len(pts) >= 2:
        ways.append((LineString(pts), t))
public_net = unary_union([w for w, t in ways if t.get('highway') in PUBLIC] + [LineString([xy(p['lon'], p['lat']) for p in e['geometry']]) for e in osm if e.get('tags', {}).get('highway') in ('trunk','trunk_link') and e.get('geometry')])

def entrance_for(section, point):
    # The physical lot: OSM parking polygons that overlap this BYU section, else the section itself.
    overl = [p for p, t in lots if p.intersects(section) and p.intersection(section).area > 10]
    lot = unary_union(overl + [section]).buffer(3)
    cands = []
    for line, t in ways:
        if not line.intersects(lot.boundary): continue
        inter = line.intersection(lot.boundary)
        geoms = getattr(inter, 'geoms', [inter])
        for g in geoms:
            if g.geom_type != 'Point': continue
            # Inward point: walk 12 m along the way toward the inside of the lot.
            d = line.project(g)
            inside = None
            for step in (12, -12, 8, -8, 5, -5):
                q = line.interpolate(d + step)
                if lot.contains(q): inside = q; break
            if inside is None: continue
            outside = None
            for step in (12, -12, 8, -8):
                q = line.interpolate(d + step)
                if not lot.contains(q): outside = q; break
            if outside is None: continue  # way runs along the edge, not an entrance
            is_aisle = t.get('service') == 'parking_aisle'
            cands.append(dict(pt=inside, cross=g, way=t, to_public=g.distance(public_net), to_point=g.distance(point), aisle=is_aisle))
    if not cands:
        # No driveway crosses the lot edge in OSM: use the closest point on a drivable aisle/road inside or next to the lot.
        near = [(line.distance(point), line, t) for line, t in ways if line.distance(point) < 25]
        if not near: return None, lot, overl
        dist, line, t = min(near, key=lambda n: n[0])
        q = line.interpolate(line.project(point))
        return dict(pt=q, cross=q, way=t, to_public=q.distance(public_net), to_point=q.distance(point), aisle=True, fallback=True), lot, overl
    # Prefer a real entrance (driveway/road, close to the public street) and, among those, the one closest to this section.
    best = min(cands, key=lambda c: (c['to_public'] > 60, c['to_point'] + 0.5*c['to_public']))
    return best, lot, overl

rows = []
for a in areas:
    if a['is_sample_data'] or a['source_feature_id'] is None: continue
    f = gis.get(a['source_feature_id'])
    sec = poly_of(f['geometry'])
    stored = Point(xy(a['longitude'], a['latitude']))
    in_poly = sec.contains(stored)
    off = 0 if in_poly else round(stored.distance(sec), 1)
    best, lot, overl = entrance_for(sec, stored)
    allroads = ways + [(LineString([xy(p['lon'], p['lat']) for p in e['geometry']]), e['tags']) for e in osm if e.get('tags', {}).get('highway') in ('trunk','trunk_link','busway') and e.get('geometry')]
    snap_d, snap_line, snap_t = min(((l.distance(stored), l, t) for l, t in allroads), key=lambda n: n[0])
    snap_touches_lot = snap_line.intersects(lot)
    osm_gap = round(min([p.distance(sec) for p, t in lots] or [9999]), 1)
    ent = ll(best['pt'].x, best['pt'].y) if best else None
    rows.append(dict(area_id=a['area_id'], lot=a['lot_code'], name=a['area_name'], feature=a['source_feature_id'],
        stored=[a['latitude'], a['longitude']], stored_inside_gis=in_poly, stored_off_m=off,
        stored_to_entrance_m=round(stored.distance(best['pt']), 1) if best else None,
        osm_lot_matched=len(overl), osm_gap_m=osm_gap, entrance=ent,
        entrance_way=(best['way'].get('name') or best['way'].get('highway')+('/'+best['way'].get('service') if best['way'].get('service') else '')) if best else None,
        entrance_to_public_m=round(best['to_public'], 1) if best else None,
        snap_road=(snap_t.get('name') or snap_t.get('highway')) , snap_road_touches_lot=bool(snap_touches_lot), snap_road_m=round(snap_d,1),
        section_area_m2=round(sec.area), section_span_m=round(math.sqrt((sec.bounds[2]-sec.bounds[0])**2+(sec.bounds[3]-sec.bounds[1])**2))))
json.dump(rows, open(AUDIT_PATH, 'w'), indent=1)
entrances = {}
for r in rows:
    if r['entrance']: entrances[r['feature']] = r['entrance']
lines = ',\n'.join(f'  {k}: [{v[0]}, {v[1]}]' for k, v in sorted(entrances.items()))
open('js/data/lot-entrances.js', 'w').write(
    '// Generated by scripts/build-lot-entrances.py from the BYU GIS sections and OpenStreetMap roads (2026-11-17).\n'
    '// Key: BYU GIS OBJECTID (parking_area.source_feature_id). Value: [lat, lng] about 12 m inside the drive-in\n'
    '// entrance of the lot that holds the section. Driving directions go here instead of the section\'s interior pin.\n'
    'export const LOT_ENTRANCES = {\n' + lines + ',\n};\n')
print('areas audited', len(rows))
print('stored point outside its BYU GIS polygon:', [(r['area_id'], r['lot'], r['stored_off_m']) for r in rows if not r['stored_inside_gis']])
print('no OSM parking lot overlapping:', [(r['area_id'], r['lot'], r['osm_gap_m']) for r in rows if not r['osm_lot_matched']])
print('no entrance found:', [(r['area_id'], r['lot']) for r in rows if not r['entrance']])
far = sorted([r for r in rows if r['stored_to_entrance_m'] and r['stored_to_entrance_m'] > 100], key=lambda r: -r['stored_to_entrance_m'])
bad=[r for r in rows if not r['snap_road_touches_lot']]
print('stored pin snaps to a road that never enters its lot:', len(bad), [(r['area_id'], r['lot'], r['snap_road'], r['snap_road_m']) for r in bad])
print('stored point > 100 m from the lot entrance:', len(far))
for r in rows: print(r['area_id'], r['lot'], r['feature'], 'in' if r['stored_inside_gis'] else f"OFF {r['stored_off_m']}m", 'osm', r['osm_lot_matched'], 'ent', r['entrance'], r['entrance_way'], 'pub', r['entrance_to_public_m'], 'd', r['stored_to_entrance_m'])
