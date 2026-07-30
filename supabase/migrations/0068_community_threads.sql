-- 0068 — Community: comment editing, threaded replies, pinned replies, Ask Admin.
--
-- Bug report (12): a posted comment had no edit or delete control at all.
-- Owner spec §1-§4 on top of that: replies must stay attached to their own
-- post, one reply can be pinned, and any member can ask the admin about a post.
--
-- Additive and backward compatible on purpose: `comments_list` stays a FLAT
-- array and only GAINS keys, so the APK already on people's phones keeps
-- working while the new build renders the same data as a thread.

-- ── columns ────────────────────────────────────────────────────────────────
alter table public.community_comments
  add column if not exists parent_id      uuid references public.community_comments(id) on delete cascade,
  add column if not exists edited_at      timestamptz,
  add column if not exists status         text not null default 'published',
  add column if not exists deleted_at     timestamptz,
  add column if not exists deleted_by     uuid references public.profiles(id) on delete set null,
  add column if not exists is_admin_reply boolean not null default false;

do $$ begin
  alter table public.community_comments
    add constraint community_comments_status_chk check (status in ('published','deleted'));
exception when duplicate_object then null; end $$;

create index if not exists community_comments_parent_idx on public.community_comments(parent_id);
create index if not exists community_comments_live_idx
  on public.community_comments(post_id) where status = 'published';

alter table public.community_posts
  add column if not exists pinned_comment_id uuid references public.community_comments(id) on delete set null,
  add column if not exists pinned_by         uuid references public.profiles(id) on delete set null,
  add column if not exists pinned_at         timestamptz,
  add column if not exists comments_locked   boolean not null default false;

