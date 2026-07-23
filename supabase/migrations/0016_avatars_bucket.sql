-- 0016_avatars_bucket.sql
-- Public 'avatars' bucket so users can upload a profile photo. Additive.
-- (profiles.avatar_url already exists; it is client-writable via profiles_self_upd
--  and is NOT a guard-protected column.)

insert into storage.buckets (id, name, public) values ('avatars','avatars', true)
  on conflict (id) do nothing;

drop policy if exists avatars_read on storage.objects;
create policy avatars_read on storage.objects for select using (bucket_id = 'avatars');

drop policy if exists avatars_owner on storage.objects;
create policy avatars_owner on storage.objects for all to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
