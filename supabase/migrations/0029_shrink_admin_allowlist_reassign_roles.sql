-- 0029 — Shrink the super-admin allowlist to the owner only, and convert the
-- two former admins to their real roles:
--   S S SUNDARAM (sssresilience@gmail.com) -> verified Promoter
--   Saro         (sarozone@gmail.com)      -> Buyer
-- The 0004 trigger pipeline stays untouched — this only changes the allowlist
-- data and performs the exact same steps admin_review_partner (0025) would,
-- so Sundaram's promoter dashboard, V-card and referral link all resolve.

create or replace function public.is_super_admin_mobile(m text)
returns boolean
language sql immutable as $$
  select m in ('917012608089');
$$;

do $$
declare
  v_sundaram uuid;
  v_saro     uuid;
  v_code     text;
begin
  -- let this migration write the guard-protected columns (0025)
  perform set_config('app.allow_protected', 'on', true);

  select id into v_saro     from public.profiles where email = 'sarozone@gmail.com';
  select id into v_sundaram from public.profiles where email = 'sssresilience@gmail.com';

  if v_saro is not null then
    update public.profiles set role = 'buyer' where id = v_saro;
  end if;

  if v_sundaram is not null then
    -- mirror admin_review_partner(v_sundaram, 'verified')
    v_code := 'JA-P-' || lpad(nextval('public.partner_code_seq')::text, 4, '0');
    update public.profiles
       set role                = 'promoter',
           partner_status      = 'verified',
           partner_code        = coalesce(partner_code, v_code),
           partner_verified_at = coalesce(partner_verified_at, now())
     where id = v_sundaram;

    insert into public.promoter_profiles (id, referral_code)
    select v_sundaram,
           coalesce((select referral_code from public.profiles where id = v_sundaram),
                    'JA-REF-' || substr(replace(v_sundaram::text, '-', ''), 1, 8))
    on conflict (id) do nothing;

    insert into public.notifications (user_id, type, title, body)
    values (v_sundaram, 'partner', 'You are now a Verified Jamin Partner',
            'Your account is now a Promoter account. Your Promoter ID, referral link and digital card are ready.');
  end if;
end $$;