-- Edit / delete / moderation history (owner spec §10: "deleted and edited
-- content history" + "moderation logs"). Admin-only reading.
create table if not exists public.community_audit(
  id          uuid primary key default gen_random_uuid(),
  post_id     uuid references public.community_posts(id) on delete set null,
  comment_id  uuid references public.community_comments(id) on delete set null,
  actor_id    uuid references public.profiles(id) on delete set null,
  action      text not null,
  before_body text,
  after_body  text,
  meta        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists community_audit_created_idx on public.community_audit(created_at desc);
create index if not exists community_audit_post_idx    on public.community_audit(post_id);

alter table public.community_audit enable row level security;
grant select on public.community_audit to authenticated;
drop policy if exists caudit_admin on public.community_audit;
create policy caudit_admin on public.community_audit for select to authenticated
  using (public.is_super_admin());

-- Ask Admin (§4). Contact details are captured for the admin's reply, and are
-- never returned by any public/member-facing RPC — see §11.
create table if not exists public.community_admin_questions(
  id           uuid primary key default gen_random_uuid(),
  post_id      uuid not null references public.community_posts(id) on delete cascade,
  post_title   text,
  asker_id     uuid references public.profiles(id) on delete set null,
  asker_name   text,
  asker_phone  text,
  asker_email  text,
  question     text not null,
  status       text not null default 'open' check (status in ('open','answered','closed')),
  answer_comment_id uuid references public.community_comments(id) on delete set null,
  answered_by  uuid references public.profiles(id) on delete set null,
  answered_at  timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists caq_status_idx on public.community_admin_questions(status, created_at desc);
create index if not exists caq_post_idx    on public.community_admin_questions(post_id);

alter table public.community_admin_questions enable row level security;
grant select on public.community_admin_questions to authenticated;
drop policy if exists caq_read on public.community_admin_questions;
create policy caq_read on public.community_admin_questions for select to authenticated
  using (asker_id = auth.uid() or public.is_super_admin());

-- ── mentions (§2: "someone mentions them") ─────────────────────────────────
-- Deliberately precise: an exact @MEMBERCODE or @Full Name. Fuzzy matching on
-- first names would notify the wrong people, which is the very thing §2 is
-- trying to stop.
create or replace function public.community_mentions(p_text text)
returns uuid[]
language sql stable security definer set search_path = public as $$
  with tokens as (
    select distinct upper(trim(both from (regexp_matches(coalesce(p_text,''), '@([A-Za-z0-9_][A-Za-z0-9_ .-]{1,40})', 'g'))[1])) as t
  )
  select coalesce(array_agg(distinct pr.id), '{}')
  from public.profiles pr
  join tokens on upper(pr.member_code) = tokens.t
                 or upper(coalesce(pr.full_name,'')) = tokens.t;
$$;
revoke execute on function public.community_mentions(text) from public, anon;

-- ── comments: create (now threaded) ────────────────────────────────────────
-- The old 2-argument function is dropped rather than overloaded: leaving both
-- would make add_community_comment(p_post, p_body) ambiguous and PostgREST
-- would refuse the call. The replacement defaults p_parent, so the build
-- already on people's phones keeps working unchanged.
drop function if exists public.add_community_comment(uuid, text);

create or replace function public.add_community_comment(
  p_post uuid, p_body text, p_parent uuid default null)
returns uuid
language plpgsql security definer set search_path = public as $$
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
end $$;

-- ── comments: edit (§1) ────────────────────────────────────────────────────
create or replace function public.edit_community_comment(p_id uuid, p_body text)
returns void
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); c public.community_comments; m record; e text; ph text;
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  if coalesce(trim(p_body),'') = '' then raise exception 'empty comment'; end if;

  select * into c from public.community_comments where id = p_id;
  if not found then raise exception 'comment not found'; end if;
  if c.status <> 'published' then raise exception 'comment not found'; end if;
  -- §1: only your own — admins may moderate anyone's.
  if c.author_id <> v_uid and not public.is_super_admin() then
    raise exception 'You can only edit your own comments';
  end if;

  select * into m from public.community_mask(p_body);

  -- UPDATE, never insert: editing must not create a duplicate comment (§1).
  update public.community_comments
     set body = m.o_masked,
         masked = (coalesce(array_length(m.o_emails,1),0) + coalesce(array_length(m.o_phones,1),0)) > 0,
         edited_at = now()
   where id = p_id;

  foreach e in array m.o_emails loop
    insert into public.community_contact_log(post_id, comment_id, author_id, kind, value, raw_text)
    values (c.post_id, p_id, v_uid, 'email', e, p_body);
  end loop;
  foreach ph in array m.o_phones loop
    insert into public.community_contact_log(post_id, comment_id, author_id, kind, value, raw_text)
    values (c.post_id, p_id, v_uid, 'phone', ph, p_body);
  end loop;

  insert into public.community_audit(post_id, comment_id, actor_id, action, before_body, after_body,
                                     meta)
  values (c.post_id, p_id, v_uid, 'comment_edit', c.body, m.o_masked,
          jsonb_build_object('by_admin', c.author_id <> v_uid));
end $$;

-- ── comments: delete (§1) ──────────────────────────────────────────────────
-- Soft delete. A comment that still has live replies leaves a tombstone so the
-- thread beneath it does not lose its anchor; a leaf comment disappears from
-- every list. Either way it stops counting toward the comment total.
create or replace function public.delete_community_comment(p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); c public.community_comments;
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  select * into c from public.community_comments where id = p_id;
  if not found then return; end if;
  if c.author_id <> v_uid and not public.is_super_admin() then
    raise exception 'You can only delete your own comments';
  end if;
  if c.status = 'deleted' then return; end if;

  update public.community_comments
     set status = 'deleted', deleted_at = now(), deleted_by = v_uid
   where id = p_id;

  -- a pinned reply that gets deleted must not stay pinned
  update public.community_posts
     set pinned_comment_id = null, pinned_by = null, pinned_at = null
   where pinned_comment_id = p_id;

  insert into public.community_audit(post_id, comment_id, actor_id, action, before_body, meta)
  values (c.post_id, p_id, v_uid, 'comment_delete', c.body,
          jsonb_build_object('by_admin', c.author_id <> v_uid));
end $$;

-- ── pinned reply (§3) ──────────────────────────────────────────────────────
create or replace function public.pin_community_comment(p_post uuid, p_comment uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_post public.community_posts;
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  select * into v_post from public.community_posts where id = p_post;
  if not found then raise exception 'post not found'; end if;
  if v_post.author_id <> v_uid and not public.is_super_admin() then
    raise exception 'Only the post owner or an admin can pin a reply';
  end if;
  if not exists (select 1 from public.community_comments
                  where id = p_comment and post_id = p_post and status = 'published') then
    raise exception 'That reply is not on this post';
  end if;

  -- one pinned reply per post; pinning a second one replaces the first (§3)
  update public.community_posts
     set pinned_comment_id = p_comment, pinned_by = v_uid, pinned_at = now()
   where id = p_post;

  insert into public.community_audit(post_id, comment_id, actor_id, action, meta)
  values (p_post, p_comment, v_uid, 'comment_pin',
          jsonb_build_object('replaced', v_post.pinned_comment_id));
end $$;

create or replace function public.unpin_community_comment(p_post uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_post public.community_posts;
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  select * into v_post from public.community_posts where id = p_post;
  if not found then return; end if;
  if v_post.author_id <> v_uid and not public.is_super_admin() then
    raise exception 'Only the post owner or an admin can unpin a reply';
  end if;
  update public.community_posts
     set pinned_comment_id = null, pinned_by = null, pinned_at = null
   where id = p_post;
  insert into public.community_audit(post_id, comment_id, actor_id, action)
  values (p_post, v_post.pinned_comment_id, v_uid, 'comment_unpin');
end $$;

-- ── Ask Admin (§4) ─────────────────────────────────────────────────────────
create or replace function public.ask_community_admin(p_post uuid, p_question text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); pr public.profiles; v_post public.community_posts; v_id uuid;
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  if coalesce(trim(p_question),'') = '' then raise exception 'empty question'; end if;
  select * into v_post from public.community_posts where id = p_post and status = 'published';
  if not found then raise exception 'post unavailable'; end if;

  -- simple flood guard (§11)
  if (select count(*) from public.community_admin_questions
       where asker_id = v_uid and created_at > now() - interval '10 minutes') >= 5 then
    raise exception 'Too many questions just now. Please try again shortly.';
  end if;

  select * into pr from public.profiles where id = v_uid;

  insert into public.community_admin_questions(
    post_id, post_title, asker_id, asker_name, asker_phone, asker_email, question)
  values (p_post, left(coalesce(nullif(trim(v_post.body),''), 'Community post'), 120),
          v_uid, coalesce(pr.full_name, 'Jamin member'), pr.mobile, pr.email, p_question)
  returning id into v_id;

  perform public.notify_admins('community_question',
    'Question from ' || coalesce(pr.full_name, 'a member'),
    left(p_question, 160),
    jsonb_build_object('post_id', p_post, 'question_id', v_id));

  return v_id;
end $$;

-- Admin answers: the answer appears beneath the same post as a normal comment
-- flagged as an admin reply, and can be pinned in the same breath (§4).
create or replace function public.admin_answer_community_question(
  p_question uuid, p_answer text, p_pin boolean default false)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); q public.community_admin_questions; v_comment uuid; m record;
begin
  if not public.is_super_admin() then raise exception 'not authorized'; end if;
  if coalesce(trim(p_answer),'') = '' then raise exception 'empty answer'; end if;
  select * into q from public.community_admin_questions where id = p_question;
  if not found then raise exception 'question not found'; end if;

  select * into m from public.community_mask(p_answer);
  insert into public.community_comments(post_id, author_id, body, masked, is_admin_reply)
  values (q.post_id, v_uid, m.o_masked,
          (coalesce(array_length(m.o_emails,1),0) + coalesce(array_length(m.o_phones,1),0)) > 0, true)
  returning id into v_comment;

  update public.community_admin_questions
     set status = 'answered', answer_comment_id = v_comment, answered_by = v_uid, answered_at = now()
   where id = p_question;

  if p_pin then
    update public.community_posts
       set pinned_comment_id = v_comment, pinned_by = v_uid, pinned_at = now()
     where id = q.post_id;
  end if;

  -- §2: an admin response notifies the person who asked, nobody else.
  if q.asker_id is not null and q.asker_id <> v_uid then
    perform public.notify_user(q.asker_id, 'community_admin_answer',
      'Jamin Admin answered your question',
      left(m.o_masked, 160),
      jsonb_build_object('post_id', q.post_id, 'comment_id', v_comment, 'question_id', p_question));
  end if;

  insert into public.community_audit(post_id, comment_id, actor_id, action, after_body, meta)
  values (q.post_id, v_comment, v_uid, 'admin_answer', m.o_masked,
          jsonb_build_object('question_id', p_question, 'pinned', p_pin));

  return v_comment;
end $$;

-- ── admin: lock / unlock comments on a post (§10) ──────────────────────────
create or replace function public.admin_lock_community_post(p_post uuid, p_locked boolean)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_super_admin() then raise exception 'not authorized'; end if;
  update public.community_posts set comments_locked = coalesce(p_locked, false) where id = p_post;
  insert into public.community_audit(post_id, actor_id, action, meta)
  values (p_post, auth.uid(), case when p_locked then 'post_lock' else 'post_unlock' end, '{}'::jsonb);
end $$;

-- ── feed & detail: deleted comments stop counting, threads carry context ───
create or replace function public.community_feed(p_limit int default 30, p_before timestamptz default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
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
      'comments_locked', cp.comments_locked
    ) as j
    from public.community_posts cp
    join public.profiles pr on pr.id = cp.author_id
    where cp.status = 'published' and (p_before is null or cp.created_at < p_before)
    order by cp.created_at desc
    limit least(greatest(coalesce(p_limit, 30), 1), 60)
  ) q;
  return v_out;
end $$;

create or replace function public.community_post_detail(p_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
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
    'comments_locked', cp.comments_locked,
    'pinned_comment_id', cp.pinned_comment_id,
    'pinned_by', (select coalesce(p2.full_name,'Jamin') from public.profiles p2 where p2.id = cp.pinned_by),
    'can_pin', (cp.author_id = v_uid or public.is_super_admin()),
    'is_admin', public.is_super_admin()
  ) into v_post
  from public.community_posts cp
  join public.profiles pr on pr.id = cp.author_id
  where cp.id = p_id and (cp.status = 'published' or cp.author_id = v_uid or public.is_super_admin());
  if v_post is null then return null; end if;

  -- Still a FLAT array (older builds render it as a plain list); the new build
  -- uses parent_id / reply_to_name to draw the thread.
  select coalesce(jsonb_agg(j), '[]'::jsonb) into v_comments from (
    select jsonb_build_object(
      'id', cc.id, 'body', case when cc.status = 'deleted' then '' else cc.body end,
      'masked', cc.masked, 'created_at', cc.created_at,
      'mine', cc.author_id = v_uid,
      'edited', cc.edited_at is not null,
      'edited_at', cc.edited_at,
      'deleted', cc.status = 'deleted',
      'parent_id', cc.parent_id,
      'is_admin_reply', cc.is_admin_reply,
      'can_manage', (cc.author_id = v_uid or public.is_super_admin()),
      'reply_to_name', (select coalesce(p3.full_name, 'Jamin member')
                          from public.community_comments pc
                          join public.profiles p3 on p3.id = pc.author_id
                         where pc.id = cc.parent_id),
      'author', jsonb_build_object(
        'name', case when cc.is_admin_reply then 'Jamin Admin'
                     else coalesce(pr.full_name, 'Jamin member') end,
        'member_code', pr.member_code, 'avatar_url', pr.avatar_url)
    ) as j
    from public.community_comments cc
    join public.profiles pr on pr.id = cc.author_id
    where cc.post_id = p_id
      and (cc.status = 'published'
           -- a deleted comment survives as a tombstone only while it still
           -- anchors live replies
           or exists (select 1 from public.community_comments r
                       where r.parent_id = cc.id and r.status = 'published'))
    order by cc.created_at asc
    limit 300
  ) q;
  return v_post || jsonb_build_object('comments_list', v_comments);
end $$;

-- ── grants ─────────────────────────────────────────────────────────────────
revoke execute on function public.add_community_comment(uuid, text, uuid) from public, anon;
revoke execute on function public.edit_community_comment(uuid, text) from public, anon;
revoke execute on function public.delete_community_comment(uuid) from public, anon;
revoke execute on function public.pin_community_comment(uuid, uuid) from public, anon;
revoke execute on function public.unpin_community_comment(uuid) from public, anon;
revoke execute on function public.ask_community_admin(uuid, text) from public, anon;
revoke execute on function public.admin_answer_community_question(uuid, text, boolean) from public, anon;
revoke execute on function public.admin_lock_community_post(uuid, boolean) from public, anon;

grant execute on function public.add_community_comment(uuid, text, uuid) to authenticated;
grant execute on function public.edit_community_comment(uuid, text) to authenticated;
grant execute on function public.delete_community_comment(uuid) to authenticated;
grant execute on function public.pin_community_comment(uuid, uuid) to authenticated;
grant execute on function public.unpin_community_comment(uuid) to authenticated;
grant execute on function public.ask_community_admin(uuid, text) to authenticated;
grant execute on function public.admin_answer_community_question(uuid, text, boolean) to authenticated;
grant execute on function public.admin_lock_community_post(uuid, boolean) to authenticated;
