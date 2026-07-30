-- 0069 — Public Community: shareable web pages, OTP-verified guests, leads.
--
-- Owner spec §5-§9. A person who is sent a community link must be able to read
-- the discussion without installing anything, and must be able to reply, ask
-- the admin or start an enquiry after nothing heavier than name + phone + email
-- with an OTP. They become a lead with an explicit, unticked consent box.
--
-- Security posture (§11): `anon` may call the two READ functions and nothing
-- else. Every guest write goes through the `community` edge function under the
-- service role, after it has checked the OTP and the guest session token — so
-- a guest identity cannot be forged from the browser.

-- ── who may see a post on the open web ─────────────────────────────────────
alter table public.community_posts
  add column if not exists visibility     text not null default 'public',
  add column if not exists public_enabled boolean not null default true;

do $$ begin
  alter table public.community_posts
    add constraint community_posts_visibility_chk check (visibility in ('public','members','private'));
exception when duplicate_object then null; end $$;

comment on column public.community_posts.visibility is
  'public = readable on the open web, members = signed-in app users only, private = author + admin.';
comment on column public.community_posts.public_enabled is
  'Admin kill switch for one post''s public link, independent of visibility (§10).';

-- ── verified public visitors ───────────────────────────────────────────────
create table if not exists public.community_guests(
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  phone             text not null,
  email             text,
  phone_verified_at timestamptz,
  -- §7 consent is explicit and never assumed
  consent_marketing boolean not null default false,
  consent_at        timestamptz,
  -- §9 attribution
  source_url        text,
  campaign          text,
  referral_code     text,
  promoter_id       uuid references public.profiles(id) on delete set null,
  first_post_id     uuid references public.community_posts(id) on delete set null,
  converted_user_id uuid references public.profiles(id) on delete set null,
  created_at        timestamptz not null default now(),
  last_seen_at      timestamptz not null default now()
);
create unique index if not exists community_guests_phone_idx on public.community_guests(phone);

