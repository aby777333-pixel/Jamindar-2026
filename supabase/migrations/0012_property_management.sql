-- 0012_property_management.sql
-- Property Management v2 foundation. Additive & non-breaking.
--   • property_media: one row per file (images/videos/brochures/plans/legal…),
--     with category, per-audience visibility, ordering, primary flag, captions.
--   • rich Indian real-estate fields on properties.
--   • public 'property-media' storage bucket.
--   • a trigger that MIRRORS buyer-visible media back into the existing
--     properties columns (images/videos/drone_videos/brochure_url/
--     master_plan_url/documents) so the buyer app keeps working unchanged.

-- ── rich Indian fields ────────────────────────────────────────
alter table public.properties
  add column if not exists listing_type       text not null default 'sale',   -- sale | rent
  add column if not exists taluk               text,
  add column if not exists village             text,
  add column if not exists survey_number       text,
  add column if not exists patta_khata         text,
  add column if not exists road_frontage       text,
  add column if not exists plot_length         numeric,
  add column if not exists plot_breadth        numeric,
  add column if not exists plot_dimensions     text,
  add column if not exists ownership_details   text,
  add column if not exists title_status        text,
  add column if not exists encumbrance_status  text,
  add column if not exists utilities           jsonb not null default '[]'::jsonb,
  add column if not exists property_age         text,
  add column if not exists price_negotiable    boolean not null default false,
  add column if not exists taxes               text,
  add column if not exists maintenance_charges text,
  add column if not exists seo                 jsonb not null default '{}'::jsonb,  -- {title, description, keywords, slug}
  add column if not exists translations        jsonb not null default '{}'::jsonb;  -- {hi:{description}, ta:{...}}

do $$ begin
  alter table public.properties add constraint properties_listing_type_chk check (listing_type in ('sale','rent'));
exception when duplicate_object then null; end $$;

-- ── property_media ────────────────────────────────────────────
create table if not exists public.property_media (
  id          uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  kind        text not null default 'image',
    -- image|video|drone|brochure|flyer|pamphlet|catalogue|presentation|price_list|
    -- master_plan|layout_plan|floor_plan|site_plan|location_map|google_earth|
    -- legal|approval|rera|noc|virtual_tour|other
  url         text not null,        -- full public URL, or external link (virtual_tour)
  caption     text,
  alt_text    text,
  sort_order  int  not null default 0,
  is_primary  boolean not null default false,
  visibility  text[] not null default array['buyer','promoter','agent','internal'],
  version     int  not null default 1,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);
alter table public.property_media enable row level security;
create index if not exists property_media_prop_idx on public.property_media(property_id, sort_order);

drop policy if exists pm_admin on public.property_media;
create policy pm_admin on public.property_media for all to authenticated
  using (is_super_admin()) with check (is_super_admin());
drop policy if exists pm_read on public.property_media;
create policy pm_read on public.property_media for select to authenticated
  using ('buyer' = any(visibility)
         and exists (select 1 from public.properties p where p.id = property_id
                     and p.status in ('available','reserved','sold')));

-- ── storage bucket (public read; admin write) ─────────────────
insert into storage.buckets (id, name, public) values ('property-media','property-media', true)
  on conflict (id) do nothing;
drop policy if exists propmedia_read on storage.objects;
create policy propmedia_read on storage.objects for select using (bucket_id = 'property-media');
drop policy if exists propmedia_admin on storage.objects;
create policy propmedia_admin on storage.objects for all to authenticated
  using (bucket_id = 'property-media' and is_super_admin())
  with check (bucket_id = 'property-media' and is_super_admin());

-- ── mirror buyer-visible media into legacy columns ────────────
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
    images = coalesce((select jsonb_agg(url order by is_primary desc, sort_order, created_at)
                       from public.property_media where property_id = pid and kind = 'image' and 'buyer' = any(visibility)), '[]'::jsonb),
    videos = coalesce((select jsonb_agg(url order by sort_order, created_at)
                       from public.property_media where property_id = pid and kind = 'video' and 'buyer' = any(visibility)), '[]'::jsonb),
    drone_videos = coalesce((select jsonb_agg(url order by sort_order, created_at)
                       from public.property_media where property_id = pid and kind = 'drone' and 'buyer' = any(visibility)), '[]'::jsonb),
    brochure_url = (select url from public.property_media where property_id = pid and kind = 'brochure' and 'buyer' = any(visibility) order by sort_order, created_at limit 1),
    master_plan_url = (select url from public.property_media where property_id = pid and kind = 'master_plan' and 'buyer' = any(visibility) order by sort_order, created_at limit 1),
    documents = coalesce((select jsonb_agg(jsonb_build_object('label', coalesce(nullif(caption,''), initcap(replace(kind,'_',' '))), 'url', url) order by sort_order, created_at)
                       from public.property_media where property_id = pid
                       and kind in ('legal','approval','rera','noc','price_list','flyer','pamphlet','catalogue','presentation','layout_plan','floor_plan','site_plan','location_map','other')
                       and 'buyer' = any(visibility)), '[]'::jsonb)
  where p.id = pid;
  return null;
end;
$$;

drop trigger if exists trg_sync_property_media on public.property_media;
create trigger trg_sync_property_media
  after insert or update or delete on public.property_media
  for each row execute function public.sync_property_media();

-- ── grants ────────────────────────────────────────────────────
grant select, insert, update, delete on public.property_media to authenticated;
grant select on public.property_media to anon;
