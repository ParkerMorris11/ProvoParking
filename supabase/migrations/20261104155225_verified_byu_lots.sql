-- Four lots verified 2026-11-04 from the parking layer published by map.byu.edu/scripts/main.js.
-- BYU Parking Rules and Regulations, released July 23, 2026: https://security.byu.edu/parking-regulations
-- See docs/verified-byu-lots.md for provenance and weekly-schedule limitations.
-- Retains every existing sample area, favorite, and session. No access-policy changes.
BEGIN;
ALTER TABLE public.parking_area ADD COLUMN IF NOT EXISTS is_sample_data boolean NOT NULL DEFAULT true;
ALTER TABLE public.parking_area ALTER COLUMN total_spaces DROP NOT NULL;
COMMENT ON COLUMN public.parking_area.total_spaces IS 'NULL when capacity is not verified; never substitute zero for unknown.';
COMMENT ON COLUMN public.parking_area.is_sample_data IS 'Legacy samples remain for historical references; primary results show false rows.';
DO $$
DECLARE v_area integer;
BEGIN
  IF (SELECT count(*) FROM public.permit WHERE permit_code IN ('A','G','Y','U','B','C','D','YM','YV')) <> 9 THEN
    RAISE EXCEPTION 'Expected the existing nine BYU permit codes before adding verified lots';
  END IF;
  IF EXISTS(SELECT 1 FROM public.parking_area WHERE operator='BYU' AND lot_code IN ('59Y','30G','14A','18U') GROUP BY lot_code HAVING count(*)>1) THEN
    RAISE EXCEPTION 'Duplicate real lot codes require review';
  END IF;

  SELECT area_id INTO v_area FROM public.parking_area WHERE operator='BYU' AND lot_code='59Y';
  IF v_area IS NULL THEN
    INSERT INTO public.parking_area(area_name,lot_code,operator,latitude,longitude,total_spaces,est_available_spaces,availability_updated_at,is_free,tow_company_id,is_sample_data)
    VALUES('BYU Lot 59Y','59Y','BYU',40.243896,-111.649081,NULL,NULL,NULL,false,NULL,false) RETURNING area_id INTO v_area;
  ELSE
    UPDATE public.parking_area SET area_name='BYU Lot 59Y',latitude=40.243896,longitude=-111.649081,total_spaces=NULL,est_available_spaces=NULL,availability_updated_at=NULL,is_free=false,tow_company_id=NULL,is_sample_data=false WHERE area_id=v_area;
  END IF;
  -- Only replace rules managed for this real lot; sample rows and personal references remain.
  DELETE FROM public.parking_rule WHERE area_id=v_area;
  INSERT INTO public.parking_rule(area_id,permit_id,days_of_week,start_time,end_time,blocked_start,blocked_end,vehicle_type,source_url,last_verified_on,rule_note)
    VALUES(v_area,NULL,'All','01:00'::time,'04:59'::time,'01:00'::time,'05:00'::time,'car','https://security.byu.edu/parking-regulations',DATE '2026-11-04','Overnight parking prohibited 01:00–05:00. Ordinary non-housing lot; BYU-owned vehicles and arranged exceptions are outside this app check.');
  INSERT INTO public.parking_rule(area_id,permit_id,days_of_week,start_time,end_time,blocked_start,blocked_end,vehicle_type,source_url,last_verified_on,rule_note)
    SELECT v_area,permit_id,'Mon-Fri','07:00'::time,'15:59'::time,NULL,NULL,'car','https://services.arcgis.com/FvF9MZKp3JWPrSkg/arcgis/rest/services/Campus_Parking_Lots/FeatureServer/0/5',DATE '2026-11-04','Ordinary car stalls only; vehicle must be registered and active with BYU. Regular fall/winter weekly schedule; posted signs, event closures, holidays, finals and academic breaks can override it. Permit privileges: https://security.byu.edu/parking-regulations' FROM public.permit WHERE permit_code IN ('A','G','Y','YM','YV');
  INSERT INTO public.parking_rule(area_id,permit_id,days_of_week,start_time,end_time,blocked_start,blocked_end,vehicle_type,source_url,last_verified_on,rule_note)
    VALUES(v_area,NULL,'Mon-Fri','00:00'::time,'06:59'::time,'01:00'::time,'05:00'::time,'car','https://services.arcgis.com/FvF9MZKp3JWPrSkg/arcgis/rest/services/Campus_Parking_Lots/FeatureServer/0/5',DATE '2026-11-04','Ordinary stalls: no permit restriction outside recorded weekday enforcement hours. Overnight ban still applies. Check posted signs and calendar exceptions.');
  INSERT INTO public.parking_rule(area_id,permit_id,days_of_week,start_time,end_time,blocked_start,blocked_end,vehicle_type,source_url,last_verified_on,rule_note)
    VALUES(v_area,NULL,'Mon-Fri','16:00'::time,'23:59'::time,NULL,NULL,'car','https://services.arcgis.com/FvF9MZKp3JWPrSkg/arcgis/rest/services/Campus_Parking_Lots/FeatureServer/0/5',DATE '2026-11-04','Ordinary stalls: no permit restriction after recorded enforcement hours. Check posted signs and calendar exceptions.');
  INSERT INTO public.parking_rule(area_id,permit_id,days_of_week,start_time,end_time,blocked_start,blocked_end,vehicle_type,source_url,last_verified_on,rule_note)
    VALUES(v_area,NULL,'Sat,Sun','00:00'::time,'23:59'::time,'01:00'::time,'05:00'::time,'car','https://security.byu.edu/parking-regulations',DATE '2026-11-04','Ordinary stalls on normal weekends: visitors may park; overnight ban remains. Finals/reading days, holidays and events require checking current signs.');

  SELECT area_id INTO v_area FROM public.parking_area WHERE operator='BYU' AND lot_code='30G';
  IF v_area IS NULL THEN
    INSERT INTO public.parking_area(area_name,lot_code,operator,latitude,longitude,total_spaces,est_available_spaces,availability_updated_at,is_free,tow_company_id,is_sample_data)
    VALUES('BYU Lot 30G','30G','BYU',40.245261,-111.646052,NULL,NULL,NULL,false,NULL,false) RETURNING area_id INTO v_area;
  ELSE
    UPDATE public.parking_area SET area_name='BYU Lot 30G',latitude=40.245261,longitude=-111.646052,total_spaces=NULL,est_available_spaces=NULL,availability_updated_at=NULL,is_free=false,tow_company_id=NULL,is_sample_data=false WHERE area_id=v_area;
  END IF;
  -- Only replace rules managed for this real lot; sample rows and personal references remain.
  DELETE FROM public.parking_rule WHERE area_id=v_area;
  INSERT INTO public.parking_rule(area_id,permit_id,days_of_week,start_time,end_time,blocked_start,blocked_end,vehicle_type,source_url,last_verified_on,rule_note)
    VALUES(v_area,NULL,'All','01:00'::time,'04:59'::time,'01:00'::time,'05:00'::time,'car','https://security.byu.edu/parking-regulations',DATE '2026-11-04','Overnight parking prohibited 01:00–05:00. Ordinary non-housing lot; BYU-owned vehicles and arranged exceptions are outside this app check.');
  INSERT INTO public.parking_rule(area_id,permit_id,days_of_week,start_time,end_time,blocked_start,blocked_end,vehicle_type,source_url,last_verified_on,rule_note)
    SELECT v_area,permit_id,'Mon-Fri','07:00'::time,'15:59'::time,NULL,NULL,'car','https://services.arcgis.com/FvF9MZKp3JWPrSkg/arcgis/rest/services/Campus_Parking_Lots/FeatureServer/0/2',DATE '2026-11-04','Ordinary car stalls only; vehicle must be registered and active with BYU. Regular fall/winter weekly schedule; posted signs, event closures, holidays, finals and academic breaks can override it. Permit privileges: https://security.byu.edu/parking-regulations' FROM public.permit WHERE permit_code IN ('A','G');
  INSERT INTO public.parking_rule(area_id,permit_id,days_of_week,start_time,end_time,blocked_start,blocked_end,vehicle_type,source_url,last_verified_on,rule_note)
    VALUES(v_area,NULL,'Mon-Fri','00:00'::time,'06:59'::time,'01:00'::time,'05:00'::time,'car','https://services.arcgis.com/FvF9MZKp3JWPrSkg/arcgis/rest/services/Campus_Parking_Lots/FeatureServer/0/2',DATE '2026-11-04','Ordinary stalls: no permit restriction outside recorded weekday enforcement hours. Overnight ban still applies. Check posted signs and calendar exceptions.');
  INSERT INTO public.parking_rule(area_id,permit_id,days_of_week,start_time,end_time,blocked_start,blocked_end,vehicle_type,source_url,last_verified_on,rule_note)
    VALUES(v_area,NULL,'Mon-Fri','16:00'::time,'23:59'::time,NULL,NULL,'car','https://services.arcgis.com/FvF9MZKp3JWPrSkg/arcgis/rest/services/Campus_Parking_Lots/FeatureServer/0/2',DATE '2026-11-04','Ordinary stalls: no permit restriction after recorded enforcement hours. Check posted signs and calendar exceptions.');
  INSERT INTO public.parking_rule(area_id,permit_id,days_of_week,start_time,end_time,blocked_start,blocked_end,vehicle_type,source_url,last_verified_on,rule_note)
    VALUES(v_area,NULL,'Sat,Sun','00:00'::time,'23:59'::time,'01:00'::time,'05:00'::time,'car','https://security.byu.edu/parking-regulations',DATE '2026-11-04','Ordinary stalls on normal weekends: visitors may park; overnight ban remains. Finals/reading days, holidays and events require checking current signs.');

  SELECT area_id INTO v_area FROM public.parking_area WHERE operator='BYU' AND lot_code='14A';
  IF v_area IS NULL THEN
    INSERT INTO public.parking_area(area_name,lot_code,operator,latitude,longitude,total_spaces,est_available_spaces,availability_updated_at,is_free,tow_company_id,is_sample_data)
    VALUES('BYU Lot 14A','14A','BYU',40.249006,-111.650913,NULL,NULL,NULL,false,NULL,false) RETURNING area_id INTO v_area;
  ELSE
    UPDATE public.parking_area SET area_name='BYU Lot 14A',latitude=40.249006,longitude=-111.650913,total_spaces=NULL,est_available_spaces=NULL,availability_updated_at=NULL,is_free=false,tow_company_id=NULL,is_sample_data=false WHERE area_id=v_area;
  END IF;
  -- Only replace rules managed for this real lot; sample rows and personal references remain.
  DELETE FROM public.parking_rule WHERE area_id=v_area;
  INSERT INTO public.parking_rule(area_id,permit_id,days_of_week,start_time,end_time,blocked_start,blocked_end,vehicle_type,source_url,last_verified_on,rule_note)
    VALUES(v_area,NULL,'All','01:00'::time,'04:59'::time,'01:00'::time,'05:00'::time,'car','https://security.byu.edu/parking-regulations',DATE '2026-11-04','Overnight parking prohibited 01:00–05:00. Ordinary non-housing lot; BYU-owned vehicles and arranged exceptions are outside this app check.');
  INSERT INTO public.parking_rule(area_id,permit_id,days_of_week,start_time,end_time,blocked_start,blocked_end,vehicle_type,source_url,last_verified_on,rule_note)
    SELECT v_area,permit_id,'Mon-Fri','07:00'::time,'18:59'::time,NULL,NULL,'car','https://services.arcgis.com/FvF9MZKp3JWPrSkg/arcgis/rest/services/Campus_Parking_Lots/FeatureServer/0/25',DATE '2026-11-04','Ordinary car stalls only; vehicle must be registered and active with BYU. Regular fall/winter weekly schedule; posted signs, event closures, holidays, finals and academic breaks can override it. Permit privileges: https://security.byu.edu/parking-regulations' FROM public.permit WHERE permit_code IN ('A');
  INSERT INTO public.parking_rule(area_id,permit_id,days_of_week,start_time,end_time,blocked_start,blocked_end,vehicle_type,source_url,last_verified_on,rule_note)
    VALUES(v_area,NULL,'Mon-Fri','00:00'::time,'06:59'::time,'01:00'::time,'05:00'::time,'car','https://services.arcgis.com/FvF9MZKp3JWPrSkg/arcgis/rest/services/Campus_Parking_Lots/FeatureServer/0/25',DATE '2026-11-04','Ordinary stalls: no permit restriction outside recorded weekday enforcement hours. Overnight ban still applies. Check posted signs and calendar exceptions.');
  INSERT INTO public.parking_rule(area_id,permit_id,days_of_week,start_time,end_time,blocked_start,blocked_end,vehicle_type,source_url,last_verified_on,rule_note)
    VALUES(v_area,NULL,'Mon-Fri','19:00'::time,'23:59'::time,NULL,NULL,'car','https://services.arcgis.com/FvF9MZKp3JWPrSkg/arcgis/rest/services/Campus_Parking_Lots/FeatureServer/0/25',DATE '2026-11-04','Ordinary stalls: no permit restriction after recorded enforcement hours. Check posted signs and calendar exceptions.');
  INSERT INTO public.parking_rule(area_id,permit_id,days_of_week,start_time,end_time,blocked_start,blocked_end,vehicle_type,source_url,last_verified_on,rule_note)
    VALUES(v_area,NULL,'Sat,Sun','00:00'::time,'23:59'::time,'01:00'::time,'05:00'::time,'car','https://security.byu.edu/parking-regulations',DATE '2026-11-04','Ordinary stalls on normal weekends: visitors may park; overnight ban remains. Finals/reading days, holidays and events require checking current signs.');

  SELECT area_id INTO v_area FROM public.parking_area WHERE operator='BYU' AND lot_code='18U';
  IF v_area IS NULL THEN
    INSERT INTO public.parking_area(area_name,lot_code,operator,latitude,longitude,total_spaces,est_available_spaces,availability_updated_at,is_free,tow_company_id,is_sample_data)
    VALUES('BYU Lot 18U','18U','BYU',40.2513,-111.657363,NULL,NULL,NULL,true,NULL,false) RETURNING area_id INTO v_area;
  ELSE
    UPDATE public.parking_area SET area_name='BYU Lot 18U',latitude=40.2513,longitude=-111.657363,total_spaces=NULL,est_available_spaces=NULL,availability_updated_at=NULL,is_free=true,tow_company_id=NULL,is_sample_data=false WHERE area_id=v_area;
  END IF;
  -- Only replace rules managed for this real lot; sample rows and personal references remain.
  DELETE FROM public.parking_rule WHERE area_id=v_area;
  INSERT INTO public.parking_rule(area_id,permit_id,days_of_week,start_time,end_time,blocked_start,blocked_end,vehicle_type,source_url,last_verified_on,rule_note)
    VALUES(v_area,NULL,'All','01:00'::time,'04:59'::time,'01:00'::time,'05:00'::time,'car','https://security.byu.edu/parking-regulations',DATE '2026-11-04','Overnight parking prohibited 01:00–05:00. Ordinary non-housing lot; BYU-owned vehicles and arranged exceptions are outside this app check.');
  INSERT INTO public.parking_rule(area_id,permit_id,days_of_week,start_time,end_time,blocked_start,blocked_end,vehicle_type,source_url,last_verified_on,rule_note)
    SELECT v_area,permit_id,'Mon-Fri','00:00'::time,'23:59'::time,'01:00'::time,'05:00'::time,'car','https://services.arcgis.com/FvF9MZKp3JWPrSkg/arcgis/rest/services/Campus_Parking_Lots/FeatureServer/0/167',DATE '2026-11-04','Ordinary car stalls only; vehicle must be registered and active with BYU. Regular fall/winter weekly schedule; posted signs, event closures, holidays, finals and academic breaks can override it. Permit privileges: https://security.byu.edu/parking-regulations Free parking does not waive vehicle registration.' FROM public.permit WHERE permit_code IN ('A','G','Y','U','B','C','D','YM','YV');
  INSERT INTO public.parking_rule(area_id,permit_id,days_of_week,start_time,end_time,blocked_start,blocked_end,vehicle_type,source_url,last_verified_on,rule_note)
    VALUES(v_area,NULL,'Sat,Sun','00:00'::time,'23:59'::time,'01:00'::time,'05:00'::time,'car','https://security.byu.edu/parking-regulations',DATE '2026-11-04','Ordinary stalls on normal weekends: visitors may park; overnight ban remains. Finals/reading days, holidays and events require checking current signs.');
END $$;
COMMIT;
