import json,glob
from pathlib import Path
rows=json.loads(Path('data/verified-byu-sections.json').read_text())
values=[]
for r in rows:
 vals=[r['object_id'],r['global_id'],r['lot_code'],r['permit_type'],r['end'],r['latitude'],r['longitude']]
 values.append('('+','.join('NULL' if x is None else str(x) if isinstance(x,(int,float)) else "'"+x.replace("'","''")+"'" for x in vals)+')')
header='''-- BYU GIS section import. Never delete or replace existing rules or personal rows.
BEGIN;
ALTER TABLE public.parking_area ADD COLUMN IF NOT EXISTS source_feature_id integer;
ALTER TABLE public.parking_area ADD COLUMN IF NOT EXISTS source_feature_global_id uuid;
CREATE UNIQUE INDEX IF NOT EXISTS parking_area_source_feature_global_id_key ON public.parking_area(source_feature_global_id);
CREATE TEMP TABLE section_input (object_id integer, global_id uuid, lot_code text, permit_type text, end_time time, latitude numeric, longitude numeric) ON COMMIT DROP;
INSERT INTO section_input VALUES\n'''
body=''';
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM (VALUES ('59Y',5),('30G',2),('14A',25),('18U',167)) e(code,oid) WHERE (SELECT count(*) FROM public.parking_area a WHERE a.operator='BYU' AND a.lot_code=e.code AND NOT a.is_sample_data) <> 1) THEN
  RAISE EXCEPTION 'Existing verified lots require manual reconciliation';
 END IF;
 IF (SELECT count(*) FROM public.permit WHERE permit_code IN ('A','G','Y','U','B','C','D','YM','YV')) <> 9 THEN RAISE EXCEPTION 'Required permits missing'; END IF;
END $$;
-- Attach identities to existing verified rows without touching their rules, names, or references.
UPDATE public.parking_area a SET source_feature_id=s.object_id,source_feature_global_id=s.global_id
FROM section_input s WHERE (s.object_id IN (5,2,25,167)) AND a.operator='BYU' AND a.lot_code=s.lot_code AND NOT a.is_sample_data AND a.source_feature_id IS NULL AND a.source_feature_global_id IS NULL;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM section_input s LEFT JOIN public.parking_area a ON a.source_feature_global_id=s.global_id WHERE s.object_id IN (5,2,25,167) AND (a.area_id IS NULL OR a.source_feature_id IS DISTINCT FROM s.object_id OR a.lot_code IS DISTINCT FROM s.lot_code)) THEN RAISE EXCEPTION 'Existing feature identity mismatch'; END IF;
END $$;
CREATE TEMP TABLE new_sections (area_id integer, object_id integer, permit_type text, end_time time) ON COMMIT DROP;
WITH inserted AS (
 INSERT INTO public.parking_area(area_name,lot_code,operator,latitude,longitude,total_spaces,est_available_spaces,availability_updated_at,is_free,tow_company_id,is_sample_data,source_feature_id,source_feature_global_id)
 SELECT 'BYU Lot '||s.lot_code||' (section '||s.object_id||')',s.lot_code,'BYU',s.latitude,s.longitude,NULL,NULL,NULL,s.permit_type='U',NULL,false,s.object_id,s.global_id FROM section_input s
 ON CONFLICT (source_feature_global_id) DO NOTHING
 RETURNING area_id,source_feature_id
)
INSERT INTO new_sections SELECT i.area_id,s.object_id,s.permit_type,s.end_time FROM inserted i JOIN section_input s ON s.object_id=i.source_feature_id;
-- Rules cover ordinary car stalls under the regular fall/winter week; confirm actual signs and vehicle registration.
INSERT INTO public.parking_rule(area_id,permit_id,days_of_week,start_time,end_time,blocked_start,blocked_end,vehicle_type,source_url,last_verified_on,rule_note)
SELECT n.area_id,NULL,'All','01:00','04:59','01:00','05:00','car','https://security.byu.edu/parking-regulations',DATE '2026-11-04','Overnight parking prohibited 01:00–05:00 for ordinary non-housing parking; exceptions may apply.' FROM new_sections n;
INSERT INTO public.parking_rule(area_id,permit_id,days_of_week,start_time,end_time,blocked_start,blocked_end,vehicle_type,source_url,last_verified_on,rule_note)
SELECT n.area_id,p.permit_id,'Mon-Fri',CASE WHEN n.permit_type='U' THEN '00:00'::time ELSE '07:00'::time END,CASE WHEN n.permit_type='U' THEN '23:59'::time ELSE n.end_time - interval '1 minute' END,CASE WHEN n.permit_type='U' THEN '01:00'::time ELSE NULL END,CASE WHEN n.permit_type='U' THEN '05:00'::time ELSE NULL END,'car','https://services.arcgis.com/FvF9MZKp3JWPrSkg/arcgis/rest/services/Campus_Parking_Lots/FeatureServer/0/'||n.object_id,DATE '2026-11-04','Ordinary stalls only. BYU vehicle registration and active privileges required. Check posted signs, specialty stalls, events, holidays, finals, and academic breaks. Privileges: https://security.byu.edu/parking-regulations' FROM new_sections n JOIN public.permit p ON (n.permit_type='A' AND p.permit_code='A') OR (n.permit_type='G' AND p.permit_code IN ('A','G')) OR (n.permit_type='Y' AND p.permit_code IN ('A','G','Y','YM','YV')) OR (n.permit_type='U' AND p.permit_code IN ('A','G','Y','U','B','C','D','YM','YV'));
INSERT INTO public.parking_rule(area_id,permit_id,days_of_week,start_time,end_time,blocked_start,blocked_end,vehicle_type,source_url,last_verified_on,rule_note)
SELECT n.area_id,NULL,'Mon-Fri','00:00','06:59','01:00','05:00','car','https://services.arcgis.com/FvF9MZKp3JWPrSkg/arcgis/rest/services/Campus_Parking_Lots/FeatureServer/0/'||n.object_id,DATE '2026-11-04','Ordinary stalls: no permit restriction listed outside weekday hours; overnight restriction applies. Check signs.' FROM new_sections n WHERE n.permit_type<>'U';
INSERT INTO public.parking_rule(area_id,permit_id,days_of_week,start_time,end_time,vehicle_type,source_url,last_verified_on,rule_note)
SELECT n.area_id,NULL,'Mon-Fri',n.end_time,'23:59','car','https://services.arcgis.com/FvF9MZKp3JWPrSkg/arcgis/rest/services/Campus_Parking_Lots/FeatureServer/0/'||n.object_id,DATE '2026-11-04','Ordinary stalls: no permit restriction listed after weekday hours. Check signs and exceptions.' FROM new_sections n WHERE n.permit_type<>'U';
-- Weekend visitor rules have exceptions and cannot establish a given driver's eligibility. Leave them unknown.
COMMIT;
'''
file=glob.glob('supabase/migrations/*_verified_byu_sections.sql')[0]
Path(file).write_text(header+',\n'.join(values)+body)
