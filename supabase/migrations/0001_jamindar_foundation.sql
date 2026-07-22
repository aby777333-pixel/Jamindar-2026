-- ============================================================
-- JAMINDAR 2026 — Foundation schema (migration 0001)
-- Modular, additive. Mobile-OTP auth. 4 modules.
-- ============================================================

create extension if not exists pgcrypto;

-- ---------- enums ----------
do $$ begin
  create type public.user_role as enum ('super_admin','promoter','buyer');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.property_type as enum
    ('residential_plot','villa_plot','apartment','house','farm_land','commercial_land','industrial_land');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.property_status as enum ('draft','available','reserved','sold','archived');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.lead_status as enum ('new','contacted','qualified','converted','lost');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.visit_status as enum ('requested','confirmed','completed','cancelled');
exception when duplicate_object then null; end $$;

-- ---------- profiles ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  mobile text unique not null,
  full_name text,
  role public.user_role not null default 'buyer',
  email text,
  avatar_url text,
  preferred_language text default 'en',
  city text,
  district text,
  state text,
  pincode text,
  assigned_promoter uuid references public.profiles(id) on delete set null,
  is_active boolean not null default true,
  is_profile_complete boolean not null default false,
  created_at timestamptz not null default now(),
  last_login timestamptz
);

-- role helper (SECURITY DEFINER -> avoids RLS recursion on profiles)
create or replace function public.current_role()
returns public.user_role
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_super_admin()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'super_admin');
$$;

