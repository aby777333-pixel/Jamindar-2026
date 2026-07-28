-- 0042 — Owner request 2026-07-28: grant super-admin to Mani (Manichandra,
-- mobile 916305057191, member JA000003). Adds the mobile to the 0004/0029
-- allowlist and promotes the existing profile. Partner fields are untouched.

create or replace function public.is_super_admin_mobile(m text)
returns boolean
language sql immutable as $$
  select m in ('917012608089', '916305057191');
$$;

do $$
begin
  perform set_config('app.allow_protected', 'on', true);
  -- trg_enforce_super_admin forces role='super_admin' for allowlisted mobiles
  update public.profiles set role = 'super_admin' where mobile = '916305057191';
end $$;
