-- Jamindar — 0054: Super-admin allowlist = the owner's three numbers
-- (9751977766, 7012608089, 8778240963). Replaces 916305057191 with
-- 919751977766 and aligns the affected accounts' roles.

create or replace function public.is_super_admin_mobile(m text)
returns boolean language sql immutable as $$
  select m in ('917012608089', '918778240963', '919751977766');
$$;

do $$
begin
  perform set_config('app.allow_protected', 'on', true);
  -- promote S S SUNDARAM (now allowlisted)
  update public.profiles set role = 'super_admin'
   where mobile = '919751977766' and role <> 'super_admin';
  -- the removed number keeps its account but is no longer a super admin
  update public.profiles set role = 'buyer'
   where mobile = '916305057191' and role = 'super_admin';
end $$;
