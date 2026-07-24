-- 0016_promoter_tree.sql
-- Promoter Module — Earning Tree (multi-level referral hierarchy).
--
-- Additive & non-breaking. Builds entirely on the existing parent link
-- profiles.referred_by (set only by attach_referral / a super_admin, guarded
-- by the 0009/0015 trigger). Levels are computed on demand with a recursive
-- walk — effectively endless; a defensive depth cap (200) prevents a hang if a
-- cycle is ever created by hand. No schema change, no RLS change, no data
-- migration, no change to any existing function.
--
-- Sale / earn are returned as 0 for now (the commission engine lands in a later
-- increment); the shape is fixed so those columns light up without a rewrite.

-- ── promoter self views ────────────────────────────────────────────────────

-- Level-wise headcount for the CURRENT promoter's downline.
create or replace function public.my_promoter_tree()
returns table(level int, users bigint)
language sql
stable
security definer
set search_path = public
as $$
  with recursive tree as (
    select id, 1 as lvl
      from public.profiles
     where referred_by = auth.uid()
    union all
    select p.id, t.lvl + 1
      from public.profiles p
      join tree t on p.referred_by = t.id
     where t.lvl < 200
  )
  select lvl as level, count(*)::bigint as users
    from tree
   group by lvl
   order by lvl;
$$;

-- Members at a specific level of the CURRENT promoter's downline.
create or replace function public.my_promoter_tree_level(p_level int)
returns table(
  user_id uuid, member_code text, full_name text,
  joined timestamptz, direct_referrals bigint, sale numeric, earn numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with recursive tree as (
    select id, 1 as lvl
      from public.profiles
     where referred_by = auth.uid()
    union all
    select p.id, t.lvl + 1
      from public.profiles p
      join tree t on p.referred_by = t.id
     where t.lvl < 200
  )
  select pr.id, pr.member_code, pr.full_name, pr.created_at,
         (select count(*) from public.profiles c where c.referred_by = pr.id)::bigint,
         0::numeric, 0::numeric
    from tree t
    join public.profiles pr on pr.id = t.id
   where t.lvl = greatest(p_level, 1)
   order by pr.member_code nulls last;
$$;

-- ── admin console views (super_admin only) ─────────────────────────────────

create or replace function public.admin_promoter_tree_summary(p_root uuid)
returns table(level int, users bigint)
language plpgsql
stable
security definer
set search_path = public
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
  select lvl as level, count(*)::bigint as users from tree group by lvl order by lvl;
end;
$$;

create or replace function public.admin_promoter_tree_level(p_root uuid, p_level int)
returns table(
  user_id uuid, member_code text, full_name text, mobile text,
  joined timestamptz, direct_referrals bigint, sale numeric, earn numeric
)
language plpgsql
stable
security definer
set search_path = public
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
         0::numeric, 0::numeric
    from tree t
    join public.profiles pr on pr.id = t.id
   where t.lvl = greatest(p_level, 1)
   order by pr.member_code nulls last;
end;
$$;

revoke execute on function public.my_promoter_tree() from public;
grant  execute on function public.my_promoter_tree() to authenticated;
revoke execute on function public.my_promoter_tree_level(int) from public;
grant  execute on function public.my_promoter_tree_level(int) to authenticated;
revoke execute on function public.admin_promoter_tree_summary(uuid) from public;
grant  execute on function public.admin_promoter_tree_summary(uuid) to authenticated;
revoke execute on function public.admin_promoter_tree_level(uuid, int) from public;
grant  execute on function public.admin_promoter_tree_level(uuid, int) to authenticated;
