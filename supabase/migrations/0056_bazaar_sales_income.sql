-- 0056_bazaar_sales_income.sql
-- Jamin Bazaar — Sales Income module, ported from the JAMIN build (0109 there)
-- onto Jamindar's own commission engine (0017). FULLY ADDITIVE.
--
-- Mapping onto the existing engine (never duplicated, never double-paid):
--   DSI  = NEW level-0 rows in public.commissions for the SELLING promoter,
--          created by an exception-guarded trigger on bookings at an
--          admin-configurable rate that DEFAULTS TO 0 (economics unchanged
--          until the admin sets it in the console).
--   RSI  = the existing level>=1 upline override commissions, untouched —
--          the bazaar layer adds the "locked until first direct sale"
--          eligibility state on top (display + admin guidance; payouts stay
--          admin-approved exactly as before).
--   ASI  = monthly award income for rank holders (new bazaar ledger).
--   Wallet = commissions (all levels) + bazaar ledger, one summary RPC.
-- Rank ladder: L1 BDM ₹50L … L5 Honour of Director ₹10Cr — "each direct
-- referral's team" = confirmed sales by that referral's whole referred_by
-- subtree (including the referral). Designation lands on
-- promoter_profiles.designation (already shown on the Digital Card).

-- ─── 1. config ───
insert into public.site_config(key, value) values
  ('bazaar_income', jsonb_build_object(
     'dsi_percent', 0,
     'min_direct_referrals', 3,
     'rsi_requires_direct_sale', true
  ))
on conflict (key) do nothing;

create sequence if not exists public.bazaar_ref_seq;

