-- Road width each plot fronts, read off the approved plan: blocks A-D front the
-- two 9.00 m roads, blocks E-J the 12.00 m road. Stored per plot so the buyer
-- filter does not have to infer it from the block letter.
--
-- `corner` is deliberately NOT set: the DTCP sheet does not mark corner plots
-- and guessing would put a marketing claim on a legal drawing. The admin sets
-- it per plot, and the corner filter stays hidden until at least one is flagged.
update public.properties
   set plot_layout = (
     select jsonb_agg(
       case when e->>'block' in ('A','B','C','D')
            then e || '{"road_m":9}'::jsonb
            else e || '{"road_m":12}'::jsonb
       end
       order by (e->>'plot')::int
     )
     from jsonb_array_elements(plot_layout) e
   )
 where id = 'e8749d9d-3cfa-4473-8557-008f59363676'
   and plot_layout @> '[{"block":"A"}]'::jsonb;
