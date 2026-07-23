-- 0006_buyer_foundation.sql
-- Buyer-module FOUNDATION. Additive & non-breaking:
--   • member codes (Buyer/Promoter ID, e.g. JA000001)
--   • acquisition-source capture (works before a profile exists)
--   • personal referral codes (JA-REF-00001) + referral funnel events
--   • KYC / partner status flags (columns now; full flows in later increments)
--   • audit spine — reuses existing public.activity_log (no duplicate table)
-- Everything guarded with IF NOT EXISTS / idempotent DO-blocks so it is safe
-- to re-run and cannot clobber existing objects.

-- ─────────────────────────────────────────────────────────────
-- profiles: identity + acquisition + referral + status flags
-- ─────────────────────────────────────────────────────────────
alter table public.profiles
  add column if not exists member_code         text,
  add column if not exists gender              text,
  add column if not exists dob                 date,
  add column if not exists acquisition_source  text,
  add column if not exists acquisition_meta    jsonb not null default '{}'::jsonb,
  add column if not exists referred_by         uuid references public.profiles(id) on delete set null,
  add column if not exists referral_code       text,
  add column if not exists kyc_status          text not null default 'not_started',
  add column if not exists partner_status      text not null default 'none',
  add column if not exists partner_code        text,
  add column if not exists partner_verified_at timestamptz;

do $$ begin
  alter table public.profiles add constraint profiles_kyc_status_chk
    check (kyc_status in ('not_started','pending','approved','rejected'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.profiles add constraint profiles_partner_status_chk
    check (partner_status in ('none','eligible','pending','verified','rejected'));
exception when duplicate_object then null; end $$;

-- ─────────────────────────────────────────────────────────────
-- member code (JA000001) + personal referral code (JA-REF-00001)
-- assigned automatically on insert; existing rows backfilled below
-- ─────────────────────────────────────────────────────────────
create sequence if not exists public.member_code_seq start 1;

create or replace function public.assign_member_identity()
returns trigger
language plpgsql
as $$
declare n bigint;
begin
  if new.member_code is null then
    n := nextval('public.member_code_seq');
    new.member_code := 'JA' || lpad(n::text, 6, '0');
    if new.referral_code is null then
      new.referral_code := 'JA-REF-' || lpad(n::text, 5, '0');
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_assign_member_identity on public.profiles;
create trigger trg_assign_member_identity
  before insert on public.profiles
  for each row execute function public.assign_member_identity();

-- backfill (0 rows today; idempotent and safe if run later)
do $$
declare r record; n bigint;
begin
  for r in select id from public.profiles where member_code is null loop
    n := nextval('public.member_code_seq');
    update public.profiles
       set member_code   = 'JA' || lpad(n::text, 6, '0'),
           referral_code = coalesce(referral_code, 'JA-REF-' || lpad(n::text, 5, '0'))
     where id = r.id;
  end loop;
end $$;

create unique index if not exists profiles_member_code_key   on public.profiles(member_code);
create unique index if not exists profiles_referral_code_key on public.profiles(referral_code);

-- ─────────────────────────────────────────────────────────────
-- acquisition capture — captures entry source even pre-registration
-- ─────────────────────────────────────────────────────────────
create table if not exists public.acquisition_events (
  id            uuid primary key default gen_random_uuid(),
  mobile        text,
  user_id       uuid references public.profiles(id) on delete set null,
  source        text not null,     -- promoter_referral|friend_referral|property_link|qr|social_ad|google_search|website|organic
  medium        text,
  campaign      text,
  referral_code text,
  referrer_id   uuid references public.profiles(id) on delete set null,
  property_id   uuid references public.properties(id) on delete set null,
  meta          jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);
alter table public.acquisition_events enable row level security;
create index if not exists acquisition_events_user_idx on public.acquisition_events(user_id);
create index if not exists acquisition_events_ref_idx  on public.acquisition_events(referrer_id);

-- ─────────────────────────────────────────────────────────────
-- referral funnel events
-- ─────────────────────────────────────────────────────────────
create table if not exists public.referral_events (
  id          uuid primary key default gen_random_uuid(),
  referrer_id uuid references public.profiles(id) on delete cascade,
  referred_id uuid references public.profiles(id) on delete set null,
  event_type  text not null,       -- click|download|registration|kyc|enquiry|site_visit|purchase|reward
  meta        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
alter table public.referral_events enable row level security;
create index if not exists referral_events_referrer_idx on public.referral_events(referrer_id);

-- ─────────────────────────────────────────────────────────────
-- RLS
-- ─────────────────────────────────────────────────────────────
-- acquisition: anyone (incl. anon pre-registration) may insert; only admin reads
drop policy if exists acq_insert on public.acquisition_events;
create policy acq_insert on public.acquisition_events
  for insert to anon, authenticated with check (true);
drop policy if exists acq_admin_read on public.acquisition_events;
create policy acq_admin_read on public.acquisition_events
  for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin'));

-- referral_events: referrer or admin reads; authenticated inserts
drop policy if exists refev_insert on public.referral_events;
create policy refev_insert on public.referral_events
  for insert to authenticated with check (true);
drop policy if exists refev_read on public.referral_events;
create policy refev_read on public.referral_events
  for select to authenticated
  using (referrer_id = auth.uid()
         or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin'));

-- activity_log = audit spine: insert own; read own or admin; immutable (no update/delete policy)
drop policy if exists act_insert on public.activity_log;
create policy act_insert on public.activity_log
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists act_read on public.activity_log;
create policy act_read on public.activity_log
  for select to authenticated
  using (user_id = auth.uid()
         or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin'));

-- ─────────────────────────────────────────────────────────────
-- RPCs
-- ─────────────────────────────────────────────────────────────
-- immutable audit write for the current user
create or replace function public.log_activity(p_event text, p_meta jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then return; end if;
  insert into public.activity_log(user_id, event_type, meta)
  values (auth.uid(), p_event, coalesce(p_meta, '{}'::jsonb));
end;
$$;

-- acquisition capture (SECURITY DEFINER so anon/pre-registration is safe)
create or replace function public.capture_acquisition(
  p_source        text,
  p_mobile        text default null,
  p_medium        text default null,
  p_campaign      text default null,
  p_referral_code text default null,
  p_property_id   uuid default null,
  p_meta          jsonb default '{}'::jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_ref uuid;
begin
  if p_referral_code is not null then
    select id into v_ref from public.profiles where referral_code = p_referral_code;
  end if;
  insert into public.acquisition_events
    (mobile, user_id, source, medium, campaign, referral_code, referrer_id, property_id, meta)
  values
    (p_mobile, auth.uid(), coalesce(p_source,'organic'), p_medium, p_campaign,
     p_referral_code, v_ref, p_property_id, coalesce(p_meta, '{}'::jsonb));
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- grants (public-schema grant deadline: new objects need explicit grants)
-- ─────────────────────────────────────────────────────────────
grant select, insert on public.acquisition_events to anon, authenticated;
grant select, insert on public.referral_events    to authenticated;
grant execute on function public.log_activity(text, jsonb)                              to authenticated;
grant execute on function public.capture_acquisition(text, text, text, text, text, uuid, jsonb) to anon, authenticated;
