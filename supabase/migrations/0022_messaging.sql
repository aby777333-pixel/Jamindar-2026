-- 0022 — Secure in-app messaging.
-- Additive & non-breaking. Nothing here touches the existing Jamindar AI
-- `conversations` / `conversation_messages` tables — those stay the assistant's
-- transcript. This is person-to-person messaging.
--
-- Threads are membership-scoped. Membership is checked through a SECURITY
-- DEFINER helper so the policies never recurse (threads → participants →
-- threads), which is the same trap `is_super_admin()` was written to avoid.
--
-- Read receipts use `thread_participants.last_read_at` rather than a row per
-- (message, reader): one write per thread-open instead of one per message.

-- ── 1. tables ──────────────────────────────────────────────────────────────
create table if not exists public.message_threads (
  id                   uuid primary key default gen_random_uuid(),
  subject              text,
  property_id          uuid references public.properties(id) on delete set null,
  visit_id             uuid references public.site_visits(id) on delete set null,
  created_by           uuid references public.profiles(id) on delete set null,
  last_message_at      timestamptz not null default now(),
  last_message_preview text,
  is_locked            boolean not null default false,
  created_at           timestamptz not null default now()
);

create table if not exists public.thread_participants (
  thread_id    uuid not null references public.message_threads(id) on delete cascade,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  last_read_at timestamptz,
  joined_at    timestamptz not null default now(),
  primary key (thread_id, user_id)
);

create table if not exists public.messages (
  id              uuid primary key default gen_random_uuid(),
  thread_id       uuid not null references public.message_threads(id) on delete cascade,
  sender_id       uuid not null references public.profiles(id) on delete cascade,
  kind            text not null default 'text',
  body            text,
  attachment_url  text,
  attachment_name text,
  attachment_mime text,
  property_id     uuid references public.properties(id) on delete set null,
  created_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  deleted_by      uuid references public.profiles(id) on delete set null
);

do $$ begin
  alter table public.messages add constraint messages_kind_chk
    check (kind in ('text','image','file','property','system'));
exception when duplicate_object then null; end $$;

create index if not exists idx_threads_last on public.message_threads(last_message_at desc);
create index if not exists idx_tp_user on public.thread_participants(user_id);
create index if not exists idx_messages_thread on public.messages(thread_id, created_at desc);
create index if not exists idx_messages_body on public.messages using gin (to_tsvector('simple', coalesce(body, '')));

-- ── 2. membership helper (definer → no policy recursion) ───────────────────
create or replace function public.is_thread_member(p_thread uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.thread_participants tp
     where tp.thread_id = p_thread and tp.user_id = auth.uid()
  );
$$;

revoke execute on function public.is_thread_member(uuid) from public;
grant  execute on function public.is_thread_member(uuid) to authenticated;

