-- 0044 — Jamin Community (owner spec 2026-07-28). Additive & non-breaking.
--
-- Anyone signed in can post text, links, photos, videos, PDFs, files and
-- voice notes. Emails & phone numbers in TEXT are masked server-side before
-- the post ever exists publicly (posting goes through SECURITY DEFINER RPCs —
-- direct inserts are not granted, so masking cannot be bypassed), and every
-- detected contact is recorded verbatim in an admin-only log together with
-- the full raw text. Likes, comments, reports, admin hide/restore included.
-- NOTE: contacts inside images/videos need OCR — not covered here; the admin
-- log + report button are the safety net for media.

-- ── tables ─────────────────────────────────────────────────────────────────
create table if not exists public.community_posts(
  id         uuid primary key default gen_random_uuid(),
  author_id  uuid not null references public.profiles(id) on delete cascade,
  body       text not null default '',          -- PUBLIC (masked) text
  media      jsonb not null default '[]'::jsonb, -- [{type:'image|video|pdf|audio|file', url, name}]
  links      text[] not null default '{}',
  masked     boolean not null default false,     -- true when contacts were hidden
  status     text not null default 'published' check (status in ('published','hidden','removed')),
  created_at timestamptz not null default now()
);
create index if not exists community_posts_created_idx on public.community_posts(created_at desc);
create index if not exists community_posts_author_idx  on public.community_posts(author_id);

