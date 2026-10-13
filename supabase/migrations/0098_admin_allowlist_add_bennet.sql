-- Jamindar — 0098: Owner request 2026-10-13: grant super-admin to Bennet J
-- (mobile 919600910112, member JA000044, bennet@jaminbazaar.in). Adds the
-- mobile to the 0004/0029/0054 allowlist and promotes the existing profile.
-- Partner fields (JA-P-0028, referral code) are untouched. Super-admin is a
-- role on the profile, so the app console, the web admin console and every
-- is_super_admin() RLS policy / RPC pick it up without a redeploy.

create or replace function public.is_super_admin_mobile(m text)
returns boolean
language sql immutable
set search_path = public, pg_temp
as $$
  select m in ('917012608089', '918778240963', '919751977766', '919600910112');
$$;

do $$
begin
  perform set_config('app.allow_protected', 'on', true);
  -- trg_enforce_super_admin forces role='super_admin' for allowlisted mobiles
  update public.profiles
     set role  = 'super_admin',
         email = 'bennet@jaminbazaar.in'
   where mobile = '919600910112';
end $$;
