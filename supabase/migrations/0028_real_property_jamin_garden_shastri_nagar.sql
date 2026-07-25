-- 0028 — Real listing: Jamin Garden, Shastri Nagar (Erode).
-- Data only; no schema change. Applied to zmxqozvivdluuxvvcegs on 2026-07-25.
--
-- Every value below comes from the official brochure (plan-details.pdf, 12pp)
-- or jaminproperties.com. Nothing is invented. In particular `price` is left
-- NULL because the brochure quotes no figure — the app renders that as
-- "On request" rather than showing a made-up number to a buyer.
--
-- Media is the owner's own site photography (11 stills + 1 walkthrough video),
-- enhanced and uploaded to the property-media bucket. The phone's burned-in
-- "vivo X200 FE" watermark was cropped; nothing else about the land was altered.
--
-- The 16-plot schedule was read off the DTCP layout page. Its sizes sum to
-- exactly 26,727 sq.ft, matching the brochure's stated total extent — that
-- equality is the check that the schedule was parsed correctly.
--
-- Everything here is ordinary column data, so the admin can edit any of it from
-- the console without a code change.

-- 1. retire the demo listings (archived, not deleted, so nothing is lost)
update public.properties
   set status = 'archived', is_featured = false
 where title in (
   'Jamin Lake View Villa Plots',
   'Jamin Metro Heights — 2BHK Apartments',
   'Jamin Farm Retreat — Managed Farmland',
   'Jamin Green Meadows — DTCP Plots'
 );

