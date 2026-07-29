-- 0062 — Super Admin referral assignment (owner spec 29-07): assign, change or
-- remove a user's referrer after registration. Only the referred_by pointer
-- moves — historical leads/commissions stay untouched; every FUTURE enquiry,
-- visit, booking and commission fan-out simply follows the new chain because
-- the engine reads referred_by at event time. Full audit: who/when columns on
-- profiles + an activity_log row per change. Super admin only.
alter table public.profiles add column if not exists referred_by_set_at timestamptz;
alter table public.profiles add column if not exists referred_by_set_by uuid references public.profiles(id);

create or replace function public.admin_set_referrer(p_user uuid, p_referrer uuid default null)
returns jsonb
language plpgsql security definer set search_path to 'public'
as $$
declare
  me uuid := auth.uid();
  v_old uuid;
  v_walk uuid;
  v_hops int := 0;
  v_ref_name text := null;
  v_ref_code text := null;
begin
  if not exists (select 1 from profiles where profiles.id = me and role = 'super_admin') then
    raise exception 'not authorized';
  end if;
  select referred_by into v_old from profiles where id = p_user;
  if not found then return jsonb_build_object('ok', false, 'error', 'User not found.'); end if;

  if p_referrer is not null then
    if p_referrer = p_user then
      return jsonb_build_object('ok', false, 'error', 'A user cannot refer themselves.');
    end if;
    select full_name, referral_code into v_ref_name, v_ref_code from profiles where id = p_referrer;
    if not found then return jsonb_build_object('ok', false, 'error', 'Referrer not found.'); end if;
    if v_old = p_referrer then
      return jsonb_build_object('ok', true, 'note', 'unchanged');
    end if;
    -- cycle guard: walking UP from the new referrer must never reach the user
    v_walk := p_referrer;
    while v_walk is not null and v_hops < 50 loop
      select referred_by into v_walk from profiles where id = v_walk;
      v_hops := v_hops + 1;
      if v_walk = p_user then
        return jsonb_build_object('ok', false, 'error', 'That would create a circular referral chain (the chosen referrer is in this user''s own downline).');
      end if;
    end loop;
  elsif v_old is null then
    return jsonb_build_object('ok', true, 'note', 'unchanged');
  end if;

  perform set_config('app.allow_protected', 'on', true);
  update profiles set
    referred_by = p_referrer,
    referred_by_set_at = case when p_referrer is null then null else now() end,
    referred_by_set_by = case when p_referrer is null then null else me end
  where id = p_user;

  insert into activity_log (user_id, event_type, meta) values (
    p_user, 'referrer_change',
    jsonb_build_object('old_referrer', v_old, 'new_referrer', p_referrer,
                       'changed_by', me, 'changed_at', now())
  );

  return jsonb_build_object('ok', true, 'referrer', p_referrer,
    'referrer_name', v_ref_name, 'referrer_code', v_ref_code);
end $$;

revoke execute on function public.admin_set_referrer(uuid, uuid) from public, anon;
grant execute on function public.admin_set_referrer(uuid, uuid) to authenticated;