-- safe text variant for storage policies (folder names are text, may be junk)
create or replace function public.is_thread_member_text(p_thread text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_thread !~ '^[0-9a-fA-F-]{36}$' then return false; end if;
  return public.is_thread_member(p_thread::uuid);
exception when others then
  return false;
end $$;

revoke execute on function public.is_thread_member_text(text) from public;
grant  execute on function public.is_thread_member_text(text) to authenticated;

-- ── 3. RLS ─────────────────────────────────────────────────────────────────
alter table public.message_threads enable row level security;
alter table public.thread_participants enable row level security;
alter table public.messages enable row level security;

drop policy if exists mt_read on public.message_threads;
create policy mt_read on public.message_threads for select to authenticated
  using (public.is_thread_member(id)
         or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin'));

drop policy if exists tp_read on public.thread_participants;
create policy tp_read on public.thread_participants for select to authenticated
  using (public.is_thread_member(thread_id)
         or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin'));

-- members may only update their own participant row (that is the read receipt)
drop policy if exists tp_update_own on public.thread_participants;
create policy tp_update_own on public.thread_participants for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists msg_read on public.messages;
create policy msg_read on public.messages for select to authenticated
  using (public.is_thread_member(thread_id)
         or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin'));

-- There is deliberately NO insert/update policy on messages or message_threads.
-- Every write goes through send_message / open_thread / admin_* so that the
-- notification fan-out, the communication log and the audit entry can never be
-- bypassed by writing the table directly.
grant select on public.message_threads to authenticated;
grant select, update on public.thread_participants to authenticated;
grant select on public.messages to authenticated;

-- ── 4. attachments bucket ──────────────────────────────────────────────────
insert into storage.buckets (id, name, public) values ('chat', 'chat', false)
on conflict (id) do nothing;

-- path convention: chat/<thread_id>/<user_id>/<filename>
drop policy if exists chat_member_read on storage.objects;
create policy chat_member_read on storage.objects for select to authenticated
  using (bucket_id = 'chat' and public.is_thread_member_text((storage.foldername(name))[1]));

drop policy if exists chat_member_write on storage.objects;
create policy chat_member_write on storage.objects for insert to authenticated
  with check (
    bucket_id = 'chat'
    and public.is_thread_member_text((storage.foldername(name))[1])
    and (storage.foldername(name))[2] = auth.uid()::text
  );

-- ── 5. RPCs ────────────────────────────────────────────────────────────────

-- Open (or reuse) a 1:1 thread with a counterpart the caller may contact.
-- Routing is enforced by resolve_contact (0021): a buyer can only ever land on
-- their assigned partner, so this cannot be used to message arbitrary users.
create or replace function public.open_thread(
  p_counterpart uuid,
  p_property_id uuid default null,
  p_visit_id    uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_allowed jsonb;
  v_target  uuid;
  v_thread  uuid;
  v_title   text;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if p_counterpart is null then raise exception 'no recipient'; end if;
  if p_counterpart = v_uid then raise exception 'cannot message yourself'; end if;

  -- the routing brain decides who this user is actually allowed to reach
  v_allowed := public.resolve_contact(p_property_id, p_counterpart);
  v_target := nullif(v_allowed->>'id', '')::uuid;
  if v_target is null or v_target <> p_counterpart then
    raise exception 'not authorized to message this person';
  end if;

  -- reuse an existing 1:1 thread for the same property
  select t.id into v_thread
    from public.message_threads t
   where coalesce(t.property_id::text, '') = coalesce(p_property_id::text, '')
     and exists (select 1 from public.thread_participants a where a.thread_id = t.id and a.user_id = v_uid)
     and exists (select 1 from public.thread_participants b where b.thread_id = t.id and b.user_id = v_target)
     and (select count(*) from public.thread_participants c where c.thread_id = t.id) = 2
   order by t.last_message_at desc
   limit 1;

  if v_thread is not null then return v_thread; end if;

  select title into v_title from public.properties where id = p_property_id;

  insert into public.message_threads (subject, property_id, visit_id, created_by)
  values (v_title, p_property_id, p_visit_id, v_uid)
  returning id into v_thread;

  insert into public.thread_participants (thread_id, user_id, last_read_at)
  values (v_thread, v_uid, now()), (v_thread, v_target, null)
  on conflict do nothing;

  insert into public.activity_log (user_id, event_type, meta)
  values (v_uid, 'chat_thread_opened',
          jsonb_build_object('thread_id', v_thread, 'counterpart', v_target, 'property_id', p_property_id));

  return v_thread;
end $$;

revoke execute on function public.open_thread(uuid, uuid, uuid) from public;
grant  execute on function public.open_thread(uuid, uuid, uuid) to authenticated;

-- Post a message: writes the row, refreshes the thread preview, notifies the
-- other participants, and logs the communication event.
create or replace function public.send_message(
  p_thread_id       uuid,
  p_body            text default null,
  p_kind            text default 'text',
  p_attachment_url  text default null,
  p_attachment_name text default null,
  p_attachment_mime text default null,
  p_property_id     uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_msg     uuid;
  v_sender  text;
  v_preview text;
  r         record;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if not public.is_thread_member(p_thread_id) then raise exception 'not authorized'; end if;
  if exists (select 1 from public.message_threads t where t.id = p_thread_id and t.is_locked) then
    raise exception 'this conversation has been closed by the Jamin team';
  end if;
  if p_kind not in ('text','image','file','property','system') then raise exception 'invalid kind'; end if;
  if coalesce(trim(p_body), '') = '' and p_attachment_url is null and p_property_id is null then
    raise exception 'nothing to send';
  end if;

  insert into public.messages (thread_id, sender_id, kind, body, attachment_url, attachment_name, attachment_mime, property_id)
  values (p_thread_id, v_uid, p_kind, p_body, p_attachment_url, p_attachment_name, p_attachment_mime, p_property_id)
  returning id into v_msg;

  v_preview := case p_kind
                 when 'image'    then '📷 Photo'
                 when 'file'     then '📎 ' || coalesce(p_attachment_name, 'Attachment')
                 when 'property' then '🏡 Property'
                 else left(coalesce(p_body, ''), 120)
               end;

  update public.message_threads
     set last_message_at = now(), last_message_preview = v_preview
   where id = p_thread_id;

  -- sender has by definition read their own message
  update public.thread_participants
     set last_read_at = now()
   where thread_id = p_thread_id and user_id = v_uid;

  select full_name into v_sender from public.profiles where id = v_uid;

  for r in select user_id from public.thread_participants where thread_id = p_thread_id and user_id <> v_uid loop
    perform public.notify_user(r.user_id, 'message',
      coalesce(v_sender, 'New message'), v_preview,
      jsonb_build_object('thread_id', p_thread_id, 'message_id', v_msg));
    perform public.log_communication('in_app_chat', r.user_id, p_property_id, null, null, null, 'thread', 'initiated',
      jsonb_build_object('thread_id', p_thread_id, 'message_id', v_msg));
  end loop;

  return v_msg;
end $$;

revoke execute on function public.send_message(uuid, text, text, text, text, text, uuid) from public;
grant  execute on function public.send_message(uuid, text, text, text, text, text, uuid) to authenticated;

-- Mark a thread read (drives read receipts + the unread badge).
create or replace function public.mark_thread_read(p_thread_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  update public.thread_participants
     set last_read_at = now()
   where thread_id = p_thread_id and user_id = auth.uid();
end $$;

revoke execute on function public.mark_thread_read(uuid) from public;
grant  execute on function public.mark_thread_read(uuid) to authenticated;

-- Unread count across every thread — the tab badge.
create or replace function public.my_unread_messages()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(count(m.id), 0)::int
    from public.thread_participants tp
    join public.messages m on m.thread_id = tp.thread_id
   where tp.user_id = auth.uid()
     and m.sender_id <> auth.uid()
     and m.deleted_at is null
     and (tp.last_read_at is null or m.created_at > tp.last_read_at);
$$;

revoke execute on function public.my_unread_messages() from public;
grant  execute on function public.my_unread_messages() to authenticated;

-- Moderation: an admin may close a thread or retract a message.
create or replace function public.admin_moderate_thread(
  p_thread_id uuid,
  p_locked    boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin') then
    raise exception 'not authorized';
  end if;
  update public.message_threads set is_locked = p_locked where id = p_thread_id;
  insert into public.activity_log (user_id, event_type, meta)
  values (auth.uid(), 'chat_thread_moderated',
          jsonb_build_object('thread_id', p_thread_id, 'locked', p_locked));
end $$;

revoke execute on function public.admin_moderate_thread(uuid, boolean) from public;
grant  execute on function public.admin_moderate_thread(uuid, boolean) to authenticated;

create or replace function public.admin_delete_message(p_message_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin') then
    raise exception 'not authorized';
  end if;
  update public.messages set deleted_at = now(), deleted_by = auth.uid() where id = p_message_id;
  insert into public.activity_log (user_id, event_type, meta)
  values (auth.uid(), 'chat_message_removed', jsonb_build_object('message_id', p_message_id));
end $$;

revoke execute on function public.admin_delete_message(uuid) from public;
grant  execute on function public.admin_delete_message(uuid) to authenticated;

-- ── 6. realtime ────────────────────────────────────────────────────────────
do $$ begin
  alter publication supabase_realtime add table public.messages;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table public.message_threads;
exception when duplicate_object then null; end $$;