-- ---------- otp_codes (custom OTP, service-role only) ----------
create table if not exists public.otp_codes (
  id uuid primary key default gen_random_uuid(),
  mobile text not null,
  code_hash text not null,
  expires_at timestamptz not null,
  consumed boolean not null default false,
  attempts int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_otp_mobile on public.otp_codes(mobile, created_at desc);

-- ---------- promoter_profiles ----------
create table if not exists public.promoter_profiles (
  id uuid primary key references public.profiles(id) on delete cascade,
  referral_code text unique not null,
  bio text,
  designation text,
  company text,
  whatsapp text,
  vcard jsonb not null default '{}'::jsonb,
  commission_enabled boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---------- properties ----------
create table if not exists public.properties (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text unique,
  description text,
  property_type public.property_type not null default 'residential_plot',
  status public.property_status not null default 'draft',
  price numeric(14,2),
  price_unit text default 'total',
  area_value numeric(12,2),
  area_unit text default 'sqft',
  plots_total int default 1,
  plots_available int default 1,
  city text,
  district text,
  state text,
  locality text,
  pincode text,
  lat double precision,
  lng double precision,
  gmaps_url text,
  amenities jsonb not null default '[]'::jsonb,
  approvals jsonb not null default '{}'::jsonb,   -- {dtcp,cmda,rera}
  vastu_facing text,
  images jsonb not null default '[]'::jsonb,
  videos jsonb not null default '[]'::jsonb,
  virtual_tour_url text,
  brochure_url text,
  nearby_landmarks jsonb not null default '[]'::jsonb,
  promoter_id uuid references public.profiles(id) on delete set null,
  is_featured boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_properties_status on public.properties(status);
create index if not exists idx_properties_type on public.properties(property_type);
create index if not exists idx_properties_city on public.properties(city);

-- ---------- buyer_preferences ----------
create table if not exists public.buyer_preferences (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null references public.profiles(id) on delete cascade,
  property_types jsonb not null default '[]'::jsonb,
  budget_min numeric(14,2),
  budget_max numeric(14,2),
  city text, district text, state text, locality text, pincode text,
  area_min numeric(12,2), area_max numeric(12,2), area_unit text default 'sqft',
  purpose jsonb not null default '[]'::jsonb,
  timeframe text,
  financing text,
  amenities jsonb not null default '[]'::jsonb,
  vastu jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique(buyer_id)
);

-- ---------- favorites ----------
create table if not exists public.favorites (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null references public.profiles(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(buyer_id, property_id)
);

-- ---------- site_visits ----------
create table if not exists public.site_visits (
  id uuid primary key default gen_random_uuid(),
  property_id uuid references public.properties(id) on delete set null,
  buyer_id uuid references public.profiles(id) on delete set null,
  promoter_id uuid references public.profiles(id) on delete set null,
  preferred_date date,
  status public.visit_status not null default 'requested',
  notes text,
  created_at timestamptz not null default now()
);

-- ---------- leads ----------
create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid references public.profiles(id) on delete set null,
  promoter_id uuid references public.profiles(id) on delete set null,
  property_id uuid references public.properties(id) on delete set null,
  source text default 'app',
  status public.lead_status not null default 'new',
  notes text,
  follow_up_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_leads_promoter on public.leads(promoter_id, status);

-- ---------- brochure_downloads ----------
create table if not exists public.brochure_downloads (
  id uuid primary key default gen_random_uuid(),
  property_id uuid references public.properties(id) on delete set null,
  user_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ---------- voice_logs (Jamindar) ----------
create table if not exists public.voice_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  session_id text,
  original_text text,
  detected_language text,
  translated_text text,
  ai_response text,
  intent text,
  created_at timestamptz not null default now()
);
create index if not exists idx_voice_user on public.voice_logs(user_id, created_at desc);

-- ---------- activity_log ----------
create table if not exists public.activity_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  event_type text not null,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_activity_created on public.activity_log(created_at desc);

-- ============================================================
-- RLS
-- ============================================================
alter table public.profiles           enable row level security;
alter table public.otp_codes          enable row level security;
alter table public.promoter_profiles  enable row level security;
alter table public.properties         enable row level security;
alter table public.buyer_preferences  enable row level security;
alter table public.favorites          enable row level security;
alter table public.site_visits        enable row level security;
alter table public.leads              enable row level security;
alter table public.brochure_downloads enable row level security;
alter table public.voice_logs         enable row level security;
alter table public.activity_log       enable row level security;

-- profiles
create policy profiles_self_read on public.profiles for select using (id = auth.uid() or public.is_super_admin());
create policy profiles_self_upd  on public.profiles for update using (id = auth.uid() or public.is_super_admin());
create policy profiles_self_ins  on public.profiles for insert with check (id = auth.uid());
create policy profiles_promoter_read on public.profiles for select using (assigned_promoter = auth.uid());

-- otp_codes: no policies = deny all (service role bypasses RLS).

-- promoter_profiles
create policy promoter_self on public.promoter_profiles for all
  using (id = auth.uid() or public.is_super_admin())
  with check (id = auth.uid() or public.is_super_admin());
create policy promoter_public_read on public.promoter_profiles for select using (true);

-- properties
create policy properties_read on public.properties for select
  using (status in ('available','reserved','sold') or created_by = auth.uid()
         or promoter_id = auth.uid() or public.is_super_admin());
create policy properties_admin_write on public.properties for all
  using (public.is_super_admin()) with check (public.is_super_admin());

-- buyer_preferences
create policy prefs_owner on public.buyer_preferences for all
  using (buyer_id = auth.uid() or public.is_super_admin())
  with check (buyer_id = auth.uid() or public.is_super_admin());

-- favorites
create policy fav_owner on public.favorites for all
  using (buyer_id = auth.uid() or public.is_super_admin())
  with check (buyer_id = auth.uid());

-- site_visits
create policy visits_involved_read on public.site_visits for select
  using (buyer_id = auth.uid() or promoter_id = auth.uid() or public.is_super_admin());
create policy visits_insert on public.site_visits for insert
  with check (buyer_id = auth.uid() or public.is_super_admin());
create policy visits_update on public.site_visits for update
  using (promoter_id = auth.uid() or public.is_super_admin());

-- leads
create policy leads_owner_read on public.leads for select
  using (promoter_id = auth.uid() or buyer_id = auth.uid() or public.is_super_admin());
create policy leads_insert on public.leads for insert
  with check (buyer_id = auth.uid() or promoter_id = auth.uid() or public.is_super_admin());
create policy leads_update on public.leads for update
  using (promoter_id = auth.uid() or public.is_super_admin());

-- brochure_downloads
create policy brochure_insert on public.brochure_downloads for insert with check (user_id = auth.uid());
create policy brochure_read on public.brochure_downloads for select
  using (user_id = auth.uid() or public.is_super_admin());

-- voice_logs
create policy voice_insert on public.voice_logs for insert with check (user_id = auth.uid());
create policy voice_read on public.voice_logs for select
  using (user_id = auth.uid() or public.is_super_admin());

-- activity_log
create policy activity_insert on public.activity_log for insert with check (user_id = auth.uid());
create policy activity_read on public.activity_log for select
  using (user_id = auth.uid() or public.is_super_admin());

-- ============================================================
-- GRANTS (explicit — future-proof against public-schema grant flip)
-- ============================================================
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on public.properties, public.promoter_profiles to anon;
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;

-- updated_at trigger
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists trg_properties_touch on public.properties;
create trigger trg_properties_touch before update on public.properties
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_leads_touch on public.leads;
create trigger trg_leads_touch before update on public.leads
  for each row execute function public.touch_updated_at();
