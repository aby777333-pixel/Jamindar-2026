-- 0070 — §10 block abusive users, + §11 grant hygiene.
--
-- Blocking had no mechanism at all: no column, no function. This adds one and
-- enforces it in BOTH community write paths, because blocking that only stops
-- comments (and still lets someone post) is not blocking.
--
-- add_community_comment and create_community_post are reproduced verbatim from
-- the live definitions with exactly one new check inserted after the sign-in
-- guard. Nothing else in either body changed.

-- ── 1. the flag ────────────────────────────────────────────────────────────
alter table public.profiles
  add column if not exists community_blocked_until  timestamptz,
  add column if not exists community_blocked_reason text;

comment on column public.profiles.community_blocked_until is
  'Null = not blocked. A future timestamp (or infinity) suspends community posting/commenting.';

-- ── 2. the test ────────────────────────────────────────────────────────────
create or replace function public.is_community_blocked(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(
    (select community_blocked_until > now() from public.profiles where id = p_user),
    false);
$$;

revoke execute on function public.is_community_blocked(uuid) from public, anon;
grant  execute on function public.is_community_blocked(uuid) to authenticated;

-- ── 3. the admin control ───────────────────────────────────────────────────
create or replace function public.admin_block_community_user(
  p_user    uuid,
  p_blocked boolean,
  p_reason  text        default null,
  p_until   timestamptz default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_before text;
begin
  if not public.is_super_admin() then
    raise exception 'not permitted';
  end if;
  if p_user is null then raise exception 'no user'; end if;

  select case when community_blocked_until > now() then 'blocked' else 'active' end
    into v_before from public.profiles where id = p_user;

  update public.profiles
     set community_blocked_until  = case when p_blocked
                                         then coalesce(p_until, 'infinity'::timestamptz)
                                         else null end,
         community_blocked_reason = case when p_blocked then p_reason else null end
   where id = p_user;

  insert into public.community_audit(actor_id, action, before_body, after_body, meta)
  values (auth.uid(),
          case when p_blocked then 'user_blocked' else 'user_unblocked' end,
          v_before,
          case when p_blocked then 'blocked' else 'active' end,
          jsonb_build_object('user_id', p_user, 'reason', p_reason, 'until', p_until));
end $$;

revoke execute on function public.admin_block_community_user(uuid, boolean, text, timestamptz) from public, anon;
grant  execute on function public.admin_block_community_user(uuid, boolean, text, timestamptz) to authenticated;

-- ── 4. enforce on commenting ───────────────────────────────────────────────
create or replace function public.add_community_comment(p_post uuid, p_body text, p_parent uuid default null::uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_id uuid; m record; e text; ph text;
  v_post public.community_posts;
  v_parent public.community_comments;
  v_actor text;
  v_target uuid;
  v_mention uuid;
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  if public.is_community_blocked(v_uid) then
    raise exception 'Your community access has been suspended';
  end if;
  if coalesce(trim(p_body),'') = '' then raise exception 'empty comment'; end if;

  select * into v_post from public.community_posts where id = p_post and status = 'published';
  if not found then raise exception 'post unavailable'; end if;
  if v_post.comments_locked and not public.is_super_admin() then
    raise exception 'Comments are closed on this post';
  end if;

  -- A reply must belong to the very post it is shown under (§2).
  if p_parent is not null then
    select * into v_parent from public.community_comments
     where id = p_parent and post_id = p_post and status = 'published';
    if not found then raise exception 'reply target not found on this post'; end if;
  end if;

  select * into m from public.community_mask(p_body);
  insert into public.community_comments(post_id, author_id, body, masked, parent_id)
  values (p_post, v_uid, m.o_masked,
          (coalesce(array_length(m.o_emails,1),0) + coalesce(array_length(m.o_phones,1),0)) > 0,
          p_parent)
  returning id into v_id;

  foreach e in array m.o_emails loop
    insert into public.community_contact_log(post_id, comment_id, author_id, kind, value, raw_text)
    values (p_post, v_id, v_uid, 'email', e, p_body);
  end loop;
  foreach ph in array m.o_phones loop
    insert into public.community_contact_log(post_id, comment_id, author_id, kind, value, raw_text)
    values (p_post, v_id, v_uid, 'phone', ph, p_body);
  end loop;

  select coalesce(full_name, 'A Jamin member') into v_actor from public.profiles where id = v_uid;

  -- §2: notify only the person actually being answered — the parent comment's
  -- author for a reply, otherwise the post's author. Never the whole community.
  v_target := case when p_parent is null then v_post.author_id else v_parent.author_id end;
  if v_target is not null and v_target <> v_uid then
    perform public.notify_user(v_target, 'community_reply',
      case when p_parent is null then v_actor || ' replied to your post'
           else v_actor || ' replied to your comment' end,
      left(m.o_masked, 140),
      jsonb_build_object('post_id', p_post, 'comment_id', v_id, 'parent_id', p_parent));
  end if;

  -- mentions, minus anyone already notified above
  foreach v_mention in array public.community_mentions(p_body) loop
    if v_mention <> v_uid and v_mention is distinct from v_target then
      perform public.notify_user(v_mention, 'community_mention',
        v_actor || ' mentioned you',
        left(m.o_masked, 140),
        jsonb_build_object('post_id', p_post, 'comment_id', v_id));
    end if;
  end loop;

  return v_id;
end $function$;

-- ── 5. enforce on posting ──────────────────────────────────────────────────
create or replace function public.create_community_post(p_body text default ''::text, p_media jsonb default '[]'::jsonb, p_links text[] default '{}'::text[])
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
  m record;
  e text; ph text;
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  if public.is_community_blocked(v_uid) then
    raise exception 'Your community access has been suspended';
  end if;
  if coalesce(trim(p_body),'') = '' and jsonb_array_length(coalesce(p_media,'[]'::jsonb)) = 0 then
    raise exception 'empty post';
  end if;
  select * into m from public.community_mask(p_body);
  insert into public.community_posts(author_id, body, media, links, masked)
  values (v_uid, m.o_masked, coalesce(p_media,'[]'::jsonb), coalesce(p_links,'{}'),
          (coalesce(array_length(m.o_emails,1),0) + coalesce(array_length(m.o_phones,1),0)) > 0)
  returning id into v_id;
  foreach e in array m.o_emails loop
    insert into public.community_contact_log(post_id, author_id, kind, value, raw_text)
    values (v_id, v_uid, 'email', e, p_body);
  end loop;
  foreach ph in array m.o_phones loop
    insert into public.community_contact_log(post_id, author_id, kind, value, raw_text)
    values (v_id, v_uid, 'phone', ph, p_body);
  end loop;
  return v_id;
end $function$;

-- ── 6. §11 grant hygiene ───────────────────────────────────────────────────
-- community_mask was revoked from `public` only in 0044, which does NOT stop
-- anon/authenticated — the classic Supabase grants trap. It is a pure text
-- helper, so this is hardening rather than a leak fix.
revoke execute on function public.community_mask(text) from anon;

-- otp_codes is guarded by RLS (enabled, zero policies), but it still carries
-- stray anon write grants that only RLS is holding back. Remove the grants so
-- a future permissive policy cannot silently open an OTP-forgery path.
revoke insert, update, delete on public.otp_codes from anon;