-- ─── 2. award levels catalog ───
create table if not exists public.bazaar_award_levels (
  id uuid primary key default gen_random_uuid(),
  level int not null unique,
  designation text not null,
  per_referral_team_sales numeric(18,2) not null default 0,
  monthly_award numeric(18,2) not null default 0,
  validity_months int not null default 12,
  min_direct_referrals int not null default 3,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.bazaar_award_levels (level, designation, per_referral_team_sales, monthly_award, validity_months)
select * from (values
  (1, 'Business Development Manager',   5000000::numeric,  10000::numeric, 12),
  (2, 'Zonal Manager',                 10000000::numeric,  20000::numeric, 24),
  (3, 'Assistant General Manager',     20000000::numeric,  30000::numeric, 36),
  (4, 'General Manager',               40000000::numeric,  40000::numeric, 48),
  (5, 'Honour of Director',           100000000::numeric,  50000::numeric, 60)
) as v(level, designation, per_referral_team_sales, monthly_award, validity_months)
where not exists (select 1 from public.bazaar_award_levels);

-- ─── 3. bazaar ledger (ASI, launch-offer rewards, manual adjustments) ───
create table if not exists public.bazaar_income_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  income_type text not null check (income_type in ('asi','offer','adjustment')),
  amount numeric(18,2) not null check (amount > 0),
  description text,
  reference_no text not null default ('JB' || to_char(nextval('public.bazaar_ref_seq'), 'FM0000000')),
  source_ref text,
  status text not null default 'pending' check (status in ('pending','approved','paid','rejected')),
  created_by uuid,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists bazaar_income_dedupe
  on public.bazaar_income_ledger (user_id, income_type, source_ref) where source_ref is not null;
create index if not exists bazaar_income_user_idx on public.bazaar_income_ledger (user_id, created_at desc);

-- ─── 4. promoter rank status + awards + launch offers ───
create table if not exists public.bazaar_promoter_status (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  direct_sales_count int not null default 0,
  direct_referrals_count int not null default 0,
  team_sales numeric(18,2) not null default 0,
  min_referral_team_sales numeric(18,2) not null default 0,
  current_level int not null default 0,
  designation text,
  rsi_unlocked boolean not null default false,
  rsi_unlocked_at timestamptz,
  admin_override boolean not null default false,
  last_evaluated_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.bazaar_awards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  level int not null,
  designation text not null,
  monthly_amount numeric(18,2) not null default 0,
  valid_from date not null default current_date,
  valid_until date not null,
  months_total int not null,
  months_credited int not null default 0,
  last_credited_month date,
  status text not null default 'active' check (status in ('active','completed','cancelled')),
  created_at timestamptz not null default now(),
  unique (user_id, level)
);

create table if not exists public.bazaar_launch_offers (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  required_direct_sales int not null default 3,
  reward_type text not null default 'cashback'
    check (reward_type in ('cashback','shopping_voucher','domestic_tour','international_tour','gift','custom')),
  reward_label text,
  reward_amount numeric(18,2) not null default 0,
  banner_url text,
  terms text,
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.bazaar_offer_awards (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.bazaar_launch_offers(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  direct_sales_count int not null default 0,
  status text not null default 'achieved' check (status in ('achieved','reward_issued','cancelled')),
  achieved_at timestamptz not null default now(),
  issued_at timestamptz,
  note text,
  unique (offer_id, user_id)
);

-- ─── 5. helpers ───
create or replace function public.bazaar_cfg()
returns jsonb language sql stable set search_path = public as $$
  select coalesce((select value from public.site_config where key = 'bazaar_income'), '{}'::jsonb);
$$;

create or replace function public.bazaar_is_admin()
returns boolean language sql stable set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin');
$$;

-- confirmed direct sales closed BY this promoter
create or replace function public.bazaar_direct_sales_count(p_user uuid, p_from timestamptz default null, p_to timestamptz default null)
returns int language sql stable security definer set search_path = public as $$
  select count(*)::int from public.bookings b
  where b.seller_promoter_id = p_user and b.status = 'confirmed'
    and (p_from is null or b.created_at >= p_from)
    and (p_to   is null or b.created_at <= p_to);
$$;

-- confirmed sales value of a referral subtree (the root + everyone under them)
create or replace function public.bazaar_team_sales(p_root uuid)
returns numeric language sql stable security definer set search_path = public as $$
  with recursive tree as (
    select p_root as id
    union all
    select p.id from public.profiles p join tree t on p.referred_by = t.id
  )
  select coalesce(sum(b.sale_amount), 0)::numeric
    from public.bookings b
   where b.status = 'confirmed' and b.seller_promoter_id in (select id from tree);
$$;

-- ─── 6. evaluation: RSI unlock, rank progression, launch offers ───
create or replace function public.bazaar_evaluate(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_cfg jsonb := public.bazaar_cfg();
  v_direct int;
  v_refs int;
  v_team numeric;
  v_min_team numeric;
  v_status public.bazaar_promoter_status%rowtype;
  v_lvl record;
  v_new_level int;
  v_new_desig text;
  v_name text;
  v_offer record;
  v_cnt int;
begin
  if p_user is null then return; end if;

  v_direct := public.bazaar_direct_sales_count(p_user);
  select count(*)::int into v_refs from public.profiles pr where pr.referred_by = p_user;
  v_team := public.bazaar_team_sales(p_user);
  select coalesce(min(public.bazaar_team_sales(pr.id)), 0) into v_min_team
    from public.profiles pr where pr.referred_by = p_user;

  insert into public.bazaar_promoter_status as s (user_id) values (p_user)
  on conflict (user_id) do nothing;
  select * into v_status from public.bazaar_promoter_status where user_id = p_user for update;

  -- RSI eligibility: the first direct sale unlocks referral income
  if v_direct >= 1 and not v_status.rsi_unlocked then
    update public.bazaar_promoter_status
       set rsi_unlocked = true, rsi_unlocked_at = now(), updated_at = now()
     where user_id = p_user;
    insert into public.notifications(user_id, type, title, body, meta)
    values (p_user, 'income', 'Referral income unlocked 🎉',
      'Congratulations! Your first direct sale is complete — your referral sales income is now unlocked.',
      jsonb_build_object('event', 'rsi_unlocked'));
  end if;

  -- rank progression (paused while an admin has pinned a designation)
  if not v_status.admin_override then
    v_new_level := v_status.current_level;
    v_new_desig := v_status.designation;
    for v_lvl in
      select * from public.bazaar_award_levels
      where active and level > v_status.current_level order by level
    loop
      if v_refs >= v_lvl.min_direct_referrals and v_min_team >= v_lvl.per_referral_team_sales then
        v_new_level := v_lvl.level;
        v_new_desig := v_lvl.designation;
      else
        exit;
      end if;
    end loop;

    if v_new_level > v_status.current_level then
      update public.bazaar_promoter_status
         set current_level = v_new_level, designation = v_new_desig, updated_at = now()
       where user_id = p_user;
      -- the Digital Card + share pages read promoter_profiles.designation
      insert into public.promoter_profiles as pp (id, referral_code, designation)
      values (p_user,
              coalesce((select referral_code from public.profiles where id = p_user), p_user::text),
              v_new_desig)
      on conflict (id) do update set designation = v_new_desig;

      for v_lvl in
        select * from public.bazaar_award_levels
        where active and level > v_status.current_level and level <= v_new_level order by level
      loop
        insert into public.bazaar_awards (user_id, level, designation, monthly_amount, valid_from, valid_until, months_total)
        values (p_user, v_lvl.level, v_lvl.designation, v_lvl.monthly_award,
                current_date, (current_date + make_interval(months => v_lvl.validity_months))::date, v_lvl.validity_months)
        on conflict (user_id, level) do nothing;
      end loop;

      select coalesce(full_name, 'A promoter') into v_name from public.profiles where id = p_user;
      insert into public.notifications(user_id, type, title, body, meta)
      values (p_user, 'income', 'Rank upgraded: ' || v_new_desig || ' 🏆',
        'Your team performance has earned you the designation of ' || v_new_desig ||
        ' (Level ' || v_new_level || '). Monthly award income is now active.',
        jsonb_build_object('event', 'level_up', 'level', v_new_level));
      insert into public.notifications(user_id, type, title, body, meta)
      select pr.id, 'income', 'Promoter rank upgrade',
             v_name || ' has reached Level ' || v_new_level || ' — ' || v_new_desig || '.',
             jsonb_build_object('user_id', p_user, 'level', v_new_level)
        from public.profiles pr where pr.role = 'super_admin';
    end if;
  end if;

  -- launch offers
  for v_offer in
    select * from public.bazaar_launch_offers where active and now() between starts_at and ends_at
  loop
    v_cnt := public.bazaar_direct_sales_count(p_user, v_offer.starts_at, v_offer.ends_at);
    if v_cnt >= v_offer.required_direct_sales
       and not exists (select 1 from public.bazaar_offer_awards where offer_id = v_offer.id and user_id = p_user) then
      insert into public.bazaar_offer_awards (offer_id, user_id, direct_sales_count)
      values (v_offer.id, p_user, v_cnt);
      if v_offer.reward_amount > 0 then
        insert into public.bazaar_income_ledger (user_id, income_type, amount, description, source_ref, status)
        values (p_user, 'offer', v_offer.reward_amount,
                'Launch offer reward: ' || v_offer.title, 'offer:' || v_offer.id, 'approved')
        on conflict do nothing;
      end if;
      insert into public.notifications(user_id, type, title, body, meta)
      values (p_user, 'income', 'Launch offer achieved 🎁',
        'You completed ' || v_cnt || ' direct sales and earned: ' ||
        coalesce(v_offer.reward_label, v_offer.reward_type) || ' (' || v_offer.title || ').',
        jsonb_build_object('event', 'launch_offer', 'offer_id', v_offer.id));
    end if;
  end loop;

  update public.bazaar_promoter_status
     set direct_sales_count = v_direct,
         direct_referrals_count = v_refs,
         team_sales = v_team,
         min_referral_team_sales = v_min_team,
         last_evaluated_at = now(),
         updated_at = now()
   where user_id = p_user;
end $$;

-- ─── 7. sale hook: DSI (level-0 commission) + evaluation up the chain ───
-- AFTER INSERT on bookings so admin_record_booking is never modified. The
-- exception guard means a bazaar failure can never break sale recording.
create or replace function public.bazaar_process_booking()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_dsi numeric;
  v_cur uuid;
  v_hops int := 0;
begin
  if new.status <> 'confirmed' or new.seller_promoter_id is null then return new; end if;
  begin
    v_dsi := coalesce((public.bazaar_cfg()->>'dsi_percent')::numeric, 0);
    -- Direct Sales Income for the SELLER (the 0017 engine only pays uplines).
    -- Level 0 rides the same commissions table + admin payout workflow.
    if v_dsi > 0 and new.sale_amount > 0 then
      insert into public.commissions (booking_id, beneficiary_id, from_user_id, level, amount, status)
      values (new.id, new.seller_promoter_id, coalesce(new.buyer_id, new.seller_promoter_id),
              0, round(new.sale_amount * v_dsi / 100.0, 2), 'pending');
    end if;
    -- Re-evaluate the seller and every upline (their team sales just grew).
    perform public.bazaar_evaluate(new.seller_promoter_id);
    v_cur := (select referred_by from public.profiles where id = new.seller_promoter_id);
    while v_cur is not null and v_hops < 50 loop
      perform public.bazaar_evaluate(v_cur);
      v_cur := (select referred_by from public.profiles where id = v_cur);
      v_hops := v_hops + 1;
    end loop;
  exception when others then
    raise warning 'bazaar_process_booking skipped: %', sqlerrm;
  end;
  return new;
end $$;

drop trigger if exists trg_bazaar_process_booking on public.bookings;
create trigger trg_bazaar_process_booking
  after insert on public.bookings
  for each row execute function public.bazaar_process_booking();

-- ─── 8. monthly ASI credits (admin-triggered from the console; idempotent) ───
create or replace function public.bazaar_credit_monthly_awards()
returns int language plpgsql security definer set search_path = public as $$
declare
  v_a record;
  v_month date := date_trunc('month', now())::date;
  v_n int := 0;
begin
  if not public.bazaar_is_admin() then raise exception 'not authorized'; end if;
  for v_a in select * from public.bazaar_awards where status = 'active' order by created_at loop
    if v_a.months_credited >= v_a.months_total or v_month > v_a.valid_until then
      update public.bazaar_awards set status = 'completed' where id = v_a.id;
      continue;
    end if;
    if v_a.valid_from > current_date then continue; end if;
    if v_a.last_credited_month is not null and v_a.last_credited_month >= v_month then continue; end if;
    insert into public.bazaar_income_ledger (user_id, income_type, amount, description, source_ref, status)
    values (v_a.user_id, 'asi', v_a.monthly_amount,
            'Monthly award — ' || v_a.designation || ' (Level ' || v_a.level || ', ' || to_char(v_month, 'Mon YYYY') || ')',
            'asi:' || v_a.id || ':' || to_char(v_month, 'YYYYMM'), 'approved')
    on conflict do nothing;
    update public.bazaar_awards
       set months_credited = months_credited + 1, last_credited_month = v_month
     where id = v_a.id;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

-- ─── 9. promoter-facing RPCs ───
create or replace function public.bazaar_income_summary()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  v_locked boolean;
  v jsonb;
begin
  if me is null then raise exception 'not authenticated'; end if;
  v_locked := coalesce((public.bazaar_cfg()->>'rsi_requires_direct_sale')::boolean, true)
              and public.bazaar_direct_sales_count(me) = 0;

  with c as (
    select level,
           sum(amount) filter (where status in ('pending','approved')) as pending,
           sum(amount) filter (where status = 'paid') as paid,
           sum(amount) filter (where status <> 'cancelled') as total
    from public.commissions where beneficiary_id = me group by level
  ),
  dsi as (select coalesce(sum(pending),0) p, coalesce(sum(paid),0) pd, coalesce(sum(total),0) t from c where level = 0),
  rsi as (select coalesce(sum(pending),0) p, coalesce(sum(paid),0) pd, coalesce(sum(total),0) t from c where level >= 1),
  led as (
    select income_type,
           sum(amount) filter (where status in ('pending','approved')) as pending,
           sum(amount) filter (where status = 'paid') as paid,
           sum(amount) filter (where status <> 'rejected') as total
    from public.bazaar_income_ledger where user_id = me group by income_type
  )
  select jsonb_build_object(
    'dsi', jsonb_build_object('total', (select t from dsi), 'available', (select p from dsi), 'paid', (select pd from dsi), 'locked', 0),
    'rsi', jsonb_build_object(
       'total', (select t from rsi),
       'available', case when v_locked then 0 else (select p from rsi) end,
       'paid', (select pd from rsi),
       'locked', case when v_locked then (select p from rsi) else 0 end),
    'asi', jsonb_build_object(
       'total', coalesce((select total from led where income_type='asi'),0),
       'available', coalesce((select pending from led where income_type='asi'),0),
       'paid', coalesce((select paid from led where income_type='asi'),0), 'locked', 0),
    'other', jsonb_build_object(
       'total', coalesce((select sum(total) from led where income_type in ('offer','adjustment')),0),
       'available', coalesce((select sum(pending) from led where income_type in ('offer','adjustment')),0),
       'paid', coalesce((select sum(paid) from led where income_type in ('offer','adjustment')),0)),
    'withdrawn',
       coalesce((select sum(amount) from public.commissions where beneficiary_id = me and status='paid'),0)
       + coalesce((select sum(amount) from public.bazaar_income_ledger where user_id = me and status='paid'),0),
    'rsi_locked', v_locked,
    'status', (select to_jsonb(s) from public.bazaar_promoter_status s where s.user_id = me),
    'next_level', (
       select to_jsonb(l) from public.bazaar_award_levels l
       where l.active and l.level > coalesce((select current_level from public.bazaar_promoter_status where user_id = me), 0)
       order by l.level limit 1),
    'referral_progress', coalesce((
       select jsonb_agg(jsonb_build_object(
         'id', pr.id, 'name', coalesce(pr.full_name, pr.member_code, 'Member'),
         'team_sales', public.bazaar_team_sales(pr.id)) order by pr.created_at)
       from public.profiles pr where pr.referred_by = me), '[]'::jsonb),
    'awards', coalesce((select jsonb_agg(to_jsonb(a) order by a.level) from public.bazaar_awards a where a.user_id = me), '[]'::jsonb),
    'offers', coalesce((
       select jsonb_agg(jsonb_build_object(
         'id', o.id, 'title', o.title, 'description', o.description,
         'required_direct_sales', o.required_direct_sales,
         'reward_type', o.reward_type, 'reward_label', o.reward_label,
         'reward_amount', o.reward_amount, 'banner_url', o.banner_url,
         'starts_at', o.starts_at, 'ends_at', o.ends_at, 'terms', o.terms,
         'my_sales', public.bazaar_direct_sales_count(me, o.starts_at, o.ends_at),
         'achieved', exists (select 1 from public.bazaar_offer_awards oa where oa.offer_id = o.id and oa.user_id = me)) order by o.ends_at)
       from public.bazaar_launch_offers o
       where o.active and now() between o.starts_at and o.ends_at), '[]'::jsonb)
  ) into v;
  return v;
end $$;

create or replace function public.bazaar_income_history(
  p_type text default null, p_from date default null, p_to date default null)
returns table (entry_date timestamptz, income_type text, description text, reference_no text, amount numeric, status text)
language sql stable security definer set search_path = public as $$
  select c.created_at,
         case when c.level = 0 then 'dsi' else 'rsi' end,
         case when c.level = 0 then 'Direct sale income'
              else 'Referral income · Level ' || c.level || coalesce(' · from ' || fp.full_name, '') end,
         'CM-' || left(c.id::text, 8), c.amount, c.status
    from public.commissions c
    left join public.profiles fp on fp.id = c.from_user_id
   where c.beneficiary_id = auth.uid() and c.status <> 'cancelled'
     and (p_type is null or p_type = case when c.level = 0 then 'dsi' else 'rsi' end)
     and (p_from is null or c.created_at >= p_from)
     and (p_to   is null or c.created_at < p_to + 1)
  union all
  select l.created_at, l.income_type,
         coalesce(l.description, upper(l.income_type) || ' income'),
         l.reference_no, l.amount, l.status
    from public.bazaar_income_ledger l
   where l.user_id = auth.uid()
     and (p_type is null or l.income_type = p_type)
     and (p_from is null or l.created_at >= p_from)
     and (p_to   is null or l.created_at < p_to + 1)
  order by 1 desc
  limit 500;
$$;

-- ─── 10. admin RPCs ───
create or replace function public.bazaar_admin_adjust(p_user uuid, p_amount numeric, p_description text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.bazaar_is_admin() then raise exception 'not authorized'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'invalid amount'; end if;
  insert into public.bazaar_income_ledger (user_id, income_type, amount, description, status, created_by)
  values (p_user, 'adjustment', p_amount, coalesce(p_description, 'Manual adjustment'), 'approved', auth.uid())
  returning id into v_id;
  insert into public.notifications(user_id, type, title, body, meta)
  values (p_user, 'income', 'Income adjustment credited',
          'An adjustment of ₹' || trim(to_char(p_amount, 'FM99999999990')) ||
          coalesce(' — ' || p_description, '') || ' was added to your income.',
          jsonb_build_object('ledger_id', v_id));
  return v_id;
end $$;

create or replace function public.bazaar_admin_set_designation(p_user uuid, p_level int, p_override boolean default true)
returns void language plpgsql security definer set search_path = public as $$
declare v_lvl record;
begin
  if not public.bazaar_is_admin() then raise exception 'not authorized'; end if;
  if p_level = 0 then
    insert into public.bazaar_promoter_status as s (user_id, current_level, designation, admin_override)
    values (p_user, 0, null, p_override)
    on conflict (user_id) do update
      set current_level = 0, designation = null, admin_override = p_override, updated_at = now();
    update public.promoter_profiles set designation = null where id = p_user;
  else
    select * into v_lvl from public.bazaar_award_levels where level = p_level;
    if not found then raise exception 'unknown level %', p_level; end if;
    insert into public.bazaar_promoter_status as s (user_id, current_level, designation, admin_override)
    values (p_user, v_lvl.level, v_lvl.designation, p_override)
    on conflict (user_id) do update
      set current_level = v_lvl.level, designation = v_lvl.designation,
          admin_override = p_override, updated_at = now();
    insert into public.promoter_profiles as pp (id, referral_code, designation)
    values (p_user,
            coalesce((select referral_code from public.profiles where id = p_user), p_user::text),
            v_lvl.designation)
    on conflict (id) do update set designation = v_lvl.designation;
    insert into public.notifications(user_id, type, title, body, meta)
    values (p_user, 'income', 'Designation updated: ' || v_lvl.designation,
            'Your designation has been set to ' || v_lvl.designation || ' (Level ' || v_lvl.level || ').',
            jsonb_build_object('event', 'designation_set', 'level', v_lvl.level));
  end if;
end $$;

create or replace function public.bazaar_admin_overview()
returns table (
  user_id uuid, full_name text, member_code text, mobile text, partner_status text,
  direct_sales_count int, direct_referrals_count int, team_sales numeric,
  min_referral_team_sales numeric, current_level int, designation text,
  rsi_unlocked boolean, admin_override boolean, pending_income numeric, paid_income numeric
) language sql stable security definer set search_path = public as $$
  select pr.id, pr.full_name, pr.member_code, pr.mobile, pr.partner_status,
         coalesce(s.direct_sales_count, 0), coalesce(s.direct_referrals_count, 0),
         coalesce(s.team_sales, 0), coalesce(s.min_referral_team_sales, 0),
         coalesce(s.current_level, 0), s.designation,
         coalesce(s.rsi_unlocked, false), coalesce(s.admin_override, false),
         coalesce((select sum(amount) from public.commissions c where c.beneficiary_id = pr.id and c.status in ('pending','approved')), 0)
           + coalesce((select sum(amount) from public.bazaar_income_ledger l where l.user_id = pr.id and l.status in ('pending','approved')), 0),
         coalesce((select sum(amount) from public.commissions c where c.beneficiary_id = pr.id and c.status = 'paid'), 0)
           + coalesce((select sum(amount) from public.bazaar_income_ledger l where l.user_id = pr.id and l.status = 'paid'), 0)
    from public.profiles pr
    left join public.bazaar_promoter_status s on s.user_id = pr.id
   where public.bazaar_is_admin()
     and (pr.role in ('promoter','super_admin') or pr.partner_status in ('verified','pending'))
   order by coalesce(s.team_sales, 0) desc, pr.member_code;
$$;

create or replace function public.bazaar_admin_evaluate_all()
returns int language plpgsql security definer set search_path = public as $$
declare v_u record; v_n int := 0;
begin
  if not public.bazaar_is_admin() then raise exception 'not authorized'; end if;
  for v_u in
    select pr.id from public.profiles pr
    where pr.role in ('promoter','super_admin') or pr.partner_status = 'verified'
  loop
    perform public.bazaar_evaluate(v_u.id);
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

create or replace function public.bazaar_admin_set_income_status(p_id uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.bazaar_is_admin() then raise exception 'not authorized'; end if;
  if p_status not in ('pending','approved','paid','rejected') then raise exception 'bad status'; end if;
  update public.bazaar_income_ledger
     set status = p_status, paid_at = case when p_status = 'paid' then now() else paid_at end, updated_at = now()
   where id = p_id;
  if not found then raise exception 'row not found'; end if;
end $$;

create or replace function public.bazaar_admin_issue_offer_reward(p_id uuid, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_row record;
begin
  if not public.bazaar_is_admin() then raise exception 'not authorized'; end if;
  select oa.*, o.title into v_row
    from public.bazaar_offer_awards oa join public.bazaar_launch_offers o on o.id = oa.offer_id
   where oa.id = p_id;
  if not found then raise exception 'not found'; end if;
  update public.bazaar_offer_awards
     set status = 'reward_issued', issued_at = now(), note = coalesce(p_note, note)
   where id = p_id;
  insert into public.notifications(user_id, type, title, body, meta)
  values (v_row.user_id, 'income', 'Launch offer reward issued 🎁',
          'Your reward for "' || v_row.title || '" has been issued.' ||
          case when p_note is not null then ' ' || p_note else '' end,
          jsonb_build_object('offer_award_id', p_id));
end $$;

-- ─── 11. RLS + grants (explicit; platform auto-grant is going away) ───
alter table public.bazaar_award_levels    enable row level security;
alter table public.bazaar_income_ledger   enable row level security;
alter table public.bazaar_promoter_status enable row level security;
alter table public.bazaar_awards          enable row level security;
alter table public.bazaar_launch_offers   enable row level security;
alter table public.bazaar_offer_awards    enable row level security;

drop policy if exists bz_levels_read on public.bazaar_award_levels;
create policy bz_levels_read on public.bazaar_award_levels for select to authenticated using (true);
drop policy if exists bz_levels_admin on public.bazaar_award_levels;
create policy bz_levels_admin on public.bazaar_award_levels for all to authenticated
  using (public.bazaar_is_admin()) with check (public.bazaar_is_admin());

drop policy if exists bz_ledger_own on public.bazaar_income_ledger;
create policy bz_ledger_own on public.bazaar_income_ledger for select to authenticated
  using (user_id = auth.uid() or public.bazaar_is_admin());

drop policy if exists bz_status_own on public.bazaar_promoter_status;
create policy bz_status_own on public.bazaar_promoter_status for select to authenticated
  using (user_id = auth.uid() or public.bazaar_is_admin());

drop policy if exists bz_awards_own on public.bazaar_awards;
create policy bz_awards_own on public.bazaar_awards for select to authenticated
  using (user_id = auth.uid() or public.bazaar_is_admin());
drop policy if exists bz_awards_admin on public.bazaar_awards;
create policy bz_awards_admin on public.bazaar_awards for all to authenticated
  using (public.bazaar_is_admin()) with check (public.bazaar_is_admin());

drop policy if exists bz_offers_read on public.bazaar_launch_offers;
create policy bz_offers_read on public.bazaar_launch_offers for select to authenticated
  using (active or public.bazaar_is_admin());
drop policy if exists bz_offers_admin on public.bazaar_launch_offers;
create policy bz_offers_admin on public.bazaar_launch_offers for all to authenticated
  using (public.bazaar_is_admin()) with check (public.bazaar_is_admin());

drop policy if exists bz_offer_awards_own on public.bazaar_offer_awards;
create policy bz_offer_awards_own on public.bazaar_offer_awards for select to authenticated
  using (user_id = auth.uid() or public.bazaar_is_admin());

grant select on public.bazaar_award_levels, public.bazaar_income_ledger,
               public.bazaar_promoter_status, public.bazaar_awards,
               public.bazaar_launch_offers, public.bazaar_offer_awards to authenticated;
grant insert, update, delete on public.bazaar_award_levels, public.bazaar_launch_offers to authenticated;
grant usage on sequence public.bazaar_ref_seq to authenticated;

revoke execute on function public.bazaar_income_summary() from public, anon;
revoke execute on function public.bazaar_income_history(text, date, date) from public, anon;
revoke execute on function public.bazaar_admin_adjust(uuid, numeric, text) from public, anon;
revoke execute on function public.bazaar_admin_set_designation(uuid, int, boolean) from public, anon;
revoke execute on function public.bazaar_admin_overview() from public, anon;
revoke execute on function public.bazaar_admin_evaluate_all() from public, anon;
revoke execute on function public.bazaar_admin_set_income_status(uuid, text) from public, anon;
revoke execute on function public.bazaar_admin_issue_offer_reward(uuid, text) from public, anon;
revoke execute on function public.bazaar_credit_monthly_awards() from public, anon;
revoke execute on function public.bazaar_evaluate(uuid) from public, anon, authenticated;

grant execute on function public.bazaar_income_summary() to authenticated;
grant execute on function public.bazaar_income_history(text, date, date) to authenticated;
grant execute on function public.bazaar_admin_adjust(uuid, numeric, text) to authenticated;
grant execute on function public.bazaar_admin_set_designation(uuid, int, boolean) to authenticated;
grant execute on function public.bazaar_admin_overview() to authenticated;
grant execute on function public.bazaar_admin_evaluate_all() to authenticated;
grant execute on function public.bazaar_admin_set_income_status(uuid, text) to authenticated;
grant execute on function public.bazaar_admin_issue_offer_reward(uuid, text) to authenticated;
grant execute on function public.bazaar_credit_monthly_awards() to authenticated;
