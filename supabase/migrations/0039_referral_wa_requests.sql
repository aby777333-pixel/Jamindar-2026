-- 0039 — WhatsApp download-link requests from the public /welcome landing.
-- When an invitee taps "Get the app on WhatsApp" (with ?ref=JA-REF-xxxxx) the
-- landing logs the request here, so the desk sees WHO asked and with WHICH
-- invite code, and can Accept it (credits the referrer a 'download' event).
-- Additive & non-breaking: new table + two RPCs, nothing existing changes.

create table if not exists public.referral_wa_requests (
  id          uuid primary key default gen_random_uuid(),
  code        text,                                   -- invite/partner code as typed in the link (may be unknown)
  referrer_id uuid references public.profiles(id) on delete set null,
  source      text not null default 'invite' check (source in ('invite','property','generic')),
  property_id uuid,
  status      text not null default 'new' check (status in ('new','accepted','dismissed')),
  meta        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  handled_at  timestamptz,
  handled_by  uuid references public.profiles(id) on delete set null
);

create index if not exists referral_wa_requests_status_idx on public.referral_wa_requests (status, created_at desc);

alter table public.referral_wa_requests enable row level security;

-- Admins read & update from the console; inserts happen only via the RPC below.
drop policy if exists "wa_requests admin read" on public.referral_wa_requests;
create policy "wa_requests admin read" on public.referral_wa_requests
  for select using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin'));
drop policy if exists "wa_requests admin update" on public.referral_wa_requests;
create policy "wa_requests admin update" on public.referral_wa_requests
  for update using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin'));

-- 2026-10-30 grant flip: new tables need explicit grants (RLS still gates rows).
grant select, update on public.referral_wa_requests to authenticated;

-- Anonymous logger called by the landing page right before opening wa.me.
-- Resolves the referrer the same way log_referral_click (0030) does; the row is
-- kept even when the code is unknown so the desk still sees the request.
create or replace function public.log_wa_request(
  p_code text default null,
  p_source text default 'invite',
  p_property uuid default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ref uuid;
  v_source text := case when p_source in ('invite','property','generic') then p_source else 'generic' end;
begin
  if p_code is not null and length(p_code) > 64 then return; end if;

  if p_code is not null then
    select id into v_ref from public.profiles
     where referral_code = p_code or partner_code = p_code limit 1;
    if v_ref is null then
      select id into v_ref from public.promoter_profiles
       where referral_code = p_code limit 1;
    end if;
  end if;

  -- collapse rapid double-taps: same code+source already logged as 'new' in the
  -- last 10 minutes → no duplicate row
  if exists (
    select 1 from public.referral_wa_requests r
     where r.status = 'new'
       and coalesce(r.code, '') = coalesce(p_code, '')
       and r.source = v_source
       and r.created_at > now() - interval '10 minutes'
  ) then return; end if;

  insert into public.referral_wa_requests (code, referrer_id, source, property_id, meta)
  values (p_code, v_ref, v_source, p_property, jsonb_build_object('via', 'web_landing'));
end;
$$;

revoke execute on function public.log_wa_request(text, text, uuid) from public;
grant execute on function public.log_wa_request(text, text, uuid) to anon, authenticated;

-- Admin accepts (credits the referrer a 'download' referral event) or dismisses.
create or replace function public.admin_review_wa_request(
  p_id uuid, p_decision text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.referral_wa_requests;
begin
  if not exists (select 1 from public.profiles p where p.id = v_uid and p.role = 'super_admin') then
    raise exception 'not authorized';
  end if;
  if p_decision not in ('accepted','dismissed') then raise exception 'invalid decision'; end if;

  select * into v_row from public.referral_wa_requests where id = p_id for update;
  if v_row.id is null then raise exception 'request not found'; end if;
  if v_row.status <> 'new' then return; end if;  -- already handled — idempotent

  update public.referral_wa_requests
     set status = p_decision, handled_at = now(), handled_by = v_uid
   where id = p_id;

  if p_decision = 'accepted' and v_row.referrer_id is not null then
    insert into public.referral_events (referrer_id, event_type, meta)
    values (v_row.referrer_id, 'download',
            jsonb_build_object('source', 'wa_request', 'code', v_row.code, 'request_id', v_row.id));
  end if;
end;
$$;

revoke execute on function public.admin_review_wa_request(uuid, text) from public;
grant execute on function public.admin_review_wa_request(uuid, text) to authenticated;
