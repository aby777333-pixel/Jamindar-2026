-- 0072 — let people edit their own community posts.
--
-- Comments could be edited since 0068, but posts could only be DELETED. The
-- only way to fix a typo was to delete the post and write it again, losing its
-- likes and replies (owner bug report: "No Edit Option Available for Own Posts").
--
-- edit_community_post mirrors edit_community_comment exactly: UPDATE in place
-- (never a second row), re-mask contact details, stamp edited_at, log the
-- contacts, and write a community_audit row holding the previous text.
--
-- community_feed and community_post_detail are reproduced verbatim from the
-- live definitions with a single 'edited' field added, so the app can show the
-- same "Edited" marker posts' comments already carry.

alter table public.community_posts
  add column if not exists edited_at timestamptz;

comment on column public.community_posts.edited_at is
  'Set when the author (or an admin) edits the post. Drives the "Edited" label.';

create or replace function public.edit_community_post(p_id uuid, p_body text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_uid uuid := auth.uid(); c public.community_posts; m record; e text; ph text;
begin
  if v_uid is null then raise exception 'not signed in'; end if;

  select * into c from public.community_posts where id = p_id;
  if not found then raise exception 'post not found'; end if;
  if c.status <> 'published' then raise exception 'post not found'; end if;

  -- Only your own — admins may moderate anyone's, same rule as comments.
  if c.author_id <> v_uid and not public.is_super_admin() then
    raise exception 'You can only edit your own posts';
  end if;

  -- A post may be media-only, so an empty body is allowed only when something
  -- else is still attached — matching create_community_post's own rule.
  if coalesce(trim(p_body),'') = ''
     and jsonb_array_length(coalesce(c.media,'[]'::jsonb)) = 0 then
    raise exception 'empty post';
  end if;

  -- A blocked member cannot edit their way around the block (0070).
  if public.is_community_blocked(v_uid) then
    raise exception 'Your community access has been suspended';
  end if;

  select * into m from public.community_mask(p_body);

  update public.community_posts
     set body = m.o_masked,
         masked = (coalesce(array_length(m.o_emails,1),0) + coalesce(array_length(m.o_phones,1),0)) > 0,
         edited_at = now()
   where id = p_id;

  foreach e in array m.o_emails loop
    insert into public.community_contact_log(post_id, author_id, kind, value, raw_text)
    values (p_id, v_uid, 'email', e, p_body);
  end loop;
  foreach ph in array m.o_phones loop
    insert into public.community_contact_log(post_id, author_id, kind, value, raw_text)
    values (p_id, v_uid, 'phone', ph, p_body);
  end loop;

  insert into public.community_audit(post_id, actor_id, action, before_body, after_body, meta)
  values (p_id, v_uid, 'post_edit', c.body, m.o_masked,
          jsonb_build_object('by_admin', c.author_id <> v_uid));
end $function$;

revoke execute on function public.edit_community_post(uuid, text) from public, anon;
grant  execute on function public.edit_community_post(uuid, text) to authenticated;

-- ── read paths: surface the Edited marker ─────────────────────────────────
create or replace function public.community_feed(p_limit integer default 30, p_before timestamp with time zone default null::timestamp with time zone)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_uid uuid := auth.uid(); v_out jsonb;
begin
  if v_uid is null then return '[]'::jsonb; end if;
  select coalesce(jsonb_agg(j), '[]'::jsonb) into v_out from (
    select jsonb_build_object(
      'id', cp.id, 'body', cp.body, 'media', cp.media, 'links', cp.links,
      'masked', cp.masked, 'created_at', cp.created_at,
      'author', jsonb_build_object(
        'name', coalesce(pr.full_name, 'Jamin member'),
        'member_code', pr.member_code, 'avatar_url', pr.avatar_url, 'role', pr.role),
      'likes',    (select count(*) from public.community_likes l where l.post_id = cp.id),
      'comments', (select count(*) from public.community_comments c
                    where c.post_id = cp.id and c.status = 'published'),
      'liked', exists (select 1 from public.community_likes l where l.post_id = cp.id and l.user_id = v_uid),
      'mine', cp.author_id = v_uid,
      'edited', cp.edited_at is not null,
      'comments_locked', cp.comments_locked
    ) as j
    from public.community_posts cp
    join public.profiles pr on pr.id = cp.author_id
    where cp.status = 'published' and (p_before is null or cp.created_at < p_before)
    order by cp.created_at desc
    limit least(greatest(coalesce(p_limit, 30), 1), 60)
  ) q;
  return v_out;
end $function$;

create or replace function public.community_post_detail(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_uid uuid := auth.uid(); v_post jsonb; v_comments jsonb;
begin
  if v_uid is null then return null; end if;
  select jsonb_build_object(
    'id', cp.id, 'body', cp.body, 'media', cp.media, 'links', cp.links,
    'masked', cp.masked, 'created_at', cp.created_at, 'status', cp.status,
    'author', jsonb_build_object(
      'name', coalesce(pr.full_name, 'Jamin member'),
      'member_code', pr.member_code, 'avatar_url', pr.avatar_url, 'role', pr.role),
    'likes',    (select count(*) from public.community_likes l where l.post_id = cp.id),
    'liked', exists (select 1 from public.community_likes l where l.post_id = cp.id and l.user_id = v_uid),
    'mine', cp.author_id = v_uid,
    'edited', cp.edited_at is not null,
    'comments_locked', cp.comments_locked,
    'visibility', cp.visibility,
    'public_enabled', cp.public_enabled,
    'pinned_comment_id', cp.pinned_comment_id,
    'pinned_by', (select coalesce(p2.full_name,'Jamin') from public.profiles p2 where p2.id = cp.pinned_by),
    'can_pin', (cp.author_id = v_uid or public.is_super_admin()),
    'is_admin', public.is_super_admin()
  ) into v_post
  from public.community_posts cp
  join public.profiles pr on pr.id = cp.author_id
  where cp.id = p_id and (cp.status = 'published' or cp.author_id = v_uid or public.is_super_admin());
  if v_post is null then return null; end if;

  select coalesce(jsonb_agg(j), '[]'::jsonb) into v_comments from (
    select jsonb_build_object(
      'id', cc.id, 'body', case when cc.status = 'deleted' then '' else cc.body end,
      'masked', cc.masked, 'created_at', cc.created_at,
      'mine', cc.author_id is not null and cc.author_id = v_uid,
      'edited', cc.edited_at is not null,
      'edited_at', cc.edited_at,
      'deleted', cc.status = 'deleted',
      'parent_id', cc.parent_id,
      'is_admin_reply', cc.is_admin_reply,
      'guest', cc.guest_id is not null,
      'can_manage', ((cc.author_id is not null and cc.author_id = v_uid) or public.is_super_admin()),
      'reply_to_name', (select coalesce(p3.full_name, g3.name, 'Jamin member')
                          from public.community_comments pc
                          left join public.profiles p3 on p3.id = pc.author_id
                          left join public.community_guests g3 on g3.id = pc.guest_id
                         where pc.id = cc.parent_id),
      'author', jsonb_build_object(
        'name', case when cc.is_admin_reply then 'Jamin Admin'
                     else coalesce(pr.full_name, g.name, 'Jamin member') end,
        'member_code', pr.member_code, 'avatar_url', pr.avatar_url)
    ) as j
    from public.community_comments cc
    left join public.profiles pr on pr.id = cc.author_id
    left join public.community_guests g on g.id = cc.guest_id
    where cc.post_id = p_id
      and (cc.status = 'published'
           or exists (select 1 from public.community_comments r
                       where r.parent_id = cc.id and r.status = 'published'))
    order by cc.created_at asc
    limit 300
  ) q;
  return v_post || jsonb_build_object('comments_list', v_comments);
end $function$;
