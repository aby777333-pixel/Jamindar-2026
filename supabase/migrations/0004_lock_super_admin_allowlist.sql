-- ============================================================
-- Lock the super_admin role to a fixed mobile allowlist.
-- Enforced by a trigger so NO client (even hitting the API
-- directly) can grant themselves super_admin.
-- ============================================================

create or replace function public.is_super_admin_mobile(m text)
returns boolean
language sql immutable as $$
  select m in ('917012608089', '918778240963', '919751977766');
$$;

create or replace function public.enforce_super_admin_role()
returns trigger
language plpgsql as $$
begin
  if public.is_super_admin_mobile(new.mobile) then
    new.role := 'super_admin';
  elsif new.role = 'super_admin' then
    new.role := 'buyer';
  end if;
  return new;
end $$;

drop trigger if exists trg_enforce_super_admin on public.profiles;
create trigger trg_enforce_super_admin
  before insert or update on public.profiles
  for each row execute function public.enforce_super_admin_role();

update public.profiles set role = 'super_admin'
  where public.is_super_admin_mobile(mobile) and role <> 'super_admin';
update public.profiles set role = 'buyer'
  where role = 'super_admin' and not public.is_super_admin_mobile(mobile);