-- 2. the real project
insert into public.properties (
  title, slug, project_name, description, property_type, project_phase,
  listing_type, status, is_featured,
  area_value, area_unit, plots_total, plots_available,
  city, district, state, locality, taluk, location_text,
  survey_number, title_status, ownership_details, encumbrance_status,
  rera_number, approvals, legal,
  amenities, utilities,
  loan_eligible, loan_details,
  gmaps_url,
  images, videos, documents, plot_layout, nearby_places,
  brochure_url, master_plan_url, seo
) values (
  'Jamin Garden — Shastri Nagar',
  'jamin-garden-shastri-nagar-erode',
  'Jamin Garden',
  'Located in the heart of Erode city, your dream home awaits. This property will be a crown of your lifetime investment with a huge appreciation of your assets, at Old Chennimalai Road, Shastri Nagar, Railway Colony, Erode. Extensively designed DTCP 320/2025 approved layout. It is an ideal location for immediate house construction with proximity to renowned temples, schools, colleges and hospitals.',
  'residential_plot', 'ongoing', 'sale', 'available', true,
  26727, 'sqft', 16, 16,
  'Erode', 'Erode', 'Tamil Nadu', 'Shastri Nagar, Railway Colony', 'Erode',
  'Old Chennimalai Road, Shastri Nagar, Railway Colony, Erode, Tamil Nadu',
  '789/3B2E2A1A2, 789/3B2E2A1A3C',
  'Clear title property',
  'Clear title property; layout fully surrounded by houses',
  'Nil encumbrance as per layout approval',
  null,
  '{"dtcp": true}'::jsonb,
  jsonb_build_object(
    'ownership', 'Clear title property',
    'dtcp_approval_no', '320/2025',
    'survey_numbers', '789/3B2E2A1A2, 789/3B2E2A1A3C',
    'notes', 'Extensively designed DTCP 320/2025 approved layout. Clear title property and the layout is fully surrounded by houses.'
  ),
  '["Elevated Black Top Roads","Roads on 3 Sides","Common Water Supply to All Plots","Clear Title Property","Fully Surrounded by Houses","Easy Access to Perundurai Road and Bypass","2 km from Outer Ring Road","Ideal for Immediate House Construction","Limited Plots in a Well Developed Location"]'::jsonb,
  jsonb_build_object(
    'water', 'Common water supply to all villa plots',
    'roads', 'Elevated black top roads, 30 ft municipal roads on the outside with 9.0 m and 7.0 m internal layout roads'
  ),
  true, '80-90% bank loan arranged',
  'https://www.google.com/maps/search/?api=1&query=Shastri%20Nagar%2C%20Old%20Chennimalai%20Road%2C%20Erode%2C%20Tamil%20Nadu',
  jsonb_build_array(
    'https://zmxqozvivdluuxvvcegs.supabase.co/storage/v1/object/public/property-media/jamin-garden-erode/photos/erode-07.jpg',
    'https://zmxqozvivdluuxvvcegs.supabase.co/storage/v1/object/public/property-media/jamin-garden-erode/photos/erode-03.jpg',
    'https://zmxqozvivdluuxvvcegs.supabase.co/storage/v1/object/public/property-media/jamin-garden-erode/photos/erode-06.jpg',
    'https://zmxqozvivdluuxvvcegs.supabase.co/storage/v1/object/public/property-media/jamin-garden-erode/photos/erode-02.jpg',
    'https://zmxqozvivdluuxvvcegs.supabase.co/storage/v1/object/public/property-media/jamin-garden-erode/photos/erode-08.jpg',
    'https://zmxqozvivdluuxvvcegs.supabase.co/storage/v1/object/public/property-media/jamin-garden-erode/photos/erode-09.jpg',
    'https://zmxqozvivdluuxvvcegs.supabase.co/storage/v1/object/public/property-media/jamin-garden-erode/photos/erode-04.jpg',
    'https://zmxqozvivdluuxvvcegs.supabase.co/storage/v1/object/public/property-media/jamin-garden-erode/photos/erode-05.jpg',
    'https://zmxqozvivdluuxvvcegs.supabase.co/storage/v1/object/public/property-media/jamin-garden-erode/photos/erode-10.jpg',
    'https://zmxqozvivdluuxvvcegs.supabase.co/storage/v1/object/public/property-media/jamin-garden-erode/photos/erode-11.jpg',
    'https://zmxqozvivdluuxvvcegs.supabase.co/storage/v1/object/public/property-media/jamin-garden-erode/photos/erode-01.jpg'
  ),
  jsonb_build_array(
    'https://zmxqozvivdluuxvvcegs.supabase.co/storage/v1/object/public/property-media/jamin-garden-erode/video/site-walkthrough.mp4'
  ),
  jsonb_build_array(
    jsonb_build_object('label','Project Brochure (12 pages)','url','https://zmxqozvivdluuxvvcegs.supabase.co/storage/v1/object/public/property-media/jamin-garden-erode/docs/jamin-garden-shastri-nagar-brochure.pdf','size','4.3 MB'),
    jsonb_build_object('label','DTCP Approved Layout Plan (320/2025)','url','https://zmxqozvivdluuxvvcegs.supabase.co/storage/v1/object/public/property-media/jamin-garden-erode/docs/dtcp-layout-plan.jpg','size','245 KB')
  ),
  jsonb_build_array(
    jsonb_build_object('plot','1','size_sqft',2582,'facing','North','status','available'),
    jsonb_build_object('plot','2','size_sqft',2030,'facing','North','status','available'),
    jsonb_build_object('plot','3','size_sqft',2030,'facing','North','status','available'),
    jsonb_build_object('plot','4','size_sqft',2035,'facing','North','status','available'),
    jsonb_build_object('plot','5','size_sqft',1685,'facing','East','status','available'),
    jsonb_build_object('plot','6','size_sqft',1685,'facing','East','status','available'),
    jsonb_build_object('plot','7','size_sqft',1674,'facing','South','status','available'),
    jsonb_build_object('plot','8','size_sqft',1531,'facing','South','status','available'),
    jsonb_build_object('plot','9','size_sqft',1584,'facing','South','status','available'),
    jsonb_build_object('plot','10','size_sqft',1584,'facing','South','status','available'),
    jsonb_build_object('plot','11','size_sqft',1869,'facing','South','status','available'),
    jsonb_build_object('plot','12','size_sqft',1215,'facing','South','status','available'),
    jsonb_build_object('plot','13','size_sqft',1373,'facing','North','status','available'),
    jsonb_build_object('plot','14','size_sqft',1515,'facing','North','status','available'),
    jsonb_build_object('plot','15','size_sqft',1241,'facing','West','status','available'),
    jsonb_build_object('plot','16','size_sqft',1094,'facing','North East','status','available')
  ),
  jsonb_build_array(
    jsonb_build_object('name','Erode Arts and Science College','distance','5 minutes','category','College'),
    jsonb_build_object('name','Erode Junction','distance','5 minutes','category','Transport'),
    jsonb_build_object('name','Geethaanjali All India Senior Secondary School','distance','10 minutes','category','School'),
    jsonb_build_object('name','Meenakshi Sundaranar Sengunthar H-S School','distance','10 minutes','category','School'),
    jsonb_build_object('name','Sri Chaitanya Techno School','distance','10 minutes','category','School'),
    jsonb_build_object('name','Vellalar College For Women','distance','10 minutes','category','College'),
    jsonb_build_object('name','Erode Fort','distance','10 minutes','category','Landmark'),
    jsonb_build_object('name','Thindal Murugan Temple','distance','10 minutes','category','Temple'),
    jsonb_build_object('name','Periyar Anna Memorial House','distance','10 minutes','category','Landmark'),
    jsonb_build_object('name','Erode Outer Ring Road','distance','10 minutes','category','Connectivity'),
    jsonb_build_object('name','Vellalar Vidyalayaa Senior Secondary School','distance','15 minutes','category','School'),
    jsonb_build_object('name','Nandha Central City International School','distance','15 minutes','category','School'),
    jsonb_build_object('name','Kongu Arts and Science College','distance','15 minutes','category','College'),
    jsonb_build_object('name','Surya Engineering College','distance','15 minutes','category','College'),
    jsonb_build_object('name','Vellode Bird Sanctuary','distance','15 minutes','category','Landmark'),
    jsonb_build_object('name','RD International School and CS Academy','distance','20 minutes','category','School'),
    jsonb_build_object('name','Erode Sengunthar Engineering College','distance','30 minutes','category','College'),
    jsonb_build_object('name','Chennimalai Murugan Temple','distance','30 minutes','category','Temple'),
    jsonb_build_object('name','Bhavani Sangameswarar Temple','distance','30 minutes','category','Temple'),
    jsonb_build_object('name','Reliance Trends','distance','Within 5-10 minutes','category','Shopping'),
    jsonb_build_object('name','Pazhamudir Nilayam','distance','Within 5-10 minutes','category','Shopping'),
    jsonb_build_object('name','Nilgiris Supermarket','distance','Within 5-10 minutes','category','Shopping'),
    jsonb_build_object('name','Lotus Hospital','distance','Within 5-10 minutes','category','Healthcare'),
    jsonb_build_object('name','Sudha Hospital','distance','Within 5-10 minutes','category','Healthcare')
  ),
  'https://zmxqozvivdluuxvvcegs.supabase.co/storage/v1/object/public/property-media/jamin-garden-erode/docs/jamin-garden-shastri-nagar-brochure.pdf',
  'https://zmxqozvivdluuxvvcegs.supabase.co/storage/v1/object/public/property-media/jamin-garden-erode/docs/dtcp-layout-plan.jpg',
  jsonb_build_object(
    'title','Jamin Garden, Shastri Nagar - DTCP Approved Plots in Erode',
    'description','DTCP 320/2025 approved villa plots at Old Chennimalai Road, Shastri Nagar, Erode. 16 plots from 1,094 to 2,582 sq.ft, elevated black top roads, common water supply, 80-90% bank loan arranged.'
  )
)
on conflict (slug) do nothing;
