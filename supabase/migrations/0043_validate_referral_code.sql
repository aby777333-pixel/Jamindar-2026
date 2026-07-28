-- 0043 — Referral-code validation (bug report 28-07, HIGH).
-- • validate_referral_code(): callable pre-login (anon) so the verify screen
--   can reject unknown codes and self-referral before registration completes.
-- • attach_referral() hardened: case-insensitive match, trims whitespace, and
--   falls back to promoter_profiles.referral_code — same one-time semantics.

create or replace function public.validate_referral_code(
  p_code text, p_mobile text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text := upper(trim(coalesce(p_code, '')));
  v_ref  uuid;
  v_name text;
  v_norm text;
begin
  if v_code = '' then
    return jsonb_build_object('valid', false, 'reason', 'empty');
  end if;

  select id, full_name into v_ref, v_name
    from public.profiles where upper(referral_code) = v_code limit 1;
  if v_ref is null then
    select p.id, p.full_name into v_ref, v_name
      from public.promoter_profiles pp
      join public.profiles p on p.id = pp.id
     where upper(pp.referral_code) = v_code limit 1;
  end if;

  if v_ref is null then
    return jsonb_build_object('valid', false, 'reason', 'not_found');
  end if;

  -- self-referral: the code's owner is the very mobile signing in
  if coalesce(p_mobile, '') <> '' then
    v_norm := regexp_replace(p_mobile, '[^0-9]', '', 'g');
    if length(v_norm) = 10 then v_norm := '91' || v_norm; end if;
    if exists (select 1 from public.profiles where id = v_ref and mobile = v_norm) then
      return jsonb_build_object('valid', false, 'reason', 'self');
    end if;
  end if;

  return jsonb_build_object('valid', true, 'referrer_name', v_name);
end $$;

revoke execute on function public.validate_referral_code(text, text) from public;
grant  execute on function public.validate_referral_code(text, text) to anon, authenticated;

-- Same signature, hardened matching; one-time credit semantics unchanged.
create or replace function public.attach_referral(
  p_code text default null, p_source text default null, p_meta jsonb default '{}'::jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_uid uuid := auth.uid(); v_ref uuid; v_cur uuid; v_code text := upper(trim(coalesce(p_code, '')));
begin
  if v_uid is null then return; end if;
  select referred_by into v_cur from public.profiles where id = v_uid;
  if v_code <> '' then
    select id into v_ref from public.profiles
     where upper(referral_code) = v_code and id <> v_uid limit 1;
    if v_ref is null then
      select pp.id into v_ref from public.promoter_profiles pp
       where upper(pp.referral_code) = v_code and pp.id <> v_uid limit 1;
    end if;
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
end $$;

revoke execute on function public.attach_referral(text, text, jsonb) from public;
grant  execute on function public.attach_referral(text, text, jsonb) to authenticated;
