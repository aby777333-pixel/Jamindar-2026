-- 0037 — Owner review fixes (27-07 night):
-- 1. Every Edappadi nearby entry now carries a distance. Salem/Erode/Sankagiri
--    are straight-line km measured from the site pin (Nominatim centroids);
--    brochure-local institutions that OSM doesn't know are labelled "Nearby",
--    exactly how the brochure's location map presents them.
-- 2. Edappadi Area: the DTCP layout prints the OSR reserve as 1061.44 sq.m =
--    10.10% of the layout → total ≈ 10,509 sq.m ≈ 2.6 acres. Stored as
--    2.6 acres (approx, derived from the plan's own printed figures — owner
--    can refine from the sale deed).
-- 3. Erode (Shastri Nagar) Google Earth: a text-search Earth URL works without
--    coordinates, so the tile lights up. Street View still needs the exact
--    map pin — owner to share it like the Edappadi one.
update public.properties
   set area_value = 2.6,
       area_unit  = 'acres',
       nearby_places = jsonb_build_array(
         jsonb_build_object('name','Edappadi Bypass','distance','300 metres','category','Connectivity'),
         jsonb_build_object('name','Edappadi Bus Stand','distance','3 minutes','category','Transport'),
         jsonb_build_object('name','Salem city','distance','~43 km','category','Connectivity'),
         jsonb_build_object('name','Erode','distance','~52 km','category','Connectivity'),
         jsonb_build_object('name','Sankagiri','distance','~13 km','category','Connectivity'),
         jsonb_build_object('name','Government Arts & Science College','distance','Nearby','category','College'),
         jsonb_build_object('name','Vivekanandha College for Women','distance','Nearby','category','College'),
         jsonb_build_object('name','Rakshan Polytechnic','distance','Nearby','category','College'),
         jsonb_build_object('name','Universal Public School','distance','Nearby','category','School'),
         jsonb_build_object('name','Kalaimagal Vidhyashramam School','distance','Nearby','category','School'),
         jsonb_build_object('name','Saraswathi School','distance','Nearby','category','School'),
         jsonb_build_object('name','Bharathi School','distance','Nearby','category','School'),
         jsonb_build_object('name','Wisdom Matric Hr. Sec. School','distance','1.2 km','category','School'),
         jsonb_build_object('name','Amala Matriculation Hr. Sec. School','distance','4.5 km','category','School'),
         jsonb_build_object('name','Government Hospital, Edappadi','distance','2.0 km','category','Healthcare'),
         jsonb_build_object('name','Akshan Polyclinic','distance','Nearby','category','Healthcare'),
         jsonb_build_object('name','Arthik Medical Centre','distance','Nearby','category','Healthcare'),
         jsonb_build_object('name','S.P. Eye Clinic & Jayanth ENT','distance','1.1 km','category','Healthcare'),
         jsonb_build_object('name','SKM Hospital','distance','1.6 km','category','Healthcare'),
         jsonb_build_object('name','Aravind Hospital','distance','2.5 km','category','Healthcare')
       )
 where slug = 'jamin-new-project-jul-2026';

update public.properties
   set google_earth_url = 'https://earth.google.com/web/search/Shastri+Nagar,+Railway+Colony,+Erode,+Tamil+Nadu'
 where slug = 'jamin-garden-shastri-nagar-erode';
