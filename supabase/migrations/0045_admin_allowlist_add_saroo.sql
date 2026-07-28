-- 0045 — Owner request 2026-07-28: grant super-admin to Saroo
-- (mobile 918778240963, existing member JA000001). Allowlist is now
-- owner + Mani + Saroo; profile promoted and named per the owner.

create or replace function public.is_super_admin_mobile(m text)
returns boolean
language sql immutable as $$
  select m in ('917012608089', '916305057191', '918778240963');
$$;

do $$
begin
  perform set_config('app.allow_protected', 'on', true);
  update public.profiles
     set role = 'super_admin', full_name = 'Saroo'
   where mobile = '918778240963';
end $$;