-- Short-lived browser session handed out after OTP verification. Only the hash
-- is stored, so a leaked table cannot be replayed.
create table if not exists public.community_guest_sessions(
  id         uuid primary key default gen_random_uuid(),
  guest_id   uuid not null references public.community_guests(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists cgs_guest_idx on public.community_guest_sessions(guest_id);

-- §7/§10: everything a visitor did, for the admin's lead view.
create table if not exists public.community_guest_actions(
  id         uuid primary key default gen_random_uuid(),
  guest_id   uuid not null references public.community_guests(id) on delete cascade,
  post_id    uuid references public.community_posts(id) on delete set null,
  property_id uuid references public.properties(id) on delete set null,
  action     text not null,
  payload    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists cga_guest_idx   on public.community_guest_actions(guest_id, created_at desc);
create index if not exists cga_created_idx on public.community_guest_actions(created_at desc);

-- A guest's comment is a real community comment, authored by nobody in
-- profiles — so the author columns stay nullable-free by pointing at the guest.
alter table public.community_comments
  add column if not exists guest_id uuid references public.community_guests(id) on delete set null;
alter table public.community_comments alter column author_id drop not null;

-- ── leads gain the public-visitor fields (§7) ──────────────────────────────
alter table public.leads
  add column if not exists guest_id          uuid references public.community_guests(id) on delete set null,
  add column if not exists post_id           uuid references public.community_posts(id) on delete set null,
  add column if not exists name              text,
  add column if not exists phone             text,
  add column if not exists email             text,
  add column if not exists consent_marketing boolean not null default false,
  add column if not exists consent_at        timestamptz,
  add column if not exists source_url        text,
  add column if not exists campaign          text,
  add column if not exists actions           jsonb not null default '[]'::jsonb;

-- ── RLS: admin-only reading of visitor identities (§11) ────────────────────
alter table public.community_guests          enable row level security;
alter table public.community_guest_sessions  enable row level security;
alter table public.community_guest_actions   enable row level security;

grant select on public.community_guests        to authenticated;
grant select on public.community_guest_actions to authenticated;
revoke all on public.community_guests         from anon;
revoke all on public.community_guest_sessions from anon;
revoke all on public.community_guest_actions  from anon;

drop policy if exists cguests_admin on public.community_guests;
create policy cguests_admin on public.community_guests for select to authenticated
  using (public.is_super_admin());

drop policy if exists cgactions_admin on public.community_guest_actions;
create policy cgactions_admin on public.community_guest_actions for select to authenticated
  using (public.is_super_admin());

-- no policy at all on sessions: service role only, never readable by a client

-- ── public reads (the only thing `anon` may call) ──────────────────────────
-- Returns nothing that identifies a person beyond the display name they post
-- under: no phone, no email, no member code for guests.
create or replace function public.community_public_feed(
  p_limit int default 20, p_before timestamptz default null, p_q text default null)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_out jsonb;
begin
  select coalesce(jsonb_agg(j), '[]'::jsonb) into v_out from (
    select jsonb_build_object(
      'id', cp.id, 'body', cp.body, 'media', cp.media, 'links', cp.links,
      'created_at', cp.created_at,
      'author', jsonb_build_object('name', coalesce(pr.full_name, 'Jamin member'), 'role', pr.role),
      'likes',    (select count(*) from public.community_likes l where l.post_id = cp.id),
      'comments', (select count(*) from public.community_comments c
                    where c.post_id = cp.id and c.status = 'published')
    ) as j
    from public.community_posts cp
    join public.profiles pr on pr.id = cp.author_id
    where cp.status = 'published'
      and cp.visibility = 'public'
      and cp.public_enabled
      and (p_before is null or cp.created_at < p_before)
      and (p_q is null or trim(p_q) = '' or cp.body ilike '%' || trim(p_q) || '%')
    order by cp.created_at desc
    limit least(greatest(coalesce(p_limit, 20), 1), 50)
  ) q;
  return v_out;
end $$;

create or replace function public.community_public_post(p_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_post jsonb; v_comments jsonb;
begin
  select jsonb_build_object(
    'id', cp.id, 'body', cp.body, 'media', cp.media, 'links', cp.links,
    'created_at', cp.created_at,
    'comments_locked', cp.comments_locked,
    'pinned_comment_id', cp.pinned_comment_id,
    'pinned_by', (select coalesce(p2.full_name,'Jamin') from public.profiles p2 where p2.id = cp.pinned_by),
    'author', jsonb_build_object('name', coalesce(pr.full_name, 'Jamin member'), 'role', pr.role),
    'likes', (select count(*) from public.community_likes l where l.post_id = cp.id)
  ) into v_post
  from public.community_posts cp
  join public.profiles pr on pr.id = cp.author_id
  where cp.id = p_id and cp.status = 'published'
    and cp.visibility = 'public' and cp.public_enabled;
  if v_post is null then return null; end if;

  select coalesce(jsonb_agg(j), '[]'::jsonb) into v_comments from (
    select jsonb_build_object(
      'id', cc.id, 'body', cc.body, 'created_at', cc.created_at,
      'parent_id', cc.parent_id, 'is_admin_reply', cc.is_admin_reply,
      'edited', cc.edited_at is not null,
      'reply_to_name', (select coalesce(p3.full_name, g3.name, 'Jamin member')
                          from public.community_comments pc
                          left join public.profiles p3 on p3.id = pc.author_id
                          left join public.community_guests g3 on g3.id = pc.guest_id
                         where pc.id = cc.parent_id),
      'author', jsonb_build_object(
        'name', case when cc.is_admin_reply then 'Jamin Admin'
                     else coalesce(pr.full_name, g.name, 'Jamin member') end,
        'guest', cc.guest_id is not null)
    ) as j
    from public.community_comments cc
    left join public.profiles pr on pr.id = cc.author_id
    left join public.community_guests g on g.id = cc.guest_id
    where cc.post_id = p_id and cc.status = 'published'
    order by cc.created_at asc
    limit 200
  ) q;
  return v_post || jsonb_build_object('comments_list', v_comments);
end $$;

revoke execute on function public.community_public_feed(int, timestamptz, text) from public;
revoke execute on function public.community_public_post(uuid) from public;
grant execute on function public.community_public_feed(int, timestamptz, text) to anon, authenticated;
grant execute on function public.community_public_post(uuid) to anon, authenticated;

-- ── admin: visibility & public link switches (§10) ─────────────────────────
create or replace function public.admin_set_community_visibility(
  p_post uuid, p_visibility text, p_public_enabled boolean default null)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_super_admin() then raise exception 'not authorized'; end if;
  if p_visibility is not null and p_visibility not in ('public','members','private') then
    raise exception 'invalid visibility %', p_visibility;
  end if;
  update public.community_posts
     set visibility     = coalesce(p_visibility, visibility),
         public_enabled = coalesce(p_public_enabled, public_enabled)
   where id = p_post;
  insert into public.community_audit(post_id, actor_id, action, meta)
  values (p_post, auth.uid(), 'post_visibility',
          jsonb_build_object('visibility', p_visibility, 'public_enabled', p_public_enabled));
end $$;
revoke execute on function public.admin_set_community_visibility(uuid, text, boolean) from public, anon;
grant execute on function public.admin_set_community_visibility(uuid, text, boolean) to authenticated;

-- §10: assign a community lead to a promoter
create or replace function public.admin_assign_community_lead(p_lead uuid, p_promoter uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_super_admin() then raise exception 'not authorized'; end if;
  update public.leads set promoter_id = p_promoter, updated_at = now() where id = p_lead;
end $$;
revoke execute on function public.admin_assign_community_lead(uuid, uuid) from public, anon;
grant execute on function public.admin_assign_community_lead(uuid, uuid) to authenticated;

-- ── guest plumbing (service role only — never granted to anon) ─────────────
-- Upsert the visitor after their OTP checks out, and remember where they came
-- from. Attribution is written once: a later visit through somebody else's link
-- does not steal the lead from the first promoter (§9).
create or replace function public.community_guest_upsert(
  p_name text, p_phone text, p_email text,
  p_source_url text default null, p_campaign text default null,
  p_referral_code text default null, p_post uuid default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_promoter uuid;
begin
  if coalesce(trim(p_phone),'') = '' then raise exception 'phone required'; end if;

  if p_referral_code is not null and trim(p_referral_code) <> '' then
    select id into v_promoter from public.profiles
     where upper(referral_code) = upper(trim(p_referral_code))
        or upper(coalesce(partner_code,'')) = upper(trim(p_referral_code))
        or upper(coalesce(member_code,''))  = upper(trim(p_referral_code))
     limit 1;
  end if;

  insert into public.community_guests(name, phone, email, phone_verified_at,
                                      source_url, campaign, referral_code, promoter_id, first_post_id)
  values (coalesce(nullif(trim(p_name),''), 'Guest'), trim(p_phone), nullif(trim(p_email),''), now(),
          p_source_url, p_campaign, p_referral_code, v_promoter, p_post)
  on conflict (phone) do update
    set name              = coalesce(nullif(trim(excluded.name),''), community_guests.name),
        email             = coalesce(excluded.email, community_guests.email),
        phone_verified_at = now(),
        last_seen_at      = now(),
        -- first attribution wins
        source_url    = coalesce(community_guests.source_url, excluded.source_url),
        campaign      = coalesce(community_guests.campaign, excluded.campaign),
        referral_code = coalesce(community_guests.referral_code, excluded.referral_code),
        promoter_id   = coalesce(community_guests.promoter_id, excluded.promoter_id),
        first_post_id = coalesce(community_guests.first_post_id, excluded.first_post_id)
  returning id into v_id;

  return v_id;
end $$;

-- Record the consent decision verbatim, whichever way it went (§7, §11).
create or replace function public.community_guest_consent(
  p_guest uuid, p_consent boolean, p_source_url text default null)
returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.community_guests
     set consent_marketing = coalesce(p_consent, false),
         consent_at = case when p_consent then now() else consent_at end
   where id = p_guest;
  insert into public.community_guest_actions(guest_id, action, payload)
  values (p_guest, 'consent', jsonb_build_object('consent', p_consent, 'source_url', p_source_url));
end $$;

-- A verified guest's reply. Same masking as a member's comment, same
-- threading rules, and it notifies exactly the person being answered (§2).
create or replace function public.community_guest_comment(
  p_guest uuid, p_post uuid, p_body text, p_parent uuid default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid; m record; e text; ph text;
  v_post public.community_posts; v_parent public.community_comments;
  v_guest public.community_guests; v_target uuid;
begin
  select * into v_guest from public.community_guests where id = p_guest;
  if not found or v_guest.phone_verified_at is null then raise exception 'guest not verified'; end if;
  if coalesce(trim(p_body),'') = '' then raise exception 'empty comment'; end if;

  select * into v_post from public.community_posts
   where id = p_post and status = 'published' and visibility = 'public' and public_enabled;
  if not found then raise exception 'post unavailable'; end if;
  if v_post.comments_locked then raise exception 'Comments are closed on this post'; end if;

  if p_parent is not null then
    select * into v_parent from public.community_comments
     where id = p_parent and post_id = p_post and status = 'published';
    if not found then raise exception 'reply target not found on this post'; end if;
  end if;

  -- flood guard (§11)
  if (select count(*) from public.community_comments
       where guest_id = p_guest and created_at > now() - interval '10 minutes') >= 10 then
    raise exception 'Too many replies just now. Please try again shortly.';
  end if;

  select * into m from public.community_mask(p_body);
  insert into public.community_comments(post_id, author_id, guest_id, body, masked, parent_id)
  values (p_post, null, p_guest, m.o_masked,
          (coalesce(array_length(m.o_emails,1),0) + coalesce(array_length(m.o_phones,1),0)) > 0, p_parent)
  returning id into v_id;

  foreach e in array m.o_emails loop
    insert into public.community_contact_log(post_id, comment_id, kind, value, raw_text)
    values (p_post, v_id, 'email', e, p_body);
  end loop;
  foreach ph in array m.o_phones loop
    insert into public.community_contact_log(post_id, comment_id, kind, value, raw_text)
    values (p_post, v_id, 'phone', ph, p_body);
  end loop;

  v_target := case when p_parent is null then v_post.author_id else v_parent.author_id end;
  if v_target is not null then
    perform public.notify_user(v_target, 'community_reply',
      v_guest.name || ' replied to your ' || case when p_parent is null then 'post' else 'comment' end,
      left(m.o_masked, 140),
      jsonb_build_object('post_id', p_post, 'comment_id', v_id, 'guest', true));
  end if;

  insert into public.community_guest_actions(guest_id, post_id, action, payload)
  values (p_guest, p_post, 'reply', jsonb_build_object('comment_id', v_id));

  return v_id;
end $$;

-- A guest question to the admin, and a guest enquiry / interest / callback.
create or replace function public.community_guest_ask(p_guest uuid, p_post uuid, p_question text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare g public.community_guests; v_post public.community_posts; v_id uuid;
begin
  select * into g from public.community_guests where id = p_guest;
  if not found or g.phone_verified_at is null then raise exception 'guest not verified'; end if;
  if coalesce(trim(p_question),'') = '' then raise exception 'empty question'; end if;
  select * into v_post from public.community_posts where id = p_post and status = 'published';
  if not found then raise exception 'post unavailable'; end if;

  if (select count(*) from public.community_admin_questions
       where asker_phone = g.phone and created_at > now() - interval '10 minutes') >= 5 then
    raise exception 'Too many questions just now. Please try again shortly.';
  end if;

  insert into public.community_admin_questions(
    post_id, post_title, asker_id, asker_name, asker_phone, asker_email, question)
  values (p_post, left(coalesce(nullif(trim(v_post.body),''), 'Community post'), 120),
          null, g.name, g.phone, g.email, p_question)
  returning id into v_id;

  perform public.notify_admins('community_question',
    'Question from ' || g.name || ' (public visitor)',
    left(p_question, 160),
    jsonb_build_object('post_id', p_post, 'question_id', v_id, 'guest_id', p_guest));

  insert into public.community_guest_actions(guest_id, post_id, action, payload)
  values (p_guest, p_post, 'ask_admin', jsonb_build_object('question_id', v_id));

  return v_id;
end $$;

-- §7/§8: turn the visitor into a lead. Consent only controls marketing — an
-- enquiry is still recorded and still reaches the team without it.
create or replace function public.community_guest_lead(
  p_guest uuid, p_post uuid, p_action text, p_message text default null,
  p_property uuid default null, p_source_url text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare g public.community_guests; v_lead uuid;
begin
  select * into g from public.community_guests where id = p_guest;
  if not found or g.phone_verified_at is null then raise exception 'guest not verified'; end if;

  insert into public.community_guest_actions(guest_id, post_id, property_id, action, payload)
  values (p_guest, p_post, p_property, p_action,
          jsonb_build_object('message', p_message, 'source_url', p_source_url));

  -- one open lead per visitor; later actions append to it rather than piling up
  select id into v_lead from public.leads
   where guest_id = p_guest and status in ('new','contacted','qualified')
   order by created_at desc limit 1;

  if v_lead is null then
    insert into public.leads(guest_id, post_id, property_id, promoter_id, source, status,
                             name, phone, email, consent_marketing, consent_at,
                             source_url, campaign, referral_code, notes, actions)
    values (p_guest, p_post, p_property, g.promoter_id, 'community_public', 'new',
            g.name, g.phone, g.email, g.consent_marketing, g.consent_at,
            coalesce(p_source_url, g.source_url), g.campaign, g.referral_code, p_message,
            jsonb_build_array(jsonb_build_object('action', p_action, 'at', now(), 'message', p_message)))
    returning id into v_lead;
  else
    update public.leads
       set actions = actions || jsonb_build_object('action', p_action, 'at', now(), 'message', p_message),
           property_id = coalesce(property_id, p_property),
           post_id = coalesce(post_id, p_post),
           consent_marketing = g.consent_marketing,
           consent_at = coalesce(consent_at, g.consent_at),
           notes = coalesce(nullif(p_message,''), notes),
           updated_at = now()
     where id = v_lead;
  end if;

  perform public.notify_admins('community_lead',
    g.name || ' — ' || replace(p_action, '_', ' '),
    coalesce(left(p_message, 160), 'From the public community page'),
    jsonb_build_object('lead_id', v_lead, 'guest_id', p_guest, 'post_id', p_post));

  if g.promoter_id is not null then
    perform public.notify_user(g.promoter_id, 'community_lead',
      'New enquiry from ' || g.name,
      coalesce(left(p_message, 160), 'From a community link you shared'),
      jsonb_build_object('lead_id', v_lead, 'post_id', p_post));
  end if;

  return v_lead;
end $$;

-- ── the app's own post detail must show guest replies too ─────────────────
-- 0068's version inner-joined profiles, which was right when every comment had
-- a member behind it. A guest reply has author_id = null, so that join would
-- silently drop it from the thread members see. Left join both sides instead.
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
end $$;

-- Guest plumbing is service-role only: revoke from every client role.
revoke execute on function public.community_guest_upsert(text, text, text, text, text, text, uuid) from public, anon, authenticated;
revoke execute on function public.community_guest_consent(uuid, boolean, text) from public, anon, authenticated;
revoke execute on function public.community_guest_comment(uuid, uuid, text, uuid) from public, anon, authenticated;
revoke execute on function public.community_guest_ask(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.community_guest_lead(uuid, uuid, text, text, uuid, text) from public, anon, authenticated;
