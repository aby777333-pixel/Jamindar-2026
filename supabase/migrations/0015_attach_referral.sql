-- 0015_attach_referral.sql
-- Acquisition/referral attribution. Additive & non-breaking.
--   • protect profiles.referred_by (reward-relevant) from client tampering —
--     only a super_admin or the definer RPC may set it.
--   • attach_referral(): one-time, on first login, sets referred_by +
--     acquisition_source and records a 'registration' referral event.

-- extend the 0009 guard to also protect referred_by
create or replace function public.guard_protected_profile_cols()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(current_setting('app.allow_protected', true), '') = 'on' then return new; end if;
  if exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin') then return new; end if;
  new.kyc_status          := old.kyc_status;
  new.partner_status      := old.partner_status;
  new.partner_code        := old.partner_code;
  new.partner_verified_at := old.partner_verified_at;
  new.member_code         := old.member_code;
  new.referral_code       := old.referral_code;
  new.referred_by         := old.referred_by;
  return new;
end;
$$;
revoke execute on function public.guard_protected_profile_cols() from public;

create or replace function public.attach_referral(
  p_code text default null, p_source text default null, p_meta jsonb default '{}'::jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_uid uuid := auth.uid(); v_ref uuid; v_cur uuid;
begin
  if v_uid is null then return; end if;
  select referred_by into v_cur from public.profiles where id = v_uid;
  if p_code is not null and p_code <> '' then
    select id into v_ref from public.profiles where referral_code = p_code and id <> v_uid;
  end if;
  perform set_config('app.allow_protected', 'on', true);
  update public.profiles
     set referred_by        = coalesce(referred_by, v_ref),
         acquisition_source = coalesce(acquisition_source, nullif(p_source,'')),
         acquisition_meta   = case when acquisition_meta = '{}'::jsonb then coalesce(p_meta,'{}'::jsonb) else acquisition_meta end
   where id = v_uid;
  -- credit the referrer once (only if this user had no referrer before)
  if v_ref is not null and v_cur is null then
    insert into public.referral_events(referrer_id, referred_id, event_type, meta)
    values (v_ref, v_uid, 'registration', coalesce(p_meta, '{}'::jsonb));
  end if;
  insert into public.activity_log(user_id, event_type, meta)
    values (v_uid, 'acquisition_attached', jsonb_build_object('source', p_source, 'code', p_code, 'referrer', v_ref));
end;
$$;

revoke execute on function public.attach_referral(text, text, jsonb) from public;
grant  execute on function public.attach_referral(text, text, jsonb) to authenticated;
