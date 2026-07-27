-- 0035 — New project location wiring (owner's map pin, 27-07-2026 evening).
-- Owner shared https://maps.app.goo.gl/MehU7jf8ik6owitK9 → 11.5871928,77.8193972,
-- which reverse-geocodes to Edappadi, Salem district, Tamil Nadu 637101. The
-- owner's layout drawing is branded "JAMIN GARDEN", naming the project.
-- Nearby places come from OpenStreetMap around the pin (straight-line km).
-- lat/lng alone light up Map / Satellite / Street View / Google Earth tiles
-- (LocationTab derives those links), matching the first project's experience.
update public.properties
   set title         = 'Jamin Garden — Edappadi (Coming Soon)',
       project_name  = 'Jamin Garden',
       locality      = 'Edappadi',
       city          = 'Edappadi',
       district      = 'Salem',
       state         = 'Tamil Nadu',
       pincode       = '637101',
       taluk         = 'Edappadi',
       location_text = 'Edappadi, Salem district, Tamil Nadu — 637101',
       lat           = 11.5871928,
       lng           = 77.8193972,
       gmaps_url     = 'https://www.google.com/maps/search/?api=1&query=11.5871928,77.8193972',
       description   = 'Jamin Garden — Edappadi is a new Jamin Properties plotted development in Edappadi, Salem district. Ground levelling and site development began in July 2026 — watch the live site photos and videos here. The layout plan, plot schedule, approvals and pricing will be published as they are finalised. Ask Jamindar or contact the Jamin desk to register your interest early.',
       nearby_places = jsonb_build_array(
         jsonb_build_object('name','Edappadi Bus Stand','distance','1.8 km','category','Transport'),
         jsonb_build_object('name','Wisdom Matric Hr. Sec. School','distance','1.2 km','category','School'),
         jsonb_build_object('name','Amala Matriculation Hr. Sec. School','distance','4.5 km','category','School'),
         jsonb_build_object('name','Government Hospital, Edappadi','distance','2.0 km','category','Healthcare'),
         jsonb_build_object('name','S.P. Eye Hospital','distance','1.1 km','category','Healthcare'),
         jsonb_build_object('name','Adveka Hospital','distance','1.3 km','category','Healthcare'),
         jsonb_build_object('name','SKM Hospital','distance','1.6 km','category','Healthcare'),
         jsonb_build_object('name','Aravind Hospital','distance','2.5 km','category','Healthcare')
       ),
       seo = jsonb_build_object(
         'title', 'Jamin Garden Edappadi — Plots in Salem District (Coming Soon)',
         'description', 'New Jamin Properties plotted development at Edappadi, Salem district, Tamil Nadu 637101. Site development in progress — details to be announced.'
       )
 where slug = 'jamin-new-project-jul-2026';
