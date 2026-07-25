-- 0021 — Communication hub.
-- Additive & non-breaking.
--
-- Three pieces:
--   1. platform_contacts — the Jamin desk's own numbers (admin-editable, not hardcoded).
--   2. communication_events — an append-only log of every contact attempt:
--      who, whom, which channel, when, and the related property / visit / lead.
--   3. resolve_contact() — the routing brain. profiles RLS deliberately hides
--      other people's rows, so this SECURITY DEFINER function is the ONLY way a
--      user obtains a counterpart's number, and it applies Jamin's business
--      rules: a buyer reaches their assigned promoter (never a seller directly),
--      a promoter reaches their own buyers, an admin reaches anyone, and
--      anything unroutable falls back to the Jamin desk.
--
-- Role note: user_role is (super_admin, promoter, buyer).
-- "agent / broker / partner" map to promoter; "support" maps to super_admin.

-- ── 1. the Jamin desk ──────────────────────────────────────────────────────
create table if not exists public.platform_contacts (
  id          text primary key,            -- 'jamin_desk'
  label       text not null,
  mobile      text,
  whatsapp    text,
  email       text,
  is_active   boolean not null default true,
  updated_at  timestamptz not null default now()
);

alter table public.platform_contacts enable row level security;

drop policy if exists pc_read on public.platform_contacts;
create policy pc_read on public.platform_contacts for select to anon, authenticated
  using (is_active);

drop policy if exists pc_admin on public.platform_contacts;
create policy pc_admin on public.platform_contacts for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin'));

insert into public.platform_contacts (id, label, mobile, whatsapp, email)
values ('jamin_desk', 'Jamin Properties Help Desk', null, null, null)
on conflict (id) do nothing;

-- ── 2. communication event log ─────────────────────────────────────────────
create table if not exists public.communication_events (
  id             uuid primary key default gen_random_uuid(),
  actor_id       uuid not null references public.profiles(id) on delete cascade,
  recipient_id   uuid references public.profiles(id) on delete set null,
  channel        text not null,
  direction      text not null default 'outbound',
  property_id    uuid references public.properties(id) on delete set null,
  visit_id       uuid references public.site_visits(id) on delete set null,
  lead_id        uuid references public.leads(id) on delete set null,
  routed_via     uuid references public.profiles(id) on delete set null,
  routing_reason text,
  status         text not null default 'initiated',
  meta           jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);

