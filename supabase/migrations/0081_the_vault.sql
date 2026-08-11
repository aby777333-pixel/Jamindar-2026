-- 0081 — THE VAULT
--
-- Jamin Bazaar's private property desk: a discreet acquisition, rental, sale,
-- leasing and listing service. This migration is ENTIRELY ADDITIVE — it creates
-- new enums, new tables, new policies and two new anon RPCs, and it does not
-- alter, drop or re-grant anything that already exists. Nothing here touches
-- `properties`, `leads`, `site_visits` or any existing function.
--
-- Three ideas drive the shape of it:
--
--  1. THE VAULT IS A DESK, NOT A CATALOGUE. The primary artefacts are a client
--     REQUIREMENT (`vault_requests`) and an owner OFFER (`vault_offers`).
--     Inventory (`vault_listings`) is secondary and may be empty for a long
--     time — the service works without it.
--
--  2. VISIBILITY DEFAULTS TO `off_market`. Every listing and every offer is
--     invisible until somebody deliberately publishes it. A default of `public`
--     would mean one forgotten column exposes an owner who explicitly asked for
--     discretion, which is the single worst failure this product can have.
--
--  3. NOTHING IN THE REQUEST/OFFER TABLES IS READABLE BY ANON. There is no
--     anon SELECT policy on them at all, and the only way in is through a
--     SECURITY DEFINER function that validates and rate-limits. An enquiry
--     cannot be read back by the person who wrote it, let alone by anyone else.

begin;

-- ---------------------------------------------------------------- enums ----
-- `create type` has no IF NOT EXISTS, so each is guarded. Re-running this
-- migration must be harmless.
do $$ begin
  create type vault_visibility as enum ('public','private','off_market');
exception when duplicate_object then null; end $$;

do $$ begin
  create type vault_intent as enum ('buy','rent','sell','lease');
exception when duplicate_object then null; end $$;

-- §10 — the client pipeline, verbatim from the brief, plus its three exits.
do $$ begin
  create type vault_request_status as enum (
    'new','contacted','qualified','search_active','presented','visit',
    'negotiation','documentation','closed','paused','lost','do_not_contact'
  );
exception when duplicate_object then null; end $$;

