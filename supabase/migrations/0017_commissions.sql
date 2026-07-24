-- 0017_commissions.sql
-- Promoter Module — Earnings & Commission engine.
--
-- Additive & non-breaking. New tables + SECURITY DEFINER RPCs only. Writes go
-- exclusively through the RPCs (no INSERT/UPDATE RLS policies → direct writes
-- denied). Commissions fan out UP the seller's referral chain (profiles.
-- referred_by) per an admin-editable per-level rate. Explicit GRANTs are set
-- because the public-schema auto-grant is being removed platform-wide.
--
-- Model: a promoter closes a sale (a booking). Each ancestor up the chain earns
-- sale_amount * percent(level)/100. Rates are seeded with sensible, EDITABLE
-- defaults — the admin must set the real business rates in the console.

-- ── per-level commission rate (admin-editable) ─────────────────────────────
create table if not exists public.commission_config(
  level      int primary key check (level >= 1),
  percent    numeric(6,3) not null default 0 check (percent >= 0),
  active     boolean not null default true,
  updated_at timestamptz not null default now()
);
insert into public.commission_config(level, percent) values (1, 2.0), (2, 1.0), (3, 0.5)
  on conflict (level) do nothing;

-- ── bookings (a confirmed sale closed by a promoter) ───────────────────────
create table if not exists public.bookings(
  id                 uuid primary key default gen_random_uuid(),
  property_id        uuid references public.properties(id) on delete set null,
  buyer_id           uuid references public.profiles(id) on delete set null,
  seller_promoter_id uuid not null references public.profiles(id) on delete cascade,
  sale_amount        numeric(14,2) not null check (sale_amount >= 0),
  sqft               numeric(12,2),
  note               text,
  status             text not null default 'confirmed' check (status in ('confirmed','cancelled')),
  created_by         uuid references public.profiles(id),
  created_at         timestamptz not null default now()
);
create index if not exists bookings_seller_idx on public.bookings(seller_promoter_id);

-- ── commission ledger ──────────────────────────────────────────────────────
create table if not exists public.commissions(
  id             uuid primary key default gen_random_uuid(),
  booking_id     uuid not null references public.bookings(id) on delete cascade,
  beneficiary_id uuid not null references public.profiles(id) on delete cascade,
  from_user_id   uuid not null references public.profiles(id) on delete cascade,
  level          int not null,
  amount         numeric(14,2) not null default 0,
  status         text not null default 'pending' check (status in ('pending','approved','paid','cancelled')),
  created_at     timestamptz not null default now(),
  paid_at        timestamptz
);
create index if not exists commissions_beneficiary_idx on public.commissions(beneficiary_id);
create index if not exists commissions_from_idx on public.commissions(from_user_id);

alter table public.commission_config enable row level security;
alter table public.bookings         enable row level security;
alter table public.commissions      enable row level security;

-- read policies (writes only via definer RPCs). Config is public-read.
drop policy if exists commission_config_read on public.commission_config;
create policy commission_config_read on public.commission_config for select to authenticated using (true);