do $$ begin
  alter table public.communication_events add constraint communication_events_channel_chk
    check (channel in ('phone','whatsapp_call','whatsapp_message','sms','email','in_app_chat','callback_request'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.communication_events add constraint communication_events_direction_chk
    check (direction in ('outbound','inbound'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.communication_events add constraint communication_events_status_chk
    check (status in ('initiated','delivered','failed'));
exception when duplicate_object then null; end $$;

create index if not exists idx_commev_actor on public.communication_events(actor_id, created_at desc);
create index if not exists idx_commev_recipient on public.communication_events(recipient_id, created_at desc);
create index if not exists idx_commev_property on public.communication_events(property_id, created_at desc);

alter table public.communication_events enable row level security;

-- read: the two parties involved, plus the admin desk. Writes go through the RPC.
drop policy if exists commev_read on public.communication_events;
create policy commev_read on public.communication_events for select to authenticated
  using (
    actor_id = auth.uid()
    or recipient_id = auth.uid()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin')
  );

grant select on public.communication_events to authenticated;
grant select on public.platform_contacts to anon, authenticated;
grant insert, update, delete on public.platform_contacts to authenticated; -- RLS gates to super_admin

-- ── 3. contact routing ─────────────────────────────────────────────────────
-- Returns the counterpart a caller is allowed to contact, with the numbers the
-- client needs to open the native channels. Never exposes an arbitrary profile.
create or replace function public.resolve_contact(
  p_property_id uuid default null,
  p_counterpart uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid       uuid := auth.uid();
  v_role      public.user_role;
  v_mine      uuid;
  v_target    uuid;
  v_reason    text := 'assigned_promoter';
  v_routed    boolean := false;
  v_rec       record;
  v_desk      record;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  select role, assigned_promoter into v_role, v_mine from public.profiles where id = v_uid;

  if v_role = 'super_admin' then
    -- the desk may reach anyone it names, otherwise the property's promoter
    v_target := coalesce(p_counterpart, (select promoter_id from public.properties where id = p_property_id));
    v_reason := 'admin_direct';

  elsif v_role = 'promoter' then
    -- a promoter may reach a buyer assigned to them, or their own admin desk
    if p_counterpart is not null then
      if exists (select 1 from public.profiles b where b.id = p_counterpart and b.assigned_promoter = v_uid) then
        v_target := p_counterpart;
        v_reason := 'own_client';
      elsif exists (select 1 from public.site_visits sv where sv.buyer_id = p_counterpart and sv.promoter_id = v_uid) then
        v_target := p_counterpart;
        v_reason := 'own_visit_client';
      elsif exists (select 1 from public.leads l where l.buyer_id = p_counterpart and l.promoter_id = v_uid) then
        v_target := p_counterpart;
        v_reason := 'own_lead';
      else
        v_target := null;              -- not their client → route to the desk
        v_reason := 'not_your_client';
        v_routed := true;
      end if;
    else
      v_target := null;
      v_reason := 'jamin_desk';
    end if;

  else
    -- buyer: always the assigned promoter for this property, never a seller.
    v_target := coalesce(
      (select promoter_id from public.properties where id = p_property_id),
      v_mine
    );
    if p_counterpart is not null and p_counterpart <> coalesce(v_target, '00000000-0000-0000-0000-000000000000'::uuid) then
      -- asked for someone else → routed through the assigned partner instead
      v_routed := true;
      v_reason := 'routed_via_partner';
    end if;
  end if;

  -- run unconditionally: a plpgsql record must be assigned before it is read,
  -- and a no-row SELECT INTO still assigns it (all-null).
  select p.id, p.full_name, p.mobile, p.email, p.avatar_url, p.role::text as role,
         p.partner_status, p.member_code,
         pp.whatsapp, pp.designation
    into v_rec
    from public.profiles p
    left join public.promoter_profiles pp on pp.id = p.id
   where p.id = v_target;

  if v_rec.id is not null then
    return jsonb_build_object(
      'kind', 'person',
      'id', v_rec.id,
      'full_name', v_rec.full_name,
      'mobile', v_rec.mobile,
      'whatsapp', coalesce(v_rec.whatsapp, v_rec.mobile),
      'email', v_rec.email,
      'avatar_url', v_rec.avatar_url,
      'role', v_rec.role,
      'designation', v_rec.designation,
      'partner_status', v_rec.partner_status,
      'member_code', v_rec.member_code,
      'routed', v_routed,
      'reason', v_reason
    );
  end if;

  -- fallback: the Jamin desk
  select * into v_desk from public.platform_contacts where id = 'jamin_desk' and is_active;
  return jsonb_build_object(
    'kind', 'desk',
    'id', null,
    'full_name', coalesce(v_desk.label, 'Jamin Properties Help Desk'),
    'mobile', v_desk.mobile,
    'whatsapp', coalesce(v_desk.whatsapp, v_desk.mobile),
    'email', v_desk.email,
    'avatar_url', null,
    'role', 'support',
    'designation', 'Jamin Help Desk',
    'partner_status', null,
    'member_code', null,
    'routed', true,
    'reason', v_reason
  );
end $$;

revoke execute on function public.resolve_contact(uuid, uuid) from public;
grant  execute on function public.resolve_contact(uuid, uuid) to authenticated;

-- ── 4. communication logging ───────────────────────────────────────────────
create or replace function public.log_communication(
  p_channel        text,
  p_recipient_id   uuid default null,
  p_property_id    uuid default null,
  p_visit_id       uuid default null,
  p_lead_id        uuid default null,
  p_routed_via     uuid default null,
  p_routing_reason text default null,
  p_status         text default 'initiated',
  p_meta           jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id  uuid;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if p_channel not in ('phone','whatsapp_call','whatsapp_message','sms','email','in_app_chat','callback_request') then
    raise exception 'invalid channel';
  end if;

  insert into public.communication_events
    (actor_id, recipient_id, channel, property_id, visit_id, lead_id, routed_via, routing_reason, status, meta)
  values
    (v_uid, p_recipient_id, p_channel, p_property_id, p_visit_id, p_lead_id, p_routed_via, p_routing_reason,
     coalesce(p_status, 'initiated'), coalesce(p_meta, '{}'::jsonb))
  returning id into v_id;

  insert into public.activity_log (user_id, event_type, meta)
  values (v_uid, 'communication_' || p_channel,
          jsonb_build_object('recipient_id', p_recipient_id, 'property_id', p_property_id,
                             'visit_id', p_visit_id, 'event_id', v_id));

  return v_id;
end $$;

revoke execute on function public.log_communication(text, uuid, uuid, uuid, uuid, uuid, text, text, jsonb) from public;
grant  execute on function public.log_communication(text, uuid, uuid, uuid, uuid, uuid, text, text, jsonb) to authenticated;
