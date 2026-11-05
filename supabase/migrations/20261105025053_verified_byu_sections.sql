-- BYU GIS section import. Never delete or replace existing rules or personal rows.
BEGIN;
ALTER TABLE public.parking_area ADD COLUMN IF NOT EXISTS source_feature_id integer;
ALTER TABLE public.parking_area ADD COLUMN IF NOT EXISTS source_feature_global_id uuid;
CREATE UNIQUE INDEX IF NOT EXISTS parking_area_source_feature_global_id_key ON public.parking_area(source_feature_global_id);
CREATE TEMP TABLE section_input (object_id integer, global_id uuid, lot_code text, permit_type text, end_time time, latitude numeric, longitude numeric) ON COMMIT DROP;
INSERT INTO section_input VALUES
(2,'a569fc70-8846-484a-bacf-9fb526fef930','30G','G','16:00',40.245407,-111.645888),
(3,'48d1df7d-eb6e-4f6b-8f9d-22d80b673d92','23A','A','16:00',40.254307,-111.645493),
(5,'f7d80847-c46b-46d2-8bc1-9803dcabf3a7','59Y','Y','16:00',40.243791,-111.649072),
(6,'b6b9bac4-df31-4a6f-8666-2a27be84f928','56Y','Y','16:00',40.243813,-111.654271),
(11,'d4ad5a99-b6df-4cfb-9760-ab55f0f5cb24','23A','A','19:00',40.254705,-111.646371),
(12,'53f04b9a-2ca2-4aaa-b6b4-aec0f60a4de0','55A','A','16:00',40.245268,-111.64083),
(13,'9a6f8fb1-ac57-43cd-b2d6-a61b3bdddc5f','42A','A','19:00',40.264013,-111.65946),
(21,'0525ad1a-8ca1-4d2c-825d-b65840c1096a','59G','G','16:00',40.244109,-111.649076),
(22,'b340cddf-310c-4099-baee-798ee4143c95','30A','A','16:00',40.245641,-111.646045),
(24,'9a5ded43-79f3-475c-9bbd-0e15537f376c','56A','A','16:00',40.244117,-111.654252),
(25,'5b73ce80-cad2-4b53-9db3-66fbab93eb33','14A','A','19:00',40.249035,-111.650913),
(26,'3b577a4d-74c3-471e-bf10-09aca021f41b','32A','A','16:00',40.244814,-111.649298),
(29,'2576bc08-22fa-40c6-b933-303c48a909e2','20A','A','16:00',40.256497,-111.645572),
(30,'8879b4cb-c435-4e39-acdf-6a1b06b2bead','27A','A','16:00',40.249481,-111.644154),
(31,'4c94c069-7e48-47fb-b458-fa823202d6dc','27A','A','16:00',40.248746,-111.645123),
(33,'1a4d9fed-a957-4b2f-ad27-1a136695fe47','26A','A','16:00',40.247707,-111.644075),
(34,'22976fa0-1e2f-4647-8317-c97ebfceebaa','26G','G','16:00',40.248149,-111.643433),
(35,'2ca9e120-6c3e-411c-bdba-0277a2678ad7','28A','A','16:00',40.24701,-111.643952),
(37,'ca63df0d-b9c1-4ba8-a762-2434c79b4b76','26A','A','16:00',40.248013,-111.644868),
(41,'316def31-28bd-4c3a-92f7-722ea7e9a528','37Y','Y','16:00',40.247823,-111.657879),
(44,'a3cea0f9-0ab4-495a-92c4-bd4b5c1dc321','38Y','Y','16:00',40.247414,-111.656235),
(45,'a4ea0370-7a88-49be-8b5b-1c9616c18d10','38Y','Y','16:00',40.247289,-111.65603),
(46,'5c112c36-c99b-40eb-93d9-35d29f5ce077','53A','A','16:00',40.248903,-111.642605),
(56,'2aed1eef-75ff-4366-a9e1-337c6afc4f3c','53G','G','16:00',40.24868,-111.642041),
(58,'3a626e4a-4e21-45ee-b6ea-6df2fe0a8b04','2A','A','18:00',40.25118,-111.647182),
(59,'fe1867cd-15f5-49bd-90d6-d5f40f5df238','2A','A','18:00',40.251647,-111.648153),
(61,'8ca1c384-72f9-42ec-beaf-150a9f4df601','8A','A','19:00',40.247406,-111.645717),
(62,'2f4d4183-5006-43cc-9146-f26db39188b1','22G','G','16:00',40.252944,-111.647355),
(66,'a9cc91df-cf3f-40cd-95e1-9f7a17858804','15A','A','19:00',40.248344,-111.652284),
(71,'9a1ff93a-19e8-4a7e-a724-04db74d18d87','3A','A','16:00',40.249886,-111.646711),
(79,'ba45386f-2363-46e6-aa46-257f37562687','24A','A','19:00',40.254983,-111.644505),
(81,'1491bbb9-89da-4a98-b37f-db7a6d03859a','22A','A','16:00',40.254018,-111.647366),
(82,'8aba5e5d-7ae0-48b2-8a89-ae1c9c893b42','8A','A','19:00',40.247453,-111.644864),
(83,'615a5d27-8e0e-488c-8c7f-ceadfa8b7585','53A','A','16:00',40.249466,-111.642071),
(85,'d6b000b5-38a5-4b46-8d09-b1ccc8c39412','4A','A','19:00',40.247014,-111.647098),
(87,'e443c5bf-c7b0-416a-8ab7-291e6a3ef638','53G','G','16:00',40.249305,-111.641334),
(89,'1737e25e-daba-4d45-a305-8d84ed5a66c4','8A','A','19:00',40.247786,-111.645203),
(102,'1d22c6e7-f84b-4492-9dd7-6e26ff72b2a8','24A','A','19:00',40.256091,-111.642982),
(105,'a1f5b0dc-93fb-40ca-b973-da12ab036555','54A','A','19:00',40.262881,-111.658206),
(114,'5d13cfa7-fbb1-4a7f-baa4-5abbd2f62eed','24A','A','19:00',40.256733,-111.642208),
(115,'aca278ed-6f7e-4e80-bb91-aebf60e33253','24Y','Y','16:00',40.255602,-111.642561),
(117,'7260cc0a-d747-42ad-9694-7a98dcaf6de7','50Y','Y','16:00',40.257979,-111.645214),
(118,'67142359-d237-46e0-bf93-99ce5cf65536','50A','A','16:00',40.257271,-111.64514),
(119,'88305d29-a927-4f29-aeec-5a5ad8be4004','50A','A','16:00',40.257496,-111.645576),
(120,'af1d03d9-1b5d-43a8-b7fd-10f061dffab0','50A','A','16:00',40.257645,-111.646802),
(123,'d06101a9-ec47-49df-9650-ea02ef117529','20Y','Y','16:00',40.256076,-111.647258),
(125,'13816962-ab60-41df-862b-e3da450735f5','19Y','Y','16:00',40.255636,-111.648799),
(126,'62f0a860-6eff-4e6f-befe-c5216976f027','19A','A','16:00',40.255546,-111.649204),
(127,'1d463e73-556d-43ab-a3cb-a0942bc440b0','19Y','Y','16:00',40.255425,-111.649843),
(128,'ae40cd5e-728d-49cd-aa0c-c325e05a6c3c','22G','G','16:00',40.252986,-111.6495),
(129,'6f968b54-34dc-4b12-8a6c-b1ae5b812c38','31A','A','16:00',40.245397,-111.64703),
(130,'38d757a7-5f9e-4334-9373-1c2fc784a657','31G','G','16:00',40.245288,-111.646978),
(132,'e64a6ab6-8320-4ba2-a19d-f85ac3d94c6a','6A','A','19:00',40.245632,-111.647172),
(134,'27d6229c-bb13-441c-816f-edb4e1735c21','5A','A','19:00',40.246184,-111.646326),
(135,'270621b8-0253-4fa0-9d52-44a792c1c36b','33A','A','16:00',40.2441,-111.650753),
(136,'bf558fc0-e7ca-4301-b473-f02bddf19761','33Y','Y','16:00',40.243674,-111.651164),
(137,'9fbd00c5-3aed-4b7a-adc1-2c378f7f798a','33G','G','16:00',40.24415,-111.651191),
(140,'17ca2c3f-504e-4bd7-9d36-9894771ea1d4','7A','A','19:00',40.246173,-111.649923),
(141,'5a997f4d-efef-4246-bf24-ee5d3fe92a35','12A','A','19:00',40.246249,-111.653188),
(142,'a5038811-0525-4784-bbfd-0d61aa343989','13A','A','19:00',40.246917,-111.652191),
(143,'cb8e57df-1556-48c9-b6d9-1bd11ee10fc0','17A','A','19:00',40.249792,-111.651469),
(145,'3592335d-ee8a-4444-9211-bdaa1832049b','17A','A','19:00',40.250103,-111.651366),
(146,'4d6428bc-cc57-4512-a656-8bef4b882253','16A','A','19:00',40.250751,-111.650684),
(147,'31cf4855-950d-438c-af16-2cf54fa3e9dc','1A','A','19:00',40.251922,-111.648828),
(149,'4fef7e39-91a0-491e-96b7-a3b9b554a54e','16A','A','19:00',40.251662,-111.650516),
(151,'7f2ddcd9-a61b-4220-be6a-11a7dadd5eb4','57Y','Y','16:00',40.243341,-111.656488),
(152,'7f44d201-c24f-49ff-b288-21972c33f088','34Y','Y','16:00',40.244783,-111.65566),
(153,'698f7f52-ea31-4bfc-8101-cd0b061d3446','46Y','Y','16:00',40.247325,-111.66142),
(154,'01dd6eb6-0e12-4a87-8f89-c98463ecd1b0','46A','A','16:00',40.247501,-111.660366),
(155,'a46ef394-6de9-4ac9-968f-45eda60a8874','46A','A','16:00',40.246829,-111.6598),
(156,'da465c7c-699d-4002-a034-e5e56ac63992','36Y','Y','16:00',40.246447,-111.656726),
(157,'2ead36c2-68bf-4fe0-8496-a1faf1afb141','37Y','Y','16:00',40.247864,-111.656806),
(158,'041cf2ae-3ec0-4c24-9a16-234bb8940b1c','38A','A','19:00',40.247866,-111.65517),
(159,'2bb48aec-bf12-43b0-a0c5-935a81e7e279','37Y','Y','16:00',40.248411,-111.657211),
(160,'cbe69e91-f030-4aa5-8d24-5f1e86397630','37A','A','16:00',40.248761,-111.656151),
(161,'c60e1c94-02d9-4f7a-b513-e16e43d6608c','37Y','Y','16:00',40.249622,-111.656332),
(162,'63de00d7-cf11-4991-9b48-58fde01f1533','39A','A','16:00',40.249263,-111.654328),
(163,'8b4cbfaa-f5cb-4e3f-8cc9-988cb095bb83','39G','G','16:00',40.250133,-111.65452),
(164,'4f2d5966-bd9a-4314-8a56-d6a7207448ff','40A','A','16:00',40.250137,-111.652909),
(165,'7433d632-d337-43d0-be72-b9d4fcd1b055','46Y','Y','16:00',40.248379,-111.658944),
(166,'73f7da6c-8c10-4899-a31a-8cf5fa5a23a1','46Y','Y','16:00',40.250062,-111.659523),
(167,'08e3cc70-673d-4ad3-b282-70bbc3570d40','18U','U',NULL,40.2515,-111.657362),
(169,'a4221937-3029-4508-9ccb-ff6568aaf54c','40G','G','16:00',40.250666,-111.653529),
(170,'9da1927e-9307-4831-9d26-89f2479a72d2','40A','A','16:00',40.250899,-111.652816),
(171,'9695d239-cb1e-42e4-9cae-4ae4f246d443','40G','G','16:00',40.251263,-111.65251),
(180,'882d82e6-697f-438c-82f5-2d15bee32561','58Y','Y','16:00',40.252251,-111.656793),
(181,'ff8d032e-2d24-4719-9849-d131dbb4e0a5','58A','A','16:00',40.252242,-111.658141),
(183,'82a4897f-9329-4dba-8c23-faf721a2ae8d','58A','A','16:00',40.252827,-111.656865),
(184,'409aa9b8-d023-4970-84bd-a49e5eb67445','58A','A','16:00',40.253702,-111.658123),
(186,'8baebc68-8081-4bbf-a409-3f6aca666e0d','49Y','Y','16:00',40.256139,-111.652158),
(187,'fe0d4309-596b-478e-b215-a18a9afd97b9','48Y','Y','16:00',40.256197,-111.654622),
(188,'b01f1901-311d-469c-a131-6ae44723832e','45Y','Y','16:00',40.256159,-111.657052),
(189,'553672cd-1855-4638-9381-119920cec563','45A','A','16:00',40.256531,-111.657578),
(191,'554c9da4-a690-4b24-8345-a62d73a26608','45U','U',NULL,40.258529,-111.6573),
(192,'69614725-fd50-4cc2-a77d-37d8a5a3b832','45Y','Y','16:00',40.257291,-111.658329),
(193,'6a9f870b-6735-4560-915d-f4d139ced3ff','47Y','Y','16:00',40.258165,-111.652825),
(194,'da2404e3-94e8-49dd-a399-a1536a774729','62Y','Y','16:00',40.259162,-111.654979),
(195,'9b2eac38-2c60-42f7-9db8-f850fae25298','44U','U',NULL,40.258888,-111.660009),
(196,'3cb133f1-8e82-4f9e-89b4-5ab21ac59474','61Y','Y','16:00',40.265311,-111.656377),
(197,'4ad64e74-9618-4e46-bc6d-8b9328d250a4','61Y','Y','16:00',40.263558,-111.657392),
(209,'dde4a9a4-049b-4765-8035-4df09516f438','33Y','Y','16:00',40.243542,-111.650475),
(210,'0a28681f-9509-4463-b14d-fc6565548d34','33A','A','16:00',40.243244,-111.650803);
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
