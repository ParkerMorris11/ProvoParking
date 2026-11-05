"""Build a conservative ordinary-stall candidate manifest from the checked BYU GIS snapshot."""
import json,re
from pathlib import Path

features=json.loads(Path('data/byu-campus-parking.json').read_text())['features']
sections=[]
for f in features:
 p=f['properties']; typ=p.get('permit_typ'); desc=p.get('Descriptio') or ''; lot=p.get('Lot'); category=p.get('Map_Catego')
 if typ not in ('A','G','Y','U') or lot in ('29','41') or not lot or not category: continue
 if typ=='U':
  if desc not in ('Parking is free to registered vehicles.','Parking is free for registered vehicles.'): continue
  end=None
 else:
  m=re.fullmatch(r'Permit required from 7:00 a\.m\. to ([467]):00 p\.m\. Monday through Friday\.(?: No Parking from 1 AM to 5 AM)?',desc)
  if not m: continue
  end=f'{int(m.group(1))+12:02}:00'
 # A horizontal scan line through the polygon produces an interior point, including holes.
 rings=f['geometry']['coordinates']; ys=[p[1] for p in rings[0]]
 best=None
 for fraction in (0.5,0.4,0.6,0.3,0.7):
  y=min(ys)+(max(ys)-min(ys))*fraction; hits=[]
  for ring in rings:
   for a,b in zip(ring,ring[1:]):
    if (a[1]>y)!=(b[1]>y): hits.append(a[0]+(y-a[1])*(b[0]-a[0])/(b[1]-a[1]))
  hits.sort()
  for lo,hi in zip(hits[::2],hits[1::2]):
   if best is None or hi-lo>best[0]:best=(hi-lo,(lo+hi)/2,y)
 if not best: continue
 sections.append(dict(object_id=p['OBJECTID'],global_id=p['GlobalID'],lot_code=p['Lot_Type'],permit_type=typ,end=end,latitude=round(best[2],6),longitude=round(best[1],6),source_description=desc))
Path('data/verified-byu-sections.json').write_text(json.dumps(sections,indent=2)+'\n')
print(len(sections))
