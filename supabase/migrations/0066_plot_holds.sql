-- 0066: Plot holds.
--
-- Jamin Bazaar takes money by bank transfer and UPI — there is no gateway — so
-- "Book now" cannot confirm a sale. It places a HOLD: the plot goes amber for
-- everyone, the buyer gets a reference, admins and the assigned promoter are
-- notified, and an admin confirms once the transfer lands.
--
-- Deliberately NOT public.bookings: that table fires trg_bazaar_process_booking,
-- which accrues promoter commission on insert. A buyer tap must never do that.
-- Completed sales keep going through admin_record_booking as they do today.

create sequence if not exists public.plot_hold_seq;

create table if not exists public.plot_holds (
  id           uuid primary key default gen_random_uuid(),
  ref          text unique not null default ('JB' || to_char(nextval('public.plot_hold_seq'), 'FM000000')),
  property_id  uuid not null references public.properties(id) on delete cascade,
  plot         text not null,
  buyer_id     uuid not null references public.profiles(id) on delete cascade,
  amount       numeric(18,2),
  method       text not null default 'bank' check (method in ('bank','upi')),
  status       text not null default 'held' check (status in ('held','confirmed','released','expired')),
  expires_at   timestamptz,
  note         text,
  confirmed_at timestamptz,
  confirmed_by uuid,
  created_at   timestamptz not null default now()
);

-- at most one live hold per plot; this is what stops two buyers taking the same one
create unique index if not exists plot_holds_live_idx
  on public.plot_holds(property_id, plot) where status = 'held';
create index if not exists plot_holds_buyer_idx on public.plot_holds(buyer_id, created_at desc);

-- ── write a plot's status inside properties.plot_layout, and recount ─────────
create or replace function public.set_plot_status(p_property uuid, p_plot text, p_status text)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  update public.properties p
     set plot_layout = (
           select jsonb_agg(
                    case when e->>'plot' = p_plot
                         then e || jsonb_build_object('status', p_status)
                         else e end
                    order by nullif(regexp_replace(e->>'plot', '\D', '', 'g'), '')::int nulls last, e->>'plot'
                  )
           from jsonb_array_elements(p.plot_layout) e)
   where p.id = p_property;

  update public.properties p
     set plots_available = (
           select count(*) from jsonb_array_elements(p.plot_layout) e
            where coalesce(e->>'status','available') = 'available')
   where p.id = p_property;
end $$;

