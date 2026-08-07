-- 0075 — let an author detach a single attachment while editing a post.
--
-- 0072 gave posts an editor, but only for the text: `edit_community_post`
-- took (id, body) and never touched `media`. Removing one wrong screenshot
-- therefore meant deleting the whole post and writing it again, losing its
-- likes and replies — the exact problem 0072 set out to end (owner bug report
-- 07-08 #3, "Unable to Remove Individual Attachments While Editing a Post").
--
-- Shape of the change, and why:
--
--   * The real implementation moves to a THREE-argument overload. The old
--     two-argument signature stays, byte-compatible, as a thin wrapper that
--     passes p_media => null. Phones running the shipped APK keep calling the
--     two-argument form and behave exactly as before — null means "leave the
--     attachments alone", which is not the same as an empty array.
--
--     Deliberately NOT `p_media jsonb default null` on one function: with the
--     two-argument version still present that would make every two-argument
--     call ambiguous ("function is not unique") and break the live build.
--
--   * p_media may only REMOVE. Every entry must already be attached to the
--     post, matched on its url. The client has no insert grant on
--     community_posts precisely so the masking RPCs stay the only way in, and
--     an edit path that accepted arbitrary media would hand that back.
--
--   * The "a post must contain something" rule is re-checked against the media
--     that will REMAIN, not the media that was there before — otherwise a
--     text-less post could have its last photo pulled and turn into a blank.

create or replace function public.edit_community_post(p_id uuid, p_body text, p_media jsonb)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  c public.community_posts;
  m record;
  e text;
  ph text;
  v_media jsonb;
  v_removed int := 0;
begin
  if v_uid is null then raise exception 'not signed in'; end if;

  select * into c from public.community_posts where id = p_id;
  if not found then raise exception 'post not found'; end if;
  if c.status <> 'published' then raise exception 'post not found'; end if;

  -- Only your own — admins may moderate anyone's, same rule as comments.
  if c.author_id <> v_uid and not public.is_super_admin() then
    raise exception 'You can only edit your own posts';
  end if;

  -- A blocked member cannot edit their way around the block (0070).
  if public.is_community_blocked(v_uid) then
    raise exception 'Your community access has been suspended';
  end if;

  -- null = untouched (the two-argument callers, i.e. every shipped build).
  if p_media is null then
    v_media := coalesce(c.media, '[]'::jsonb);
  else
    if jsonb_typeof(p_media) <> 'array' then
      raise exception 'attachments must be a list';
    end if;
    -- Removal only: anything not already on the post is rejected outright.
    if exists (
      select 1
        from jsonb_array_elements(p_media) n
       where not exists (
         select 1
           from jsonb_array_elements(coalesce(c.media, '[]'::jsonb)) o
          where o->>'url' = n->>'url')
    ) then
      raise exception 'attachments can only be removed while editing';
    end if;
    v_media := p_media;
    v_removed := jsonb_array_length(coalesce(c.media, '[]'::jsonb))
               - jsonb_array_length(p_media);
  end if;

  -- A post may be media-only, so an empty body is allowed only when something
  -- else is still attached — matching create_community_post's own rule, but
  -- measured against what SURVIVES the edit.
  if coalesce(trim(p_body), '') = ''
     and jsonb_array_length(coalesce(v_media, '[]'::jsonb)) = 0 then
    raise exception 'empty post';
  end if;

  select * into m from public.community_mask(p_body);

  update public.community_posts
     set body = m.o_masked,
         media = v_media,
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
          jsonb_build_object(
            'by_admin', c.author_id <> v_uid,
            'media_removed', v_removed,
            'media_before', coalesce(c.media, '[]'::jsonb)));
end $function$;

revoke execute on function public.edit_community_post(uuid, text, jsonb) from public, anon;
grant  execute on function public.edit_community_post(uuid, text, jsonb) to authenticated;

-- The original signature stays exactly where the shipped app expects it, now
-- delegating so the two paths can never drift.
create or replace function public.edit_community_post(p_id uuid, p_body text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  perform public.edit_community_post(p_id, p_body, null::jsonb);
end $function$;

revoke execute on function public.edit_community_post(uuid, text) from public, anon;
grant  execute on function public.edit_community_post(uuid, text) to authenticated;
