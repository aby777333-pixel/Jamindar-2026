-- 0057_income_filters_reporting.sql
-- Income module — advanced filtering & reporting (owner spec 29-07 evening).
-- ADDITIVE: the summary/history RPCs gain optional range/status/search
-- parameters (no-arg calls behave exactly as before via defaults), a new
-- admin report RPC powers filtered exports with full context (promoter,
-- buyer, project, city, phase), and covering indexes keep it fast at scale.

-- ─── indexes for date-ranged income queries ───
create index if not exists commissions_beneficiary_created_idx
  on public.commissions (beneficiary_id, created_at desc);
create index if not exists commissions_created_idx
  on public.commissions (created_at desc);
create index if not exists bazaar_ledger_created_idx
  on public.bazaar_income_ledger (created_at desc);

-- ─── range-aware summary (drop first: signature changes) ───
drop function if exists public.bazaar_income_summary();
create or replace function public.bazaar_income_summary(p_from date default null, p_to date default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  v_locked boolean;
  v_from timestamptz := coalesce(p_from::timestamptz, '-infinity');
  v_to   timestamptz := coalesce((p_to + 1)::timestamptz, 'infinity');
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
    from public.commissions
    where beneficiary_id = me and created_at >= v_from and created_at < v_to
    group by level
  ),
  dsi as (select coalesce(sum(pending),0) p, coalesce(sum(paid),0) pd, coalesce(sum(total),0) t from c where level = 0),
  rsi as (select coalesce(sum(pending),0) p, coalesce(sum(paid),0) pd, coalesce(sum(total),0) t from c where level >= 1),
  led as (
    select income_type,
           sum(amount) filter (where status in ('pending','approved')) as pending,
           sum(amount) filter (where status = 'paid') as paid,
           sum(amount) filter (where status <> 'rejected') as total
    from public.bazaar_income_ledger
    where user_id = me and created_at >= v_from and created_at < v_to
    group by income_type
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
       coalesce((select sum(amount) from public.commissions where beneficiary_id = me and status='paid' and created_at >= v_from and created_at < v_to),0)
       + coalesce((select sum(amount) from public.bazaar_income_ledger where user_id = me and status='paid' and created_at >= v_from and created_at < v_to),0),
    'tx_count',
       coalesce((select count(*) from public.commissions where beneficiary_id = me and status <> 'cancelled' and created_at >= v_from and created_at < v_to),0)
       + coalesce((select count(*) from public.bazaar_income_ledger where user_id = me and status <> 'rejected' and created_at >= v_from and created_at < v_to),0),
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
revoke execute on function public.bazaar_income_summary(date, date) from public, anon;
grant execute on function public.bazaar_income_summary(date, date) to authenticated;

-- ─── history with status + free-text search (drop first: signature changes) ───
drop function if exists public.bazaar_income_history(text, date, date);
create or replace function public.bazaar_income_history(
  p_type text default null, p_from date default null, p_to date default null,
  p_status text default null, p_search text default null, p_limit int default 500)
returns table (entry_date timestamptz, income_type text, description text, reference_no text, amount numeric, status text)
language sql stable security definer set search_path = public as $$
  with rows as (
    select c.created_at as entry_date,
           case when c.level = 0 then 'dsi' else 'rsi' end as income_type,
           case when c.level = 0 then 'Direct sale income'
                else 'Referral income · Level ' || c.level || coalesce(' · from ' || fp.full_name, '') end as description,
           'CM-' || left(c.id::text, 8) as reference_no, c.amount, c.status
      from public.commissions c
      left join public.profiles fp on fp.id = c.from_user_id
     where c.beneficiary_id = auth.uid() and c.status <> 'cancelled'
    union all
    select l.created_at, l.income_type,
           coalesce(l.description, upper(l.income_type) || ' income'),
           l.reference_no, l.amount, l.status
      from public.bazaar_income_ledger l
     where l.user_id = auth.uid()
  )
  select * from rows r
   where (p_type   is null or r.income_type = p_type)
     and (p_from   is null or r.entry_date >= p_from)
     and (p_to     is null or r.entry_date < p_to + 1)
     and (p_status is null or r.status = p_status)
     and (p_search is null or p_search = ''
          or r.reference_no ilike '%' || p_search || '%'
          or r.description  ilike '%' || p_search || '%')
   order by r.entry_date desc
   limit least(greatest(coalesce(p_limit, 500), 1), 2000);
$$;
revoke execute on function public.bazaar_income_history(text, date, date, text, text, int) from public, anon;
grant execute on function public.bazaar_income_history(text, date, date, text, text, int) to authenticated;

-- ─── admin: filtered income report (drives console tables + exports) ───
create or replace function public.bazaar_admin_income_report(
  p_from date default null, p_to date default null,
  p_type text default null, p_status text default null,
  p_user uuid default null, p_property uuid default null,
  p_search text default null, p_limit int default 1000)
returns table (
  entry_date timestamptz, income_type text, reference_no text, description text,
  amount numeric, status text, promoter_name text, promoter_code text,
  buyer_name text, project_title text, project_city text, project_phase text, level int
) language sql stable security definer set search_path = public as $$
  with rows as (
    select c.created_at as entry_date,
           case when c.level = 0 then 'dsi' else 'rsi' end as income_type,
           'CM-' || left(c.id::text, 8) as reference_no,
           case when c.level = 0 then 'Direct sale income'
                else 'Referral income · Level ' || c.level end as description,
           c.amount, c.status,
           bp.full_name as promoter_name, bp.member_code as promoter_code,
           by_p.full_name as buyer_name,
           pt.title as project_title, pt.city as project_city, pt.project_phase::text as project_phase,
           c.level,
           c.beneficiary_id as uid, b.property_id as pid
      from public.commissions c
      left join public.profiles bp on bp.id = c.beneficiary_id
      left join public.bookings b on b.id = c.booking_id
      left join public.profiles by_p on by_p.id = b.buyer_id
      left join public.properties pt on pt.id = b.property_id
     where c.status <> 'cancelled'
    union all
    select l.created_at, l.income_type, l.reference_no,
           coalesce(l.description, upper(l.income_type) || ' income'),
           l.amount, l.status,
           lp.full_name, lp.member_code, null, null, null, null, null,
           l.user_id, null
      from public.bazaar_income_ledger l
      left join public.profiles lp on lp.id = l.user_id
  )
  select r.entry_date, r.income_type, r.reference_no, r.description, r.amount, r.status,
         r.promoter_name, r.promoter_code, r.buyer_name, r.project_title, r.project_city, r.project_phase, r.level
    from rows r
   where public.bazaar_is_admin()
     and (p_from     is null or r.entry_date >= p_from)
     and (p_to       is null or r.entry_date < p_to + 1)
     and (p_type     is null or r.income_type = p_type)
     and (p_status   is null or r.status = p_status)
     and (p_user     is null or r.uid = p_user)
     and (p_property is null or r.pid = p_property)
     and (p_search   is null or p_search = ''
          or r.reference_no ilike '%' || p_search || '%'
          or r.description  ilike '%' || p_search || '%'
          or r.promoter_name ilike '%' || p_search || '%'
          or r.promoter_code ilike '%' || p_search || '%'
          or r.buyer_name   ilike '%' || p_search || '%'
          or r.project_title ilike '%' || p_search || '%'
          or r.project_city  ilike '%' || p_search || '%')
   order by r.entry_date desc
   limit least(greatest(coalesce(p_limit, 1000), 1), 10000);
$$;
revoke execute on function public.bazaar_admin_income_report(date, date, text, text, uuid, uuid, text, int) from public, anon;
grant execute on function public.bazaar_admin_income_report(date, date, text, text, uuid, uuid, text, int) to authenticated;
