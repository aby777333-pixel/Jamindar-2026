-- Service-role-only secrets (Sarvam/Jamindar key, SMS keys, etc.)
create table if not exists public.app_secrets (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);
alter table public.app_secrets enable row level security;
-- No policies -> no anon/authenticated access. Service role bypasses RLS.
revoke all on public.app_secrets from anon, authenticated;

-- Set the real value out-of-band (Dashboard SQL editor / MCP), NOT in version control:
--   insert into public.app_secrets(key, value) values ('SARVAM_API_KEY', '<your-key>')
--   on conflict (key) do update set value = excluded.value, updated_at = now();
insert into public.app_secrets(key, value) values ('SARVAM_API_KEY', 'REPLACE_ME')
on conflict (key) do nothing;
