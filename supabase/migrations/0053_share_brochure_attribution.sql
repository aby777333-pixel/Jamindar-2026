-- Jamindar — 0053: Branded share pages, personalized brochures & full promoter attribution.
-- FULLY ADDITIVE: new site_config table, new columns on brochure_downloads/leads,
-- attribution triggers (exception-guarded so existing flows can never break),
-- and anon-callable RPCs powering the /s/ share pages + /b/ personalized brochures.

-- ─── 1. site_config (admin-manageable copy for share/brochure surfaces) ───
create table if not exists public.site_config (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.site_config enable row level security;
drop policy if exists site_config_read on public.site_config;
create policy site_config_read on public.site_config for select using (true);
drop policy if exists site_config_admin on public.site_config;
create policy site_config_admin on public.site_config for all to authenticated
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'super_admin'))
  with check (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'super_admin'));
grant select on public.site_config to anon, authenticated;
grant insert, update, delete on public.site_config to authenticated;

insert into public.site_config (key, value) values
  ('share', jsonb_build_object(
     'badge_label', 'Verified Jamin Bazaar Partner',
     'brand_name', 'Jamin Properties',
     'tagline', 'Signature for Fortune',
     'desk_phone', '+919384818895',
     'site_base', 'https://merry-begonia-4c3cd1.netlify.app'
  ))
on conflict (key) do nothing;

-- ─── 2. attribution columns ───
alter table public.brochure_downloads
  add column if not exists promoter_id uuid references public.profiles(id) on delete set null,
  add column if not exists ref_code text,
  add column if not exists channel text not null default 'app';
create index if not exists brochure_downloads_promoter_idx on public.brochure_downloads (promoter_id, created_at desc);

alter table public.leads add column if not exists referral_code text;

-- ─── 3. attribution triggers (fill promoter + emit referral_events) ───
-- Resolve the promoter a brochure download belongs to before the row lands.
create or replace function public.bd_fill_promoter()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  begin
    if new.promoter_id is null then
      select coalesce(
        (select p.promoter_id from properties p where p.id = new.property_id),
        (select pr.assigned_promoter from profiles pr where pr.id = new.user_id),
        (select pr.referred_by from profiles pr where pr.id = new.user_id)
      ) into new.promoter_id;
    end if;
  exception when others then null;
  end;
  return new;
end $$;
drop trigger if exists trg_bd_fill_promoter on public.brochure_downloads;
create trigger trg_bd_fill_promoter before insert on public.brochure_downloads
  for each row execute function public.bd_fill_promoter();

create or replace function public.bd_emit_event()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  begin
    if new.promoter_id is not null then
      insert into referral_events (referrer_id, referred_id, event_type, meta)
      values (new.promoter_id, new.user_id, 'download',
              jsonb_build_object('property_id', new.property_id, 'channel', new.channel, 'ref', new.ref_code));
    end if;
  exception when others then null;
  end;
  return new;
end $$;
drop trigger if exists trg_bd_emit_event on public.brochure_downloads;
create trigger trg_bd_emit_event after insert on public.brochure_downloads
  for each row execute function public.bd_emit_event();

-- Leads → 'enquiry' events (covers callback requests, vcard, share pages, escalations).
create or replace function public.lead_emit_event()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  begin
    if new.promoter_id is not null then
      insert into referral_events (referrer_id, referred_id, event_type, meta)
      values (new.promoter_id, new.buyer_id, 'enquiry',
              jsonb_build_object('lead_id', new.id, 'source', new.source, 'property_id', new.property_id, 'ref', new.referral_code));
    end if;
  exception when others then null;
  end;
  return new;
end $$;
drop trigger if exists trg_lead_emit_event on public.leads;
create trigger trg_lead_emit_event after insert on public.leads
  for each row execute function public.lead_emit_event();

-- Site visits → 'site_visit' events.
create or replace function public.visit_emit_event()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  begin
    if new.promoter_id is not null then
      insert into referral_events (referrer_id, referred_id, event_type, meta)
      values (new.promoter_id, new.buyer_id, 'site_visit',
              jsonb_build_object('visit_id', new.id, 'property_id', new.property_id));
    end if;
  exception when others then null;
  end;
  return new;
end $$;
drop trigger if exists trg_visit_emit_event on public.site_visits;
create trigger trg_visit_emit_event after insert on public.site_visits
  for each row execute function public.visit_emit_event();

-- ─── 4. share-page data RPC (anon) ───
create or replace function public.share_page_data(p_property uuid, p_ref text default null)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare
  v_prop jsonb;
  v_promoter jsonb;
  v_cfg jsonb;
begin
  select jsonb_build_object(
    'id', p.id, 'title', p.title, 'slug', p.slug,
    'description', p.description, 'project_phase', p.project_phase,
    'city', p.city, 'taluk', p.taluk, 'district', p.district, 'state', p.state,
    'images', coalesce(p.images, '[]'::jsonb),
    'brochure_url', p.brochure_url,
    'plots_total', p.plots_total, 'plots_available', p.plots_available,
    'amenities', coalesce(p.amenities, '[]'::jsonb),
    'approvals', coalesce(p.approvals, '[]'::jsonb),
    'rera_number', p.rera_number,
    'gmaps_url', p.gmaps_url,
    'translations', coalesce(p.translations, '{}'::jsonb)
  ) into v_prop
  from properties p
  where p.id = p_property and p.status <> 'archived';
  if v_prop is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;

  select jsonb_build_object(
    'id', pr.id,
    'name', pr.full_name,
    'avatar_url', pr.avatar_url,
    'mobile', pr.mobile,
    'email', pr.email,
    'whatsapp', coalesce(nullif(pp.whatsapp, ''), pr.mobile),
    'partner_code', pr.partner_code,
    'referral_code', pr.referral_code,
    'designation', pp.designation,
    'verified', (pr.partner_status = 'verified')
  ) into v_promoter
  from profiles pr
  left join promoter_profiles pp on pp.id = pr.id
  where (pr.role = 'promoter' or pr.partner_status = 'verified' or pr.role = 'super_admin')
    and (upper(coalesce(pr.partner_code, '')) = upper(trim(coalesce(p_ref, '')))
      or upper(coalesce(pr.referral_code, '')) = upper(trim(coalesce(p_ref, ''))))
  limit 1;

  select value into v_cfg from site_config where key = 'share';

  return jsonb_build_object('ok', true, 'property', v_prop, 'promoter', v_promoter,
                            'config', coalesce(v_cfg, '{}'::jsonb));
