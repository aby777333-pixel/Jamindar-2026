-- 0052: community_stats — powers the Jamin Community section on the Home
-- page (report 28-07-2): member count + activity numbers. Additive only.

create or replace function public.community_stats()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'members', (select count(*) from profiles where is_active is distinct from false),
    'posts',   (select count(*) from community_posts where status = 'published'),
    'comments',(select count(*) from community_comments)
  );
$$;

revoke execute on function public.community_stats() from public;
grant execute on function public.community_stats() to anon, authenticated, service_role;
