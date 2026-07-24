-- 0019_admin_visits_leads.sql
-- Map the site-visit and lead flows to the admin console.
--
-- Additive & non-breaking: adds super_admin SELECT + UPDATE policies to
-- site_visits and leads (existing owner/involved policies are untouched and
-- still apply — RLS policies OR together). Without this the admin console
-- couldn't see or act on visit/callback requests, so those flows dead-ended.

drop policy if exists visits_admin_read on public.site_visits;
create policy visits_admin_read on public.site_visits for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin'));

drop policy if exists visits_admin_update on public.site_visits;
create policy visits_admin_update on public.site_visits for update to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin'));

drop policy if exists leads_admin_read on public.leads;
create policy leads_admin_read on public.leads for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin'));

drop policy if exists leads_admin_update on public.leads;
create policy leads_admin_update on public.leads for update to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin'));