end $$;
revoke execute on function public.share_page_data(uuid, text) from public;
grant execute on function public.share_page_data(uuid, text) to anon, authenticated, service_role;

-- ─── 5. share event logger (anon; whitelisted events only) ───
create or replace function public.log_share_event(
  p_ref text, p_property uuid default null, p_event text default 'click', p_channel text default 'web')
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_promoter uuid;
begin
  if p_event not in ('click', 'download') then return; end if;
  select id into v_promoter from profiles
   where upper(coalesce(partner_code, '')) = upper(trim(coalesce(p_ref, '')))
      or upper(coalesce(referral_code, '')) = upper(trim(coalesce(p_ref, '')))
   limit 1;
  if v_promoter is null then return; end if;
  if p_event = 'download' then
    insert into brochure_downloads (property_id, user_id, promoter_id, ref_code, channel)
    values (p_property, null, v_promoter, upper(trim(p_ref)), p_channel);
    -- referral_events row is emitted by trg_bd_emit_event
  else
    insert into referral_events (referrer_id, event_type, meta)
    values (v_promoter, 'click', jsonb_build_object('property_id', p_property, 'channel', p_channel, 'ref', upper(trim(p_ref))));
  end if;
exception when others then null;
end $$;
revoke execute on function public.log_share_event(text, uuid, text, text) from public;
grant execute on function public.log_share_event(text, uuid, text, text) to anon, authenticated, service_role;

-- ─── 6. share-page lead capture (anon; mirrors card_inquiry validation) ───
create or replace function public.share_capture_lead(
  p_ref text, p_property uuid, p_name text, p_mobile text,
  p_message text default null, p_intent text default 'enquiry')
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_promoter uuid;
  v_prop_title text;
  v_name text := trim(coalesce(p_name, ''));
  v_mobile text := regexp_replace(coalesce(p_mobile, ''), '\D', '', 'g');
  v_message text := left(trim(coalesce(p_message, '')), 1000);
  v_intent text := case when p_intent = 'site_visit' then 'site_visit' else 'enquiry' end;
  v_source text := case when p_intent = 'site_visit' then 'share_site_visit' else 'share_page' end;
begin
  if length(v_name) < 2 or length(v_name) > 80 then
    return jsonb_build_object('ok', false, 'error', 'Please enter your name.');
  end if;
  if v_mobile ~ '^91[0-9]{10}$' then v_mobile := right(v_mobile, 10); end if;
  if v_mobile !~ '^[6-9][0-9]{9}$' then
    return jsonb_build_object('ok', false, 'error', 'Please enter a valid 10-digit mobile number.');
  end if;

  select id into v_promoter from profiles
   where (role = 'promoter' or partner_status = 'verified' or role = 'super_admin')
     and (upper(coalesce(partner_code, '')) = upper(trim(coalesce(p_ref, '')))
       or upper(coalesce(referral_code, '')) = upper(trim(coalesce(p_ref, ''))))
   limit 1;
  if v_promoter is null then
    -- fall back to the property's promoter so no web lead is ever lost
    select promoter_id into v_promoter from properties where id = p_property;
  end if;

  select title into v_prop_title from properties where id = p_property;

  if exists (
    select 1 from leads
     where coalesce(promoter_id, '00000000-0000-0000-0000-000000000000') = coalesce(v_promoter, '00000000-0000-0000-0000-000000000000')
       and source = v_source
       and notes like '%+91' || v_mobile || '%'
       and created_at > now() - interval '10 minutes'
  ) then
    return jsonb_build_object('ok', true, 'note', 'already_received');
  end if;

  insert into leads (promoter_id, property_id, source, status, referral_code, notes)
  values (
    v_promoter, p_property, v_source, 'new', upper(trim(coalesce(p_ref, ''))),
    case when v_intent = 'site_visit' then 'Site-visit request — ' else 'Share-page enquiry — ' end
      || v_name || ' · +91' || v_mobile
      || coalesce(' · ' || nullif(v_prop_title, ''), '')
      || case when v_message <> '' then E'\n' || v_message else '' end
  );

  if v_promoter is not null then
    insert into notifications (user_id, type, title, body, meta)
    values (
      v_promoter, 'lead',
      case when v_intent = 'site_visit' then 'New site-visit request 🏡' else 'New enquiry from your share link' end,
      v_name || ' (+91' || v_mobile || ')' ||
      case when v_prop_title is not null then ' is interested in ' || v_prop_title else ' reached out from your shared link.' end,
      jsonb_build_object('source', v_source, 'property_id', p_property)
    );
  end if;

  return jsonb_build_object('ok', true);
end $$;
revoke execute on function public.share_capture_lead(text, uuid, text, text, text, text) from public;
grant execute on function public.share_capture_lead(text, uuid, text, text, text, text) to anon, authenticated, service_role;