drop policy if exists bookings_read_own on public.bookings;
create policy bookings_read_own on public.bookings for select to authenticated
  using (seller_promoter_id = auth.uid() or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin'));

drop policy if exists commissions_read_own on public.commissions;
create policy commissions_read_own on public.commissions for select to authenticated
  using (beneficiary_id = auth.uid() or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin'));

grant select on public.commission_config to authenticated;
grant select on public.bookings         to authenticated;
grant select on public.commissions      to authenticated;

-- ── RPCs ───────────────────────────────────────────────────────────────────

-- Admin: record a sale and fan commissions up the seller's referral chain.
create or replace function public.admin_record_booking(
  p_seller uuid, p_sale_amount numeric, p_property uuid default null,
  p_buyer uuid default null, p_sqft numeric default null, p_note text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_booking uuid; v_cur uuid; v_lvl int := 1; v_pct numeric;
begin
  if not exists (select 1 from public.profiles where id = v_uid and role = 'super_admin') then raise exception 'not authorized'; end if;
  if p_seller is null then raise exception 'seller required'; end if;
  if p_sale_amount is null or p_sale_amount < 0 then raise exception 'invalid amount'; end if;
  insert into public.bookings(property_id, buyer_id, seller_promoter_id, sale_amount, sqft, note, created_by)
    values (p_property, p_buyer, p_seller, p_sale_amount, p_sqft, p_note, v_uid) returning id into v_booking;
  v_cur := (select referred_by from public.profiles where id = p_seller);
  while v_cur is not null and v_lvl <= 50 loop
    select percent into v_pct from public.commission_config where level = v_lvl and active;
    if v_pct is not null and v_pct > 0 then
      insert into public.commissions(booking_id, beneficiary_id, from_user_id, level, amount, status)
        values (v_booking, v_cur, p_seller, v_lvl, round(p_sale_amount * v_pct / 100.0, 2), 'pending');
    end if;
    v_cur := (select referred_by from public.profiles where id = v_cur);
    v_lvl := v_lvl + 1;
  end loop;
  return v_booking;
end; $$;

-- Admin: set/insert a level's commission rate.
create or replace function public.admin_set_commission(p_level int, p_percent numeric)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'super_admin') then raise exception 'not authorized'; end if;
  if p_level < 1 or p_percent < 0 then raise exception 'invalid'; end if;
  insert into public.commission_config(level, percent, updated_at) values (p_level, p_percent, now())
    on conflict (level) do update set percent = excluded.percent, updated_at = now();
end; $$;

-- Admin: change a commission's status (approve / pay / cancel).
create or replace function public.admin_mark_commission(p_id uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'super_admin') then raise exception 'not authorized'; end if;
  if p_status not in ('pending','approved','paid','cancelled') then raise exception 'invalid status'; end if;
  update public.commissions set status = p_status, paid_at = case when p_status = 'paid' then now() else paid_at end where id = p_id;
end; $$;

-- Promoter: earnings summary.
create or replace function public.my_earnings()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'total',   coalesce((select sum(amount) from public.commissions where beneficiary_id = auth.uid() and status <> 'cancelled'), 0),
    'pending', coalesce((select sum(amount) from public.commissions where beneficiary_id = auth.uid() and status in ('pending','approved')), 0),
    'paid',    coalesce((select sum(amount) from public.commissions where beneficiary_id = auth.uid() and status = 'paid'), 0),
    'count',   coalesce((select count(*)   from public.commissions where beneficiary_id = auth.uid() and status <> 'cancelled'), 0)
  );
$$;

-- Promoter: commission history.
create or replace function public.my_commissions(p_limit int default 50)
returns table(id uuid, from_member text, from_name text, level int, amount numeric, status text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select c.id, fp.member_code, fp.full_name, c.level, c.amount, c.status, c.created_at
    from public.commissions c
    join public.profiles fp on fp.id = c.from_user_id
   where c.beneficiary_id = auth.uid()
   order by c.created_at desc
   limit greatest(p_limit, 1);
$$;

-- ── wire real sale/earn into the tree (replaces the 0 placeholders) ────────
create or replace function public.my_promoter_tree_level(p_level int)
returns table(
  user_id uuid, member_code text, full_name text,
  joined timestamptz, direct_referrals bigint, sale numeric, earn numeric
)
language sql stable security definer set search_path = public
as $$
  with recursive tree as (
    select id, 1 as lvl from public.profiles where referred_by = auth.uid()
    union all
    select p.id, t.lvl + 1 from public.profiles p join tree t on p.referred_by = t.id where t.lvl < 200
  )
  select pr.id, pr.member_code, pr.full_name, pr.created_at,
         (select count(*) from public.profiles c where c.referred_by = pr.id)::bigint,
         coalesce((select sum(b.sale_amount) from public.bookings b where b.seller_promoter_id = pr.id and b.status = 'confirmed'), 0)::numeric,
         coalesce((select sum(cm.amount) from public.commissions cm where cm.beneficiary_id = auth.uid() and cm.from_user_id = pr.id and cm.status <> 'cancelled'), 0)::numeric
    from tree t
    join public.profiles pr on pr.id = t.id
   where t.lvl = greatest(p_level, 1)
   order by pr.member_code nulls last;
$$;

create or replace function public.admin_promoter_tree_level(p_root uuid, p_level int)
returns table(
  user_id uuid, member_code text, full_name text, mobile text,
  joined timestamptz, direct_referrals bigint, sale numeric, earn numeric
)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin') then
    raise exception 'not authorized';
  end if;
  return query
  with recursive tree as (
    select id, 1 as lvl from public.profiles where referred_by = p_root
    union all
    select p.id, t.lvl + 1 from public.profiles p join tree t on p.referred_by = t.id where t.lvl < 200
  )
  select pr.id, pr.member_code, pr.full_name, pr.mobile, pr.created_at,
         (select count(*) from public.profiles c where c.referred_by = pr.id)::bigint,
         coalesce((select sum(b.sale_amount) from public.bookings b where b.seller_promoter_id = pr.id and b.status = 'confirmed'), 0)::numeric,
         coalesce((select sum(cm.amount) from public.commissions cm where cm.beneficiary_id = p_root and cm.from_user_id = pr.id and cm.status <> 'cancelled'), 0)::numeric
    from tree t
    join public.profiles pr on pr.id = t.id
   where t.lvl = greatest(p_level, 1)
   order by pr.member_code nulls last;
end;
$$;

revoke execute on function public.admin_record_booking(uuid, numeric, uuid, uuid, numeric, text) from public;
grant  execute on function public.admin_record_booking(uuid, numeric, uuid, uuid, numeric, text) to authenticated;
revoke execute on function public.admin_set_commission(int, numeric) from public;
grant  execute on function public.admin_set_commission(int, numeric) to authenticated;
revoke execute on function public.admin_mark_commission(uuid, text) from public;
grant  execute on function public.admin_mark_commission(uuid, text) to authenticated;
revoke execute on function public.my_earnings() from public;
grant  execute on function public.my_earnings() to authenticated;
revoke execute on function public.my_commissions(int) from public;
grant  execute on function public.my_commissions(int) to authenticated;