-- ── buyer: place a hold ─────────────────────────────────────────────────────
create or replace function public.hold_plot(
  p_property uuid, p_plot text, p_method text default 'bank', p_note text default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare prop public.properties; row jsonb; h public.plot_holds; hours int := 48;
begin
  if auth.uid() is null then
    raise exception 'Sign in to hold a plot' using errcode = '28000';
  end if;
  if p_method not in ('bank','upi') then
    raise exception 'Unsupported payment method %', p_method using errcode = '22023';
  end if;

  perform public.expire_plot_holds();

  select * into prop from public.properties where id = p_property for update;
  if not found then raise exception 'Property not found' using errcode = 'P0002'; end if;

  select e into row from jsonb_array_elements(prop.plot_layout) e where e->>'plot' = p_plot;
  if row is null then raise exception 'Plot % not found', p_plot using errcode = 'P0002'; end if;
  if coalesce(row->>'status','available') <> 'available' then
    raise exception 'Plot % is no longer available', p_plot using errcode = '55006';
  end if;

  perform public.set_plot_status(p_property, p_plot, 'reserved');

  insert into public.plot_holds(property_id, plot, buyer_id, amount, method, expires_at, note)
  values (p_property, p_plot, auth.uid(),
          nullif(row->>'booking_amount','')::numeric, p_method,
          now() + make_interval(hours => hours), p_note)
  returning * into h;

  perform public.notify_admins(
    'plot_hold',
    'Plot ' || p_plot || ' held',
    'Plot ' || p_plot || ' at ' || prop.title || ' is on hold pending payment. Reference ' || h.ref || '.',
    jsonb_build_object('property_id', p_property, 'plot', p_plot, 'ref', h.ref, 'hold_id', h.id));

  if prop.promoter_id is not null then
    perform public.notify_user(prop.promoter_id, 'plot_hold',
      'Plot ' || p_plot || ' held',
      'A buyer has held plot ' || p_plot || ' at ' || prop.title || '.',
      jsonb_build_object('property_id', p_property, 'plot', p_plot, 'ref', h.ref));
  end if;

  return jsonb_build_object('ref', h.ref, 'holdId', h.id, 'plot', p_plot,
                            'amount', h.amount, 'expiresAt', h.expires_at, 'method', h.method);
end $$;

-- ── buyer or admin: give the hold back ──────────────────────────────────────
create or replace function public.release_plot_hold(p_hold uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
declare h public.plot_holds;
begin
  select * into h from public.plot_holds where id = p_hold for update;
  if not found then raise exception 'Hold not found' using errcode = 'P0002'; end if;
  if h.buyer_id <> auth.uid() and not public.is_super_admin() then
    raise exception 'Not your hold' using errcode = '42501';
  end if;
  if h.status <> 'held' then return; end if;
  update public.plot_holds set status = 'released' where id = p_hold;
  perform public.set_plot_status(h.property_id, h.plot, 'available');
end $$;

-- ── admin: set a plot's status directly, resolving any live hold ────────────
create or replace function public.admin_set_plot_status(p_property uuid, p_plot text, p_status text)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if not public.is_super_admin() then
    raise exception 'Admins only' using errcode = '42501';
  end if;
  if p_status not in ('available','reserved','booked','sold','blocked') then
    raise exception 'Unknown status %', p_status using errcode = '22023';
  end if;

  perform public.set_plot_status(p_property, p_plot, p_status);

  if p_status in ('booked','sold') then
    update public.plot_holds
       set status = 'confirmed', confirmed_at = now(), confirmed_by = auth.uid()
     where property_id = p_property and plot = p_plot and status = 'held';
    perform public.notify_user(h.buyer_id, 'plot_confirmed',
      'Plot ' || p_plot || ' confirmed',
      'Your booking for plot ' || p_plot || ' is confirmed. Reference ' || h.ref || '.',
      jsonb_build_object('property_id', p_property, 'plot', p_plot, 'ref', h.ref))
      from public.plot_holds h
     where h.property_id = p_property and h.plot = p_plot and h.status = 'confirmed'
       and h.confirmed_at > now() - interval '5 seconds';
  elsif p_status = 'available' then
    update public.plot_holds set status = 'released'
     where property_id = p_property and plot = p_plot and status = 'held';
  end if;
end $$;

-- ── housekeeping ────────────────────────────────────────────────────────────
create or replace function public.expire_plot_holds()
returns int language plpgsql security definer set search_path to 'public' as $$
declare n int := 0; h record;
begin
  for h in select * from public.plot_holds
            where status = 'held' and expires_at is not null and expires_at < now() loop
    update public.plot_holds set status = 'expired' where id = h.id;
    perform public.set_plot_status(h.property_id, h.plot, 'available');
    n := n + 1;
  end loop;
  return n;
end $$;

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table public.plot_holds enable row level security;

drop policy if exists plot_holds_own on public.plot_holds;
create policy plot_holds_own on public.plot_holds
  for select to authenticated using (buyer_id = auth.uid() or public.is_super_admin());

drop policy if exists plot_holds_admin on public.plot_holds;
create policy plot_holds_admin on public.plot_holds
  for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin());

grant select on public.plot_holds to authenticated;
grant usage on sequence public.plot_hold_seq to authenticated;
revoke all on public.plot_holds from anon;

revoke execute on function public.set_plot_status(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.expire_plot_holds() from public, anon;
revoke execute on function public.hold_plot(uuid, text, text, text) from public, anon;
revoke execute on function public.release_plot_hold(uuid) from public, anon;
revoke execute on function public.admin_set_plot_status(uuid, text, text) from public, anon;
