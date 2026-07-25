-- 0020 — Site-visit booking system.
-- Additive & non-breaking: existing site_visits rows keep working (preferred_date
-- stays populated); everything new is nullable or defaulted.
--
-- Adds: real date+time scheduling, admin-configurable time slots, a human
-- booking reference, and SECURITY DEFINER RPCs for book / reschedule / cancel /
-- status that notify every involved party and write the audit spine.
--
-- Role note: this app's user_role enum is (super_admin, promoter, buyer).
-- "agent / broker / partner" map to `promoter`; "support" maps to `super_admin`.

-- ── 1. site_visits: scheduling + lifecycle columns ──────────────────────────
alter table public.site_visits add column if not exists scheduled_at    timestamptz;
alter table public.site_visits add column if not exists slot_label      text;
alter table public.site_visits add column if not exists visit_ref       text;
alter table public.site_visits add column if not exists created_by      uuid references public.profiles(id) on delete set null;
alter table public.site_visits add column if not exists updated_at      timestamptz not null default now();
alter table public.site_visits add column if not exists cancelled_at    timestamptz;
alter table public.site_visits add column if not exists cancelled_by    uuid references public.profiles(id) on delete set null;
alter table public.site_visits add column if not exists cancel_reason   text;
alter table public.site_visits add column if not exists reschedule_count integer not null default 0;

create index if not exists idx_site_visits_scheduled on public.site_visits(scheduled_at);
create index if not exists idx_site_visits_buyer on public.site_visits(buyer_id, created_at desc);
create index if not exists idx_site_visits_promoter on public.site_visits(promoter_id, status);
create unique index if not exists site_visits_ref_key on public.site_visits(visit_ref) where visit_ref is not null;

-- keep updated_at fresh (shared helper from 0001)
drop trigger if exists trg_site_visits_touch on public.site_visits;
create trigger trg_site_visits_touch before update on public.site_visits
  for each row execute function public.touch_updated_at();

-- human booking reference: SV-000001
create sequence if not exists public.site_visit_ref_seq start with 1 increment by 1;

create or replace function public.assign_visit_ref()
returns trigger
language plpgsql
as $$
begin
  if new.visit_ref is null then
    new.visit_ref := 'SV-' || lpad(nextval('public.site_visit_ref_seq')::text, 6, '0');
  end if;
  -- keep the legacy date column in step with the new timestamp
  if new.scheduled_at is not null then
    new.preferred_date := (new.scheduled_at at time zone 'Asia/Kolkata')::date;
  end if;
  return new;
end $$;

revoke execute on function public.assign_visit_ref() from public;

drop trigger if exists trg_assign_visit_ref on public.site_visits;
create trigger trg_assign_visit_ref before insert or update on public.site_visits
  for each row execute function public.assign_visit_ref();

-- backfill references for rows created before this migration
update public.site_visits
   set visit_ref = 'SV-' || lpad(nextval('public.site_visit_ref_seq')::text, 6, '0')
 where visit_ref is null;