create table if not exists public.community_comments(
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.community_posts(id) on delete cascade,
  author_id  uuid not null references public.profiles(id) on delete cascade,
  body       text not null,                      -- masked
  masked     boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists community_comments_post_idx on public.community_comments(post_id);

create table if not exists public.community_likes(
  post_id    uuid not null references public.community_posts(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

-- Admin-only: every email/phone found in community text, recorded verbatim
-- with the full raw text it came from ("clearly recorded in the admin").
create table if not exists public.community_contact_log(
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid references public.community_posts(id) on delete set null,
  comment_id uuid references public.community_comments(id) on delete set null,
  author_id  uuid references public.profiles(id) on delete set null,
  kind       text not null check (kind in ('email','phone')),
  value      text not null,
  raw_text   text,
  created_at timestamptz not null default now()
);
create index if not exists community_contact_log_created_idx on public.community_contact_log(created_at desc);

create table if not exists public.community_reports(
  id          uuid primary key default gen_random_uuid(),
  post_id     uuid not null references public.community_posts(id) on delete cascade,
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reason      text,
  status      text not null default 'open' check (status in ('open','resolved')),
  created_at  timestamptz not null default now()
);

-- ── RLS ────────────────────────────────────────────────────────────────────
alter table public.community_posts       enable row level security;
alter table public.community_comments    enable row level security;
alter table public.community_likes       enable row level security;
alter table public.community_contact_log enable row level security;
alter table public.community_reports     enable row level security;

grant select on public.community_posts, public.community_comments to authenticated;
grant select, insert, delete on public.community_likes to authenticated;
grant select, insert on public.community_reports to authenticated;
grant select on public.community_contact_log to authenticated; -- filtered to admin by policy

drop policy if exists cposts_read on public.community_posts;
create policy cposts_read on public.community_posts for select to authenticated
  using (status = 'published' or author_id = auth.uid() or public.is_super_admin());

drop policy if exists ccomments_read on public.community_comments;
create policy ccomments_read on public.community_comments for select to authenticated
  using (exists (select 1 from public.community_posts p where p.id = post_id
                 and (p.status = 'published' or p.author_id = auth.uid() or public.is_super_admin())));

drop policy if exists clikes_read on public.community_likes;
create policy clikes_read on public.community_likes for select to authenticated using (true);
drop policy if exists clikes_ins on public.community_likes;
create policy clikes_ins on public.community_likes for insert to authenticated with check (user_id = auth.uid());
drop policy if exists clikes_del on public.community_likes;
create policy clikes_del on public.community_likes for delete to authenticated using (user_id = auth.uid());

drop policy if exists clog_admin on public.community_contact_log;
create policy clog_admin on public.community_contact_log for select to authenticated
  using (public.is_super_admin());

drop policy if exists creports_ins on public.community_reports;
create policy creports_ins on public.community_reports for insert to authenticated
  with check (reporter_id = auth.uid());
drop policy if exists creports_read on public.community_reports;
create policy creports_read on public.community_reports for select to authenticated
  using (reporter_id = auth.uid() or public.is_super_admin());

-- ── contact masking (the enforcement core) ────────────────────────────────
-- Extract emails + Indian phone numbers, then mask them in the public text.
create or replace function public.community_mask(p_text text,
  out o_masked text, out o_emails text[], out o_phones text[])
language plpgsql immutable as $$
declare
  v_email  text := '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}';
  v_mobile text := '(\+?91[-. ]?|0)?[6-9][0-9]{4}[-. ]?[0-9]{5}';
  v_landline text := '0[0-9]{2,4}[-. ][0-9]{6,8}';
  v_longnum text := '[0-9]{10,12}';
begin
  o_masked := coalesce(p_text, '');
  o_emails := coalesce(array(select distinct (regexp_matches(o_masked, '(' || v_email || ')', 'g'))[1]), '{}');
  -- wrap in a group so regexp_matches always captures the WHOLE match
  o_phones := coalesce(array(select distinct (regexp_matches(o_masked, '(' || v_mobile || ')', 'g'))[1]), '{}');
  o_phones := o_phones || coalesce(array(
    select distinct (regexp_matches(o_masked, '(' || v_landline || ')', 'g'))[1]
    except select unnest(o_phones)), '{}');
  o_phones := o_phones || coalesce(array(
    select distinct (regexp_matches(o_masked, '(' || v_longnum || ')', 'g'))[1]
    except select unnest(o_phones)), '{}');
  o_masked := regexp_replace(o_masked, v_email,  '[contact hidden]', 'g');
  o_masked := regexp_replace(o_masked, v_mobile, '[contact hidden]', 'g');
  o_masked := regexp_replace(o_masked, v_landline, '[contact hidden]', 'g');
  o_masked := regexp_replace(o_masked, v_longnum, '[contact hidden]', 'g');
end $$;

-- ── RPCs (the only write path for posts & comments) ───────────────────────
create or replace function public.create_community_post(
  p_body text default '', p_media jsonb default '[]'::jsonb, p_links text[] default '{}'
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
  m record;
  e text; ph text;
begin
  if v_uid is null then raise exception 'not signed in'; end if;
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
end $$;

create or replace function public.add_community_comment(p_post uuid, p_body text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
  m record;
  e text; ph text;
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  if coalesce(trim(p_body),'') = '' then raise exception 'empty comment'; end if;
  if not exists (select 1 from public.community_posts where id = p_post and status = 'published') then
    raise exception 'post unavailable';
  end if;
  select * into m from public.community_mask(p_body);
  insert into public.community_comments(post_id, author_id, body, masked)
  values (p_post, v_uid, m.o_masked,
          (coalesce(array_length(m.o_emails,1),0) + coalesce(array_length(m.o_phones,1),0)) > 0)
  returning id into v_id;
  foreach e in array m.o_emails loop
    insert into public.community_contact_log(post_id, comment_id, author_id, kind, value, raw_text)
    values (p_post, v_id, v_uid, 'email', e, p_body);
  end loop;
  foreach ph in array m.o_phones loop
    insert into public.community_contact_log(post_id, comment_id, author_id, kind, value, raw_text)
    values (p_post, v_id, v_uid, 'phone', ph, p_body);
  end loop;
  return v_id;
end $$;

-- Author removes their own post; admin can hide/restore/remove any.
create or replace function public.remove_community_post(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.community_posts set status = 'removed'
   where id = p_id and (author_id = auth.uid() or public.is_super_admin());
end $$;

create or replace function public.admin_set_community_status(p_id uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_super_admin() then raise exception 'not authorized'; end if;
  if p_status not in ('published','hidden','removed') then raise exception 'invalid status'; end if;
  update public.community_posts set status = p_status where id = p_id;
end $$;

-- Feed & detail (SECURITY DEFINER so author names resolve despite profiles RLS).
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
      'comments', (select count(*) from public.community_comments c where c.post_id = cp.id),
      'liked', exists (select 1 from public.community_likes l where l.post_id = cp.id and l.user_id = v_uid),
      'mine', cp.author_id = v_uid
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
    'mine', cp.author_id = v_uid
  ) into v_post
  from public.community_posts cp
  join public.profiles pr on pr.id = cp.author_id
  where cp.id = p_id and (cp.status = 'published' or cp.author_id = v_uid or public.is_super_admin());
  if v_post is null then return null; end if;
  select coalesce(jsonb_agg(j), '[]'::jsonb) into v_comments from (
    select jsonb_build_object(
      'id', cc.id, 'body', cc.body, 'masked', cc.masked, 'created_at', cc.created_at,
      'mine', cc.author_id = v_uid,
      'author', jsonb_build_object('name', coalesce(pr.full_name, 'Jamin member'), 'member_code', pr.member_code, 'avatar_url', pr.avatar_url)
    ) as j
    from public.community_comments cc
    join public.profiles pr on pr.id = cc.author_id
    where cc.post_id = p_id
    order by cc.created_at asc
    limit 200
  ) q;
  return v_post || jsonb_build_object('comments_list', v_comments);
end $$;

revoke execute on function public.community_mask(text) from public;
revoke execute on function public.create_community_post(text, jsonb, text[]) from public, anon;
revoke execute on function public.add_community_comment(uuid, text) from public, anon;
revoke execute on function public.remove_community_post(uuid) from public, anon;
revoke execute on function public.admin_set_community_status(uuid, text) from public, anon;
revoke execute on function public.community_feed(int, timestamptz) from public, anon;
revoke execute on function public.community_post_detail(uuid) from public, anon;
grant execute on function public.create_community_post(text, jsonb, text[]) to authenticated;
grant execute on function public.add_community_comment(uuid, text) to authenticated;
grant execute on function public.remove_community_post(uuid) to authenticated;
grant execute on function public.admin_set_community_status(uuid, text) to authenticated;
grant execute on function public.community_feed(int, timestamptz) to authenticated;
grant execute on function public.community_post_detail(uuid) to authenticated;

-- ── storage: public community bucket, own-folder writes ───────────────────
insert into storage.buckets (id, name, public) values ('community', 'community', true)
  on conflict (id) do nothing;

drop policy if exists "community read"       on storage.objects;
drop policy if exists "community insert own" on storage.objects;
create policy "community read" on storage.objects for select using (bucket_id = 'community');
create policy "community insert own" on storage.objects for insert to authenticated
  with check (bucket_id = 'community' and (storage.foldername(name))[1] = auth.uid()::text);

-- (applied as 0044c) admins resolve community reports
grant update on public.community_reports to authenticated;
drop policy if exists creports_admin_upd on public.community_reports;
create policy creports_admin_upd on public.community_reports for update to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());
