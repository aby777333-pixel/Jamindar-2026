-- 0074: community_stats must count what the community page actually shows.
--
-- Bug report 21: the Home screen's Jamin Community card said "2 Comments" while
-- the community page showed 1. 0052 counted every row in community_comments,
-- but 0068 added soft deletion (status = 'deleted', deleted_at set) and the feed
-- has always hidden deleted comments — so each deleted comment left the Home
-- card one ahead of reality, for good.
--
-- Two filters, matching the feed exactly:
--   * only published comments, and
--   * only comments that hang off a published post (hiding a post hides its
--     comments in the app, so they must not be counted on the way in either).
--
-- Posts and members are unchanged; posts already filtered on 'published'.

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
    'comments',(select count(*)
                  from community_comments c
                  join community_posts p on p.id = c.post_id
                 where c.status = 'published'
                   and p.status = 'published')
  );
$$;

revoke execute on function public.community_stats() from public;
grant execute on function public.community_stats() to anon, authenticated, service_role;
