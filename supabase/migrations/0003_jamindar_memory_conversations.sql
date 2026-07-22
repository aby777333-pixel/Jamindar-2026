-- ============================================================
-- Increment 2: Jamindar memory + conversation persistence
-- Purely additive. Does not touch existing tables.
-- ============================================================

create table if not exists public.jamindar_memory (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  call_name text,
  language text default 'en-IN',
  is_first_time_buyer boolean,
  residency text,               -- 'resident' | 'nri'
  occupation text,
  buying_with text,             -- 'alone' | 'family'
  decision_maker text,
  heard_from text,
  prefs jsonb not null default '{}'::jsonb,        -- buyer preference summary
  voice_prefs jsonb not null default '{}'::jsonb,  -- {speaker,speed,volume,style,readAloud,autoSummarize,spokenConfirm}
  notes text,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text,
  language text default 'en-IN',
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists idx_conversations_user on public.conversations(user_id, last_message_at desc);

create table if not exists public.conversation_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null,           -- 'user' | 'assistant'
  content text not null,        -- original language
  content_en text,              -- English translation (admin backend)
  language text,
  intent text,
  created_at timestamptz not null default now()
);
create index if not exists idx_convmsg_conversation on public.conversation_messages(conversation_id, created_at);

alter table public.jamindar_memory       enable row level security;
alter table public.conversations         enable row level security;
alter table public.conversation_messages enable row level security;

create policy jm_owner on public.jamindar_memory for all
  using (user_id = auth.uid() or public.is_super_admin())
  with check (user_id = auth.uid() or public.is_super_admin());
create policy conv_owner on public.conversations for all
  using (user_id = auth.uid() or public.is_super_admin())
  with check (user_id = auth.uid() or public.is_super_admin());
create policy convmsg_owner on public.conversation_messages for all
  using (user_id = auth.uid() or public.is_super_admin())
  with check (user_id = auth.uid() or public.is_super_admin());

grant select, insert, update, delete on
  public.jamindar_memory, public.conversations, public.conversation_messages
  to authenticated;
