-- 0032 — Sync Jamin Garden (Shastri Nagar) with the official Jul-2026 brochure
-- ("Jamin Garden Erode.pdf", 9 pp). Data only; no schema change.
--
--  * Plot facings follow the brochure's DTCP schedule (திசை column):
--    1-4 N · 5 NE · 6-7 E · 8-11 S · 12 N · 13-14 S · 15 N · 16 W.
--    Existing per-plot status values are preserved.
--  * The brochure file at docs/jamin-garden-shastri-nagar-brochure.pdf was
--    REPLACED in storage with the new web-optimized 9-page edition (2.9 MB),
--    so brochure_url and every previously shared link stay valid.
--  * Master plan now points at the new DTCP layout page (with plot schedule).
--  * Nearby: split the combined RD/CS entry per the brochure and add Erode's
--    iconic attractions from the "Discover the City" page.
--  * Investment/appreciation + three-side road access recorded as printed.
--  * Note: page 3 says "28,727 Sq.Ft" but the 16 plots sum to exactly 26,727
--    (matching page 9's footer) — 26,727 is kept as the true extent.

update public.properties p
   set plot_layout = (
         select jsonb_agg(
                  e || jsonb_build_object('facing',
                    case e->>'plot'
                      when '1'  then 'North'      when '2'  then 'North'
                      when '3'  then 'North'      when '4'  then 'North'
                      when '5'  then 'North East' when '6'  then 'East'
                      when '7'  then 'East'       when '8'  then 'South'
                      when '9'  then 'South'      when '10' then 'South'
                      when '11' then 'South'      when '12' then 'North'
                      when '13' then 'South'      when '14' then 'South'
                      when '15' then 'North'      when '16' then 'West'
                      else e->>'facing'
                    end)
                  order by (e->>'plot')::int)
           from jsonb_array_elements(p.plot_layout) e
       ),
       master_plan_url = 'https://zmxqozvivdluuxvvcegs.supabase.co/storage/v1/object/public/property-media/jamin-garden-erode/docs/dtcp-layout-plan-2026.png',
       documents = jsonb_build_array(
         jsonb_build_object('label','Project Brochure (9 pages, Jul 2026)','url','https://zmxqozvivdluuxvvcegs.supabase.co/storage/v1/object/public/property-media/jamin-garden-erode/docs/jamin-garden-shastri-nagar-brochure.pdf','size','2.9 MB'),
         jsonb_build_object('label','DTCP Approved Layout Plan (320/2025)','url','https://zmxqozvivdluuxvvcegs.supabase.co/storage/v1/object/public/property-media/jamin-garden-erode/docs/dtcp-layout-plan-2026.png','size','2.0 MB')
       ),
       nearby_places = (
         select coalesce(jsonb_agg(e), '[]'::jsonb)
           from jsonb_array_elements(p.nearby_places) e
          where e->>'name' <> 'RD International School and CS Academy'
       ) || jsonb_build_array(
         jsonb_build_object('name','RD International School','distance','Nearby','category','School'),
         jsonb_build_object('name','CS Academy','distance','20 minutes','category','School'),
         jsonb_build_object('name','Bhavani Kuduthurai','category','Attraction'),
         jsonb_build_object('name','Kodiveri Dam','category','Attraction'),
         jsonb_build_object('name','Chennimalai','category','Attraction'),
         jsonb_build_object('name','Bhavanisagar Dam','category','Attraction'),
         jsonb_build_object('name','Pariyur','category','Attraction'),
         jsonb_build_object('name','Kodumudi','category','Attraction')
       ),
       road_frontage = 'Three-side road access · elevated black top roads',
       investment = coalesce(p.investment, '{}'::jsonb)
                    || jsonb_build_object('appreciation','High appreciation in a well-developed residential area')
 where p.slug = 'jamin-garden-shastri-nagar-erode';