-- ── 2. admin-configurable time slots ───────────────────────────────────────
create table if not exists public.site_visit_slots (
  id          uuid primary key default gen_random_uuid(),
  label       text    not null,
  hour        integer not null,
  minute      integer not null default 0,
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

do $$ begin
  alter table public.site_visit_slots add constraint site_visit_slots_hour_chk check (hour between 0 and 23);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.site_visit_slots add constraint site_visit_slots_minute_chk check (minute between 0 and 59);
exception when duplicate_object then null; end $$;

alter table public.site_visit_slots enable row level security;

drop policy if exists svs_read on public.site_visit_slots;
create policy svs_read on public.site_visit_slots for select to anon, authenticated
  using (true);

drop policy if exists svs_admin on public.site_visit_slots;
create policy svs_admin on public.site_visit_slots for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin'));

insert into public.site_visit_slots (label, hour, minute, sort_order)
select * from (values
  ('10:00 AM', 10, 0, 1),
  ('11:30 AM', 11, 30, 2),
  ('2:00 PM',  14, 0, 3),
  ('4:00 PM',  16, 0, 4),
  ('5:30 PM',  17, 30, 5)
) as v(label, hour, minute, sort_order)
where not exists (select 1 from public.site_visit_slots);

-- ── 3. internal notification helper ────────────────────────────────────────
-- notifications has no client INSERT policy by design; only definer functions
-- may write. This helper is deliberately NOT granted to authenticated.
create or replace function public.notify_user(
  p_user  uuid,
  p_type  text,
  p_title text,
  p_body  text,
  p_meta  jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user is null then return; end if;
  insert into public.notifications (user_id, type, title, body, meta)
  values (p_user, coalesce(p_type, 'info'), p_title, p_body, coalesce(p_meta, '{}'::jsonb));
end $$;

revoke execute on function public.notify_user(uuid, text, text, text, jsonb) from public;

-- notify every super admin (support desk)
create or replace function public.notify_admins(
  p_type  text,
  p_title text,
  p_body  text,
  p_meta  jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare r record;
begin
  for r in select id from public.profiles where role = 'super_admin' and is_active loop
    perform public.notify_user(r.id, p_type, p_title, p_body, p_meta);
  end loop;
end $$;

revoke execute on function public.notify_admins(text, text, text, jsonb) from public;

-- ── 4. booking RPCs ────────────────────────────────────────────────────────

-- Book a visit. Returns the new visit id.
create or replace function public.book_site_visit(
  p_property_id  uuid,
  p_scheduled_at timestamptz,
  p_slot_label   text default null,
  p_notes        text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid        uuid := auth.uid();
  v_promoter   uuid;
  v_mine       uuid;
  v_title      text;
  v_visit      uuid;
  v_ref        text;
  v_buyer_name text;
  v_when       text;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  if p_scheduled_at is null then
    raise exception 'a visit date and time is required';
  end if;
  if p_scheduled_at < now() then
    raise exception 'please choose a future date and time';
  end if;

  select assigned_promoter into v_mine from public.profiles where id = v_uid;

  select pr.title, coalesce(pr.promoter_id, v_mine)
    into v_title, v_promoter
    from public.properties pr
   where pr.id = p_property_id;

  if v_title is null then
    raise exception 'property not found';
  end if;

  insert into public.site_visits (property_id, buyer_id, promoter_id, scheduled_at, slot_label, status, notes, created_by)
  values (p_property_id, v_uid, v_promoter, p_scheduled_at, p_slot_label, 'requested', p_notes, v_uid)
  returning id, visit_ref into v_visit, v_ref;

  select full_name into v_buyer_name from public.profiles where id = v_uid;
  v_when := to_char(p_scheduled_at at time zone 'Asia/Kolkata', 'Dy DD Mon') ||
            coalesce(' · ' || p_slot_label, '');

  -- the buyer gets a confirmation
  perform public.notify_user(
    v_uid, 'visit', 'Site visit requested',
    v_title || ' — ' || v_when || '. Reference ' || v_ref || '. We will confirm shortly.',
    jsonb_build_object('visit_id', v_visit, 'property_id', p_property_id, 'visit_ref', v_ref)
  );

  -- the assigned promoter / agent
  if v_promoter is not null and v_promoter <> v_uid then
    perform public.notify_user(
      v_promoter, 'visit', 'New site visit request',
      coalesce(v_buyer_name, 'A buyer') || ' requested ' || v_title || ' — ' || v_when || ' (' || v_ref || ')',
      jsonb_build_object('visit_id', v_visit, 'property_id', p_property_id, 'buyer_id', v_uid, 'visit_ref', v_ref)
    );
  end if;

  -- and the admin desk
  perform public.notify_admins(
    'visit', 'Site visit booked',
    coalesce(v_buyer_name, 'A buyer') || ' · ' || v_title || ' — ' || v_when || ' (' || v_ref || ')',
    jsonb_build_object('visit_id', v_visit, 'property_id', p_property_id, 'buyer_id', v_uid, 'visit_ref', v_ref)
  );

  insert into public.activity_log (user_id, event_type, meta)
  values (v_uid, 'site_visit_booked',
          jsonb_build_object('visit_id', v_visit, 'property_id', p_property_id,
                             'scheduled_at', p_scheduled_at, 'visit_ref', v_ref));

  return v_visit;
end $$;

revoke execute on function public.book_site_visit(uuid, timestamptz, text, text) from public;
grant  execute on function public.book_site_visit(uuid, timestamptz, text, text) to authenticated;

-- Reschedule. Buyer (own), assigned promoter, or admin.
create or replace function public.reschedule_site_visit(
  p_visit_id     uuid,
  p_scheduled_at timestamptz,
  p_slot_label   text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v       record;
  v_admin boolean;
  v_title text;
  v_actor text;
  v_when  text;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if p_scheduled_at is null or p_scheduled_at < now() then
    raise exception 'please choose a future date and time';
  end if;

  select * into v from public.site_visits where id = p_visit_id;
  if v.id is null then raise exception 'visit not found'; end if;

  select exists (select 1 from public.profiles p where p.id = v_uid and p.role = 'super_admin') into v_admin;
  if not (v_admin or v.buyer_id = v_uid or v.promoter_id = v_uid) then
    raise exception 'not authorized';
  end if;
  if v.status in ('cancelled', 'completed') then
    raise exception 'this visit can no longer be rescheduled';
  end if;

  update public.site_visits
     set scheduled_at     = p_scheduled_at,
         slot_label       = coalesce(p_slot_label, slot_label),
         status           = 'requested',
         reschedule_count = reschedule_count + 1
   where id = p_visit_id;

  select title into v_title from public.properties where id = v.property_id;
  select full_name into v_actor from public.profiles where id = v_uid;
  v_when := to_char(p_scheduled_at at time zone 'Asia/Kolkata', 'Dy DD Mon') || coalesce(' · ' || p_slot_label, '');

  if v.buyer_id is not null and v.buyer_id <> v_uid then
    perform public.notify_user(v.buyer_id, 'visit', 'Site visit rescheduled',
      coalesce(v_title, 'Your visit') || ' moved to ' || v_when || ' (' || coalesce(v.visit_ref, '') || ')',
      jsonb_build_object('visit_id', p_visit_id, 'property_id', v.property_id));
  end if;
  if v.promoter_id is not null and v.promoter_id <> v_uid then
    perform public.notify_user(v.promoter_id, 'visit', 'Site visit rescheduled',
      coalesce(v_actor, 'A buyer') || ' moved ' || coalesce(v_title, 'a visit') || ' to ' || v_when,
      jsonb_build_object('visit_id', p_visit_id, 'property_id', v.property_id));
  end if;
  perform public.notify_admins('visit', 'Site visit rescheduled',
    coalesce(v_title, 'A visit') || ' → ' || v_when || ' (' || coalesce(v.visit_ref, '') || ')',
    jsonb_build_object('visit_id', p_visit_id, 'property_id', v.property_id));

  insert into public.activity_log (user_id, event_type, meta)
  values (v_uid, 'site_visit_rescheduled',
          jsonb_build_object('visit_id', p_visit_id, 'scheduled_at', p_scheduled_at));
end $$;

revoke execute on function public.reschedule_site_visit(uuid, timestamptz, text) from public;
grant  execute on function public.reschedule_site_visit(uuid, timestamptz, text) to authenticated;

-- Cancel. Buyer (own), assigned promoter, or admin.
create or replace function public.cancel_site_visit(
  p_visit_id uuid,
  p_reason   text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v       record;
  v_admin boolean;
  v_title text;
  v_actor text;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  select * into v from public.site_visits where id = p_visit_id;
  if v.id is null then raise exception 'visit not found'; end if;

  select exists (select 1 from public.profiles p where p.id = v_uid and p.role = 'super_admin') into v_admin;
  if not (v_admin or v.buyer_id = v_uid or v.promoter_id = v_uid) then
    raise exception 'not authorized';
  end if;
  if v.status = 'cancelled' then return; end if;

  update public.site_visits
     set status        = 'cancelled',
         cancelled_at  = now(),
         cancelled_by  = v_uid,
         cancel_reason = p_reason
   where id = p_visit_id;

  select title into v_title from public.properties where id = v.property_id;
  select full_name into v_actor from public.profiles where id = v_uid;

  if v.buyer_id is not null and v.buyer_id <> v_uid then
    perform public.notify_user(v.buyer_id, 'visit', 'Site visit cancelled',
      coalesce(v_title, 'Your visit') || ' was cancelled' || coalesce(' — ' || p_reason, ''),
      jsonb_build_object('visit_id', p_visit_id, 'property_id', v.property_id));
  end if;
  if v.promoter_id is not null and v.promoter_id <> v_uid then
    perform public.notify_user(v.promoter_id, 'visit', 'Site visit cancelled',
      coalesce(v_actor, 'A buyer') || ' cancelled ' || coalesce(v_title, 'a visit') || coalesce(' — ' || p_reason, ''),
      jsonb_build_object('visit_id', p_visit_id, 'property_id', v.property_id));
  end if;
  perform public.notify_admins('visit', 'Site visit cancelled',
    coalesce(v_title, 'A visit') || ' (' || coalesce(v.visit_ref, '') || ')' || coalesce(' — ' || p_reason, ''),
    jsonb_build_object('visit_id', p_visit_id, 'property_id', v.property_id));

  insert into public.activity_log (user_id, event_type, meta)
  values (v_uid, 'site_visit_cancelled',
          jsonb_build_object('visit_id', p_visit_id, 'reason', p_reason));
end $$;

revoke execute on function public.cancel_site_visit(uuid, text) from public;
grant  execute on function public.cancel_site_visit(uuid, text) to authenticated;

-- Confirm / complete. Assigned promoter or admin only.
create or replace function public.set_site_visit_status(
  p_visit_id uuid,
  p_status   text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v       record;
  v_admin boolean;
  v_title text;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if p_status not in ('requested', 'confirmed', 'completed') then
    raise exception 'invalid status';
  end if;

  select * into v from public.site_visits where id = p_visit_id;
  if v.id is null then raise exception 'visit not found'; end if;

  select exists (select 1 from public.profiles p where p.id = v_uid and p.role = 'super_admin') into v_admin;
  if not (v_admin or v.promoter_id = v_uid) then
    raise exception 'not authorized';
  end if;

  update public.site_visits set status = (p_status)::public.visit_status where id = p_visit_id;

  select title into v_title from public.properties where id = v.property_id;

  if v.buyer_id is not null then
    perform public.notify_user(v.buyer_id, 'visit',
      case p_status when 'confirmed' then 'Site visit confirmed'
                    when 'completed' then 'Site visit completed'
                    else 'Site visit updated' end,
      coalesce(v_title, 'Your visit') || ' — ' ||
        coalesce(to_char(v.scheduled_at at time zone 'Asia/Kolkata', 'Dy DD Mon'), 'date to be confirmed') ||
        coalesce(' · ' || v.slot_label, ''),
      jsonb_build_object('visit_id', p_visit_id, 'property_id', v.property_id, 'status', p_status));
  end if;

  insert into public.activity_log (user_id, event_type, meta)
  values (v_uid, 'site_visit_status_changed',
          jsonb_build_object('visit_id', p_visit_id, 'status', p_status));
end $$;

revoke execute on function public.set_site_visit_status(uuid, text) from public;
grant  execute on function public.set_site_visit_status(uuid, text) to authenticated;

-- ── 5. grants ──────────────────────────────────────────────────────────────
-- public-schema auto-grant is being removed platform-wide, so be explicit.
grant select on public.site_visit_slots to anon, authenticated;
grant insert, update, delete on public.site_visit_slots to authenticated; -- gated by RLS to super_admin
grant select, insert, update on public.site_visits to authenticated;
