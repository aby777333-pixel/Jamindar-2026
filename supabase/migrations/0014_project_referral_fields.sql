-- 0014_project_referral_fields.sql
-- Project-level + referral-economics fields. Additive & non-breaking.

alter table public.properties
  add column if not exists project_name               text,
  add column if not exists location_text              text,               -- map link OR free text
  add column if not exists nearby_defaults            jsonb not null default '{}'::jsonb,  -- {bus_stand, railway_station, school, college, hospital}
  add column if not exists referral_direct_per_sqft   numeric,
  add column if not exists referral_indirect_per_sqft numeric,
  add column if not exists referral_indirect_levels   int,
  add column if not exists total_project_value        numeric;

-- extend the media mirror so profile / overview / poster / earth materials also
-- surface in the buyer-facing documents column.
create or replace function public.sync_property_media()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare pid uuid;
begin
  pid := coalesce(new.property_id, old.property_id);
  update public.properties p set
    images = coalesce((select jsonb_agg(url order by is_primary desc, sort_order, created_at) from public.property_media where property_id = pid and kind = 'image' and 'buyer' = any(visibility)), '[]'::jsonb),
    videos = coalesce((select jsonb_agg(url order by sort_order, created_at) from public.property_media where property_id = pid and kind = 'video' and 'buyer' = any(visibility)), '[]'::jsonb),
    drone_videos = coalesce((select jsonb_agg(url order by sort_order, created_at) from public.property_media where property_id = pid and kind = 'drone' and 'buyer' = any(visibility)), '[]'::jsonb),
    brochure_url = (select url from public.property_media where property_id = pid and kind = 'brochure' and 'buyer' = any(visibility) order by sort_order, created_at limit 1),
    master_plan_url = (select url from public.property_media where property_id = pid and kind = 'master_plan' and 'buyer' = any(visibility) order by sort_order, created_at limit 1),
    documents = coalesce((select jsonb_agg(jsonb_build_object('label', coalesce(nullif(caption,''), initcap(replace(kind,'_',' '))), 'url', url) order by sort_order, created_at)
                       from public.property_media where property_id = pid
                       and kind in ('legal','approval','rera','noc','price_list','flyer','pamphlet','catalogue','presentation','layout_plan','floor_plan','site_plan','location_map','google_earth','profile','project_overview','poster','other')
                       and 'buyer' = any(visibility)), '[]'::jsonb)
  where p.id = pid;
  return null;
end;
$$;
revoke execute on function public.sync_property_media() from public;
