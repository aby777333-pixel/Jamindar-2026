-- 0038 — Distances for the Erode listing's district attractions (owner
-- report: "some distances are not visible"). Kodiveri/Chennimalai/Kodumudi
-- measured from Erode Junction via OSM coordinates; Bhavani/Bhavanisagar/
-- Pariyur use the commonly published road distances from Erode city.
update public.properties p
   set nearby_places = (
     select jsonb_agg(
       case e->>'name'
         when 'Bhavani Kuduthurai' then e || '{"distance":"~15 km"}'::jsonb
         when 'Kodiveri Dam'       then e || '{"distance":"~50 km"}'::jsonb
         when 'Chennimalai'        then e || '{"distance":"~23 km"}'::jsonb
         when 'Bhavanisagar Dam'   then e || '{"distance":"~75 km"}'::jsonb
         when 'Pariyur'            then e || '{"distance":"~45 km"}'::jsonb
         when 'Kodumudi'           then e || '{"distance":"~25 km"}'::jsonb
         else e
       end)
     from jsonb_array_elements(p.nearby_places) e
   )
 where p.slug = 'jamin-garden-shastri-nagar-erode';
