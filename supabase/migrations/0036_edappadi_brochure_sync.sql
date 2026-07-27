-- 0036 — Map the official Edappadi brochure ("Edappadi brochure (1).pdf",
-- 12 pp, 27-07-2026) into Jamin Garden — Edappadi. Data only; every value
-- below is printed in the brochure (or, where noted, measured from OSM).
-- Media uploaded to property-media/jamin-new-project-2026/docs/:
--   brochure (web-optimized 2.7 MB), DTCP layout page (2x enhanced), location map.
-- The project is DTCP-approved and "Ready for Immediate House Construction",
-- so it moves from Upcoming to Ongoing and drops "(Coming Soon)".
update public.properties
   set title            = 'Jamin Garden — Edappadi',
       project_phase    = 'ongoing',
       description      = 'Jamin Garden — Edappadi is a premium DTCP-approved residential plotted development by Jamin Property Developers, just 300 metres from the Edappadi Bypass in Salem district. Wide 30 & 40 ft internal roads, common water supply, clear & marketable title and bank loan assistance — ready for immediate house construction. 3 minutes to Edappadi Bus Stand with excellent connectivity to Salem, Erode and Sankagiri. Site development is in progress — watch live photos and videos here; the plot schedule and pricing will be published shortly.',
       brochure_url     = 'https://zmxqozvivdluuxvvcegs.supabase.co/storage/v1/object/public/property-media/jamin-new-project-2026/docs/jamin-garden-edappadi-brochure.pdf',
       master_plan_url  = 'https://zmxqozvivdluuxvvcegs.supabase.co/storage/v1/object/public/property-media/jamin-new-project-2026/docs/dtcp-layout-plan.png',
       documents        = jsonb_build_array(
         jsonb_build_object('label','Project Brochure (12 pages, Jul 2026)','url','https://zmxqozvivdluuxvvcegs.supabase.co/storage/v1/object/public/property-media/jamin-new-project-2026/docs/jamin-garden-edappadi-brochure.pdf','size','2.7 MB'),
         jsonb_build_object('label','DTCP Approved Layout Plan','url','https://zmxqozvivdluuxvvcegs.supabase.co/storage/v1/object/public/property-media/jamin-new-project-2026/docs/dtcp-layout-plan.png','size','1.2 MB'),
         jsonb_build_object('label','Location Map — Edappadi','url','https://zmxqozvivdluuxvvcegs.supabase.co/storage/v1/object/public/property-media/jamin-new-project-2026/docs/location-map.png','size','0.2 MB')
       ),
       amenities        = '["DTCP Approved Layout","Wide 30 & 40 Ft Internal Roads","Common Water Supply to All Plots","Clear Title Property","300 Metres from Edappadi Bypass","Ready for Immediate House Construction","Bank Loan Assistance","Near Schools & Hospitals"]'::jsonb,
       approvals        = '{"dtcp": true}'::jsonb,
       title_status     = 'Clear & marketable title',
       encumbrance_status = 'Zero encumbrances (marketable title)',
       road_frontage    = '30 & 40 ft internal roads · 300 m from Edappadi Bypass',
       loan_eligible    = true,
       loan_details     = 'Bank loan assistance available',
       utilities        = jsonb_build_object(
         'water', 'Common water supply to all plots',
         'roads', 'Wide 30 & 40 feet internal black-top roads'
       ),
       investment       = jsonb_build_object(
         'appreciation', 'High appreciation & future growth — rapidly growing Edappadi region',
         'notes', 'DTCP-approved layout; growing industries and civic expansion drive property demand (brochure investment analysis)'
       ),
       nearby_places    = jsonb_build_array(
         -- connectivity (brochure p9)
         jsonb_build_object('name','Edappadi Bypass','distance','300 metres','category','Connectivity'),
         jsonb_build_object('name','Edappadi Bus Stand','distance','3 minutes','category','Transport'),
         jsonb_build_object('name','Salem city','category','Connectivity'),
         jsonb_build_object('name','Erode','category','Connectivity'),
         jsonb_build_object('name','Sankagiri','category','Connectivity'),
         -- education (brochure p6/p10)
         jsonb_build_object('name','Government Arts & Science College','category','College'),
         jsonb_build_object('name','Vivekanandha College for Women','category','College'),
         jsonb_build_object('name','Rakshan Polytechnic','category','College'),
         jsonb_build_object('name','Universal Public School','category','School'),
         jsonb_build_object('name','Kalaimagal Vidhyashramam School','category','School'),
         jsonb_build_object('name','Saraswathi School','category','School'),
         jsonb_build_object('name','Bharathi School','category','School'),
         jsonb_build_object('name','Wisdom Matric Hr. Sec. School','distance','1.2 km','category','School'),
         jsonb_build_object('name','Amala Matriculation Hr. Sec. School','distance','4.5 km','category','School'),
         -- healthcare (brochure p10 + OSM distances where measured)
         jsonb_build_object('name','Government Hospital, Edappadi','distance','2.0 km','category','Healthcare'),
         jsonb_build_object('name','Akshan Polyclinic','category','Healthcare'),
         jsonb_build_object('name','Arthik Medical Centre','category','Healthcare'),
         jsonb_build_object('name','S.P. Eye Clinic & Jayanth ENT','distance','1.1 km','category','Healthcare'),
         jsonb_build_object('name','SKM Hospital','distance','1.6 km','category','Healthcare'),
         jsonb_build_object('name','Aravind Hospital','distance','2.5 km','category','Healthcare')
       ),
       seo = jsonb_build_object(
         'title', 'Jamin Garden Edappadi — DTCP Approved Plots near Edappadi Bypass, Salem',
         'description', 'Premium DTCP-approved residential plots 300 m from Edappadi Bypass, Salem district. 30 & 40 ft roads, common water supply, clear title, bank loan assistance. By Jamin Property Developers.'
       )
 where slug = 'jamin-new-project-jul-2026';