-- §12 — the verification ladder. ⚠️ `vault_verified` is the ONLY rung that may
-- ever be shown publicly, and even then it means "Jamin has reviewed this",
-- never "the title is legally certified". See the note on `vault_listings`.
do $$ begin
  create type vault_offer_stage as enum (
    'submitted','identity_verified','documents_received','property_reviewed',
    'due_diligence_pending','vault_verified','listed','withdrawn','closed'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type vault_match_status as enum ('suggested','approved','presented','rejected');
exception when duplicate_object then null; end $$;

-- ----------------------------------------------------------- taxonomy ------
-- §2 and §17. Both are admin-editable rather than hard-coded, per §19 — the
-- website reads them, it does not own them.

create table if not exists vault_categories (
  id          uuid primary key default gen_random_uuid(),
  family      text not null,
  slug        text not null unique,
  label       text not null,
  note        text,
  image_url   text,
  sort        integer not null default 100,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create table if not exists vault_destinations (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name        text not null,
  tagline     text,
  region      text,
  image_url   text,
  sort        integer not null default 100,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ------------------------------------------------------------ offers -------
-- §5 — the owner's private listing desk. Created before `vault_listings`
-- because a listing may point back at the offer it came from.

create sequence if not exists vault_offer_ref_seq start 1001;

create table if not exists vault_offers (
  id                   uuid primary key default gen_random_uuid(),
  reference            text not null unique
                         default ('VO-' || lpad(nextval('vault_offer_ref_seq')::text, 5, '0')),
  intent               vault_intent not null,          -- 'sell' | 'lease'

  owner_name           text not null,
  mobile               text not null,
  whatsapp             text,
  email                text,

  property_type        text,
  property_location    text,
  expected_price       text,   -- text, never numeric: owners answer in words
  expected_rent        text,   -- ("around 20 cr", "negotiable"). Never invent a figure.
  land_area            text,
  built_area           text,
  bedrooms             integer,
  description          text,
  ownership_status     text,
  availability         text,
  furnishing           text,
  amenities            text,
  map_link             text,
  coordinates          text,
  special_instructions text,

  -- Storage object paths in the PRIVATE `vault` bucket. Never public URLs.
  photos               text[] not null default '{}',
  videos               text[] not null default '{}',
  brochures            text[] not null default '{}',
  documents            text[] not null default '{}',

  -- §5 "Keep My Property Off-Market". `off_market` is the owner's stated wish;
  -- `visibility` is what the system actually enforces. They are separate on
  -- purpose: an administrator may not quietly overrule the wish by editing one
  -- field, because the other still records what was asked for.
  off_market           boolean not null default false,
  visibility           vault_visibility not null default 'off_market',
  stage                vault_offer_stage not null default 'submitted',

  assigned_to          uuid references profiles(id) on delete set null,
  internal_notes       text,
  follow_up_on         date,

  consent              boolean not null default false,
  consent_at           timestamptz,
  source_url           text,

  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists vault_offers_stage_idx      on vault_offers (stage, created_at desc);
create index if not exists vault_offers_visibility_idx on vault_offers (visibility);
create index if not exists vault_offers_mobile_idx     on vault_offers (mobile);

-- ---------------------------------------------------------- listings -------
-- §13 — a Vault listing is a dossier, not a portal card.

create table if not exists vault_listings (
  id                uuid primary key default gen_random_uuid(),
  slug              text unique,
  title             text not null,
  headline          text,
  summary           text,
  story             text,

  category_slug     text references vault_categories(slug) on update cascade on delete set null,
  destination_slug  text references vault_destinations(slug) on update cascade on delete set null,
  locality          text,
  state             text,

  intent            text not null default 'sale'
                      check (intent in ('sale','rent','both')),

  -- ⚠️ DEFAULT `off_market`, deliberately. See the header note.
  visibility        vault_visibility not null default 'off_market',
  stage             vault_offer_stage not null default 'submitted',

  -- §13 — "Private Estate — South India. Full details available upon qualified
  -- enquiry." A discreet listing publishes its existence and nothing else.
  discreet          boolean not null default false,
  discreet_label    text,

  price_display     text,
  price_on_request  boolean not null default true,
  land_area         text,
  built_area        text,
  bedrooms          integer,
  amenities         text[] not null default '{}',

  images            text[] not null default '{}',
  video_url         text,
  brochure_url      text,
  map_lat           double precision,
  map_lng           double precision,

  featured          boolean not null default false,
  published         boolean not null default false,
  sort              integer not null default 100,

  owner_offer_id    uuid references vault_offers(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists vault_listings_public_idx
  on vault_listings (visibility, published, sort)
  where published and visibility = 'public';

-- ---------------------------------------------------------- requests -------
-- §4 — the private request concierge, and §7's bespoke sourcing mandate. They
-- are one record: a mandate IS a qualified request, so splitting them would
-- mean re-keying everything the client already told us.

create sequence if not exists vault_request_ref_seq start 1001;

create table if not exists vault_requests (
  id                      uuid primary key default gen_random_uuid(),
  reference               text not null unique
                            default ('VR-' || lpad(nextval('vault_request_ref_seq')::text, 5, '0')),
  intent                  vault_intent not null,       -- 'buy' | 'rent'

  name                    text not null,
  mobile                  text not null,
  whatsapp                text,
  email                   text,
  preferred_contact       text,

  asset_sought            text,
  preferred_location      text,
  alt_locations           text,
  budget_range            text,
  approx_size             text,
  intended_use            text,
  required_features       text,
  possession_date         date,
  rental_duration         text,
  additional_requirements text,

  -- ⚠️ `confidential_notes` is the field a client uses to say something they
  -- would not say on a form. It is never rendered anywhere public, never
  -- included in a match payload, and never leaves the admin console.
  confidential_notes      text,

  brief                   text,   -- "Describe what you are looking for"
  attachments             text[] not null default '{}',

  ref                     text,
  campaign                text,
  source_url              text,

  status                  vault_request_status not null default 'new',
  assigned_to             uuid references profiles(id) on delete set null,
  internal_notes          text,
  follow_up_on            date,

  consent                 boolean not null default false,
  consent_at              timestamptz,

  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create index if not exists vault_requests_status_idx on vault_requests (status, created_at desc);
create index if not exists vault_requests_mobile_idx on vault_requests (mobile);

-- ----------------------------------------------------------- matches -------
-- §8. ⚠️ A match is a SUGGESTION until an administrator approves it, and
-- approving it still does not disclose anybody's contact details — the columns
-- to do that deliberately do not exist here.

create table if not exists vault_matches (
  id           uuid primary key default gen_random_uuid(),
  request_id   uuid not null references vault_requests(id) on delete cascade,
  listing_id   uuid references vault_listings(id) on delete cascade,
  offer_id     uuid references vault_offers(id) on delete cascade,
  score        integer not null default 0,
  reason       text,
  status       vault_match_status not null default 'suggested',
  approved_by  uuid references profiles(id) on delete set null,
  approved_at  timestamptz,
  created_at   timestamptz not null default now(),
  -- A match must point at exactly one thing.
  constraint vault_matches_one_target
    check ((listing_id is not null) <> (offer_id is not null))
);

create unique index if not exists vault_matches_req_listing_idx
  on vault_matches (request_id, listing_id) where listing_id is not null;
create unique index if not exists vault_matches_req_offer_idx
  on vault_matches (request_id, offer_id) where offer_id is not null;

-- ---------------------------------------------------------- settings -------
-- §19 — hero copy, FAQs, legal notices, SEO. Anything the console should be
-- able to change without a deploy lives here as jsonb.

create table if not exists vault_settings (
  key        text primary key,
  value      jsonb not null default '{}'::jsonb,
  is_public  boolean not null default true,
  updated_at timestamptz not null default now()
);

-- --------------------------------------------------------------- RLS -------
alter table vault_categories   enable row level security;
alter table vault_destinations enable row level security;
alter table vault_listings     enable row level security;
alter table vault_offers       enable row level security;
alter table vault_requests     enable row level security;
alter table vault_matches      enable row level security;
alter table vault_settings     enable row level security;

-- Taxonomy and settings: readable by anyone, writable only by a super admin.
drop policy if exists vault_categories_read on vault_categories;
create policy vault_categories_read on vault_categories
  for select to anon, authenticated using (active);
drop policy if exists vault_categories_admin on vault_categories;
create policy vault_categories_admin on vault_categories
  for all to authenticated using (is_super_admin()) with check (is_super_admin());

drop policy if exists vault_destinations_read on vault_destinations;
create policy vault_destinations_read on vault_destinations
  for select to anon, authenticated using (active);
drop policy if exists vault_destinations_admin on vault_destinations;
create policy vault_destinations_admin on vault_destinations
  for all to authenticated using (is_super_admin()) with check (is_super_admin());

drop policy if exists vault_settings_read on vault_settings;
create policy vault_settings_read on vault_settings
  for select to anon, authenticated using (is_public);
drop policy if exists vault_settings_admin on vault_settings;
create policy vault_settings_admin on vault_settings
  for all to authenticated using (is_super_admin()) with check (is_super_admin());

-- §6 — the three visibility levels, enforced in one place. `public` is the ONLY
-- value an anonymous visitor can see, and it must also be `published`.
drop policy if exists vault_listings_public_read on vault_listings;
create policy vault_listings_public_read on vault_listings
  for select to anon, authenticated
  using (published and visibility = 'public');
drop policy if exists vault_listings_admin on vault_listings;
create policy vault_listings_admin on vault_listings
  for all to authenticated using (is_super_admin()) with check (is_super_admin());

-- ⚠️ NO anon policy on these three, by design. RLS denies by default, so an
-- anonymous reader gets zero rows however the query is written. Writes arrive
-- only through the SECURITY DEFINER functions below.
drop policy if exists vault_requests_admin on vault_requests;
create policy vault_requests_admin on vault_requests
  for all to authenticated using (is_super_admin()) with check (is_super_admin());

drop policy if exists vault_offers_admin on vault_offers;
create policy vault_offers_admin on vault_offers
  for all to authenticated using (is_super_admin()) with check (is_super_admin());

drop policy if exists vault_matches_admin on vault_matches;
create policy vault_matches_admin on vault_matches
  for all to authenticated using (is_super_admin()) with check (is_super_admin());

-- --------------------------------------------------------- storage ---------
-- A PRIVATE bucket. §20: "Never expose private listing URLs or documents
-- through predictable public URLs." Owner title deeds and client reference
-- files must not be one guessed path away from the open internet, so unlike
-- `property-media` this bucket has `public = false` and no anon SELECT policy —
-- administrators reach it with a signed URL.
insert into storage.buckets (id, name, public, file_size_limit)
values ('vault', 'vault', false, 26214400)
on conflict (id) do nothing;

-- Write-only drop box: anyone may add a file, nobody but a super admin may read
-- one back. The 25 MB cap above is what bounds the abuse.
drop policy if exists vault_bucket_insert on storage.objects;
create policy vault_bucket_insert on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'vault');

drop policy if exists vault_bucket_admin on storage.objects;
create policy vault_bucket_admin on storage.objects
  for select to authenticated
  using (bucket_id = 'vault' and is_super_admin());

-- ------------------------------------------------------------ RPCs ---------

/**
 * §4 — a client's private requirement.
 *
 * Mirrors `website_enquiry` (0078) in every respect that matters: validate,
 * de-duplicate, rate-limit, insert, tell the desk. It does NOT write to `leads`
 * — a Vault requirement is not a marketplace enquiry and must not enter the
 * promoter commission path.
 */
create or replace function public.vault_request(
  p_intent      text,
  p_name        text,
  p_mobile      text,
  p_email       text default null,
  p_whatsapp    text default null,
  p_preferred   text default null,
  p_asset       text default null,
  p_location    text default null,
  p_alt         text default null,
  p_budget      text default null,
  p_size        text default null,
  p_use         text default null,
  p_features    text default null,
  p_possession  date default null,
  p_duration    text default null,
  p_additional  text default null,
  p_confidential text default null,
  p_brief       text default null,
  p_attachments text[] default '{}',
  p_ref         text default null,
  p_campaign    text default null,
  p_source_url  text default null,
  p_consent     boolean default false
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_name   text := trim(coalesce(p_name, ''));
  v_mobile text := regexp_replace(coalesce(p_mobile, ''), '\D', '', 'g');
  v_email  text := nullif(lower(trim(coalesce(p_email, ''))), '');
  v_wa     text := regexp_replace(coalesce(p_whatsapp, ''), '\D', '', 'g');
  v_intent vault_intent;
  v_ref    text;
begin
  if lower(coalesce(p_intent, '')) not in ('buy', 'rent') then
    return jsonb_build_object('ok', false, 'error', 'Please choose whether you want to buy or to rent.');
  end if;
  -- ⚠️ The cast is explicit. A bare assignment of a text expression into an
  -- enum variable is fine, but a CASE would not be — see the plpgsql note in
  -- 0042. Keeping the cast here means this line survives being edited into one.
  v_intent := lower(p_intent)::vault_intent;

  if length(v_name) < 2 or length(v_name) > 80 then
    return jsonb_build_object('ok', false, 'error', 'Please enter your name.');
  end if;

  -- Accept +91 with or without the country code, exactly as `website_enquiry`
  -- does, so the two forms cannot disagree about what a valid number is.
  if v_mobile ~ '^91[0-9]{10}$' then v_mobile := right(v_mobile, 10); end if;
  if v_mobile !~ '^[6-9][0-9]{9}$' then
    return jsonb_build_object('ok', false, 'error', 'Please enter a valid 10-digit mobile number.');
  end if;
  if v_wa ~ '^91[0-9]{10}$' then v_wa := right(v_wa, 10); end if;
  if v_wa !~ '^[6-9][0-9]{9}$' then v_wa := null; end if;

  if v_email is not null and v_email !~ '^[^@\s]+@[^@\s.]+\.[^@\s]+$' then
    return jsonb_build_object('ok', false, 'error', 'That email address does not look right.');
  end if;

  -- A double submit inside ten minutes is the same requirement, not a new one.
  -- Reported as success: telling a client "you already sent this" reads as an
  -- error to them and there is nothing for them to do about it.
  select reference into v_ref
    from vault_requests
   where mobile = v_mobile and created_at > now() - interval '10 minutes'
   limit 1;
  if v_ref is not null then
    return jsonb_build_object('ok', true, 'reference', v_ref, 'note', 'already_received');
  end if;

  if (select count(*) from vault_requests
       where mobile = v_mobile and created_at > now() - interval '24 hours') >= 8 then
    return jsonb_build_object('ok', true, 'note', 'already_received');
  end if;

  insert into vault_requests (
    intent, name, mobile, whatsapp, email, preferred_contact,
    asset_sought, preferred_location, alt_locations, budget_range, approx_size,
    intended_use, required_features, possession_date, rental_duration,
    additional_requirements, confidential_notes, brief, attachments,
    ref, campaign, source_url, consent, consent_at
  ) values (
    v_intent, v_name, v_mobile, v_wa, v_email,
    nullif(left(trim(coalesce(p_preferred, '')), 40), ''),
    nullif(left(trim(coalesce(p_asset, '')), 200), ''),
    nullif(left(trim(coalesce(p_location, '')), 200), ''),
    nullif(left(trim(coalesce(p_alt, '')), 300), ''),
    nullif(left(trim(coalesce(p_budget, '')), 120), ''),
    nullif(left(trim(coalesce(p_size, '')), 120), ''),
    nullif(left(trim(coalesce(p_use, '')), 200), ''),
    nullif(left(trim(coalesce(p_features, '')), 600), ''),
    p_possession,
    nullif(left(trim(coalesce(p_duration, '')), 120), ''),
    nullif(left(trim(coalesce(p_additional, '')), 2000), ''),
    nullif(left(trim(coalesce(p_confidential, '')), 2000), ''),
    nullif(left(trim(coalesce(p_brief, '')), 4000), ''),
    coalesce(p_attachments, '{}'),
    nullif(upper(trim(coalesce(p_ref, ''))), ''),
    nullif(left(trim(coalesce(p_campaign, '')), 120), ''),
    left(coalesce(p_source_url, ''), 500),
    coalesce(p_consent, false),
    case when coalesce(p_consent, false) then now() else null end
  )
  returning reference into v_ref;

  -- Tell the desk. Same mechanism the app already uses for every other alert.
  insert into notifications (user_id, type, title, body, meta)
  select p.id, 'lead', 'New Vault requirement',
         v_name || ' has sent a private requirement to The Vault (' || v_ref || ').',
         jsonb_build_object('source', 'vault', 'reference', v_ref)
    from profiles p
   where p.role = 'super_admin';

  return jsonb_build_object('ok', true, 'reference', v_ref);
end;
$function$;

/**
 * §5 — an owner offering a property to The Vault.
 *
 * ⚠️ `p_off_market` sets BOTH the owner's stated wish and the enforced
 * visibility, and there is no argument that can set `visibility` to anything
 * else. A property can only become publicly visible by an administrator
 * deliberately changing it in the console — never as a side effect of a form.
 */
create or replace function public.vault_offer(
  p_intent       text,
  p_name         text,
  p_mobile       text,
  p_email        text default null,
  p_whatsapp     text default null,
  p_type         text default null,
  p_location     text default null,
  p_price        text default null,
  p_rent         text default null,
  p_land_area    text default null,
  p_built_area   text default null,
  p_bedrooms     integer default null,
  p_description  text default null,
  p_ownership    text default null,
  p_availability text default null,
  p_furnishing   text default null,
  p_amenities    text default null,
  p_map          text default null,
  p_coordinates  text default null,
  p_instructions text default null,
  p_photos       text[] default '{}',
  p_videos       text[] default '{}',
  p_brochures    text[] default '{}',
  p_documents    text[] default '{}',
  p_off_market   boolean default false,
  p_source_url   text default null,
  p_consent      boolean default false
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_name   text := trim(coalesce(p_name, ''));
  v_mobile text := regexp_replace(coalesce(p_mobile, ''), '\D', '', 'g');
  v_email  text := nullif(lower(trim(coalesce(p_email, ''))), '');
  v_wa     text := regexp_replace(coalesce(p_whatsapp, ''), '\D', '', 'g');
  v_intent vault_intent;
  v_off    boolean := coalesce(p_off_market, false);
  v_ref    text;
begin
  if lower(coalesce(p_intent, '')) not in ('sell', 'lease') then
    return jsonb_build_object('ok', false, 'error', 'Please choose whether you want to sell or to lease.');
  end if;
  v_intent := lower(p_intent)::vault_intent;

  if length(v_name) < 2 or length(v_name) > 80 then
    return jsonb_build_object('ok', false, 'error', 'Please enter your name.');
  end if;

  if v_mobile ~ '^91[0-9]{10}$' then v_mobile := right(v_mobile, 10); end if;
  if v_mobile !~ '^[6-9][0-9]{9}$' then
    return jsonb_build_object('ok', false, 'error', 'Please enter a valid 10-digit mobile number.');
  end if;
  if v_wa ~ '^91[0-9]{10}$' then v_wa := right(v_wa, 10); end if;
  if v_wa !~ '^[6-9][0-9]{9}$' then v_wa := null; end if;

  if v_email is not null and v_email !~ '^[^@\s]+@[^@\s.]+\.[^@\s]+$' then
    return jsonb_build_object('ok', false, 'error', 'That email address does not look right.');
  end if;

  select reference into v_ref
    from vault_offers
   where mobile = v_mobile and created_at > now() - interval '10 minutes'
   limit 1;
  if v_ref is not null then
    return jsonb_build_object('ok', true, 'reference', v_ref, 'note', 'already_received');
  end if;

  if (select count(*) from vault_offers
       where mobile = v_mobile and created_at > now() - interval '24 hours') >= 8 then
    return jsonb_build_object('ok', true, 'note', 'already_received');
  end if;

  insert into vault_offers (
    intent, owner_name, mobile, whatsapp, email,
    property_type, property_location, expected_price, expected_rent,
    land_area, built_area, bedrooms, description, ownership_status,
    availability, furnishing, amenities, map_link, coordinates,
    special_instructions, photos, videos, brochures, documents,
    off_market, visibility, source_url, consent, consent_at
  ) values (
    v_intent, v_name, v_mobile, v_wa, v_email,
    nullif(left(trim(coalesce(p_type, '')), 200), ''),
    nullif(left(trim(coalesce(p_location, '')), 300), ''),
    nullif(left(trim(coalesce(p_price, '')), 120), ''),
    nullif(left(trim(coalesce(p_rent, '')), 120), ''),
    nullif(left(trim(coalesce(p_land_area, '')), 120), ''),
    nullif(left(trim(coalesce(p_built_area, '')), 120), ''),
    p_bedrooms,
    nullif(left(trim(coalesce(p_description, '')), 4000), ''),
    nullif(left(trim(coalesce(p_ownership, '')), 200), ''),
    nullif(left(trim(coalesce(p_availability, '')), 200), ''),
    nullif(left(trim(coalesce(p_furnishing, '')), 120), ''),
    nullif(left(trim(coalesce(p_amenities, '')), 1000), ''),
    nullif(left(trim(coalesce(p_map, '')), 500), ''),
    nullif(left(trim(coalesce(p_coordinates, '')), 120), ''),
    nullif(left(trim(coalesce(p_instructions, '')), 2000), ''),
    coalesce(p_photos, '{}'), coalesce(p_videos, '{}'),
    coalesce(p_brochures, '{}'), coalesce(p_documents, '{}'),
    v_off,
    -- Both branches are private. The difference is only which kind of private.
    (case when v_off then 'off_market' else 'private' end)::vault_visibility,
    left(coalesce(p_source_url, ''), 500),
    coalesce(p_consent, false),
    case when coalesce(p_consent, false) then now() else null end
  )
  returning reference into v_ref;

  insert into notifications (user_id, type, title, body, meta)
  select p.id, 'lead', 'New Vault property offered',
         v_name || ' has offered a property to The Vault (' || v_ref || ').'
           || case when v_off then ' Marked OFF-MARKET.' else '' end,
         jsonb_build_object('source', 'vault', 'reference', v_ref, 'off_market', v_off)
    from profiles p
   where p.role = 'super_admin';

  return jsonb_build_object('ok', true, 'reference', v_ref);
end;
$function$;

-- ⚠️ Explicit, because a bare `revoke ... from public` does not stop the anon
-- and authenticated roles — they hold their grants directly.
grant execute on function public.vault_request(
  text, text, text, text, text, text, text, text, text, text, text, text, text,
  date, text, text, text, text, text[], text, text, text, boolean
) to anon, authenticated;

grant execute on function public.vault_offer(
  text, text, text, text, text, text, text, text, text, text, text, integer,
  text, text, text, text, text, text, text, text, text[], text[], text[], text[],
  boolean, text, boolean
) to anon, authenticated;

commit;
