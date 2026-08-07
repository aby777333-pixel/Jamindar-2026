-- 0080 — a rate limit for anonymous Jamindar callers.
--
-- `jamindar-voice` proxies Sarvam AI on a paid key held in app_secrets. Until
-- now its only caller was the signed-in app, so an unbounded call rate was a
-- theoretical problem. Putting Jamindar on the public website makes it a real
-- one: an anonymous visitor is one fetch() away from the same endpoint, and a
-- script could burn the Sarvam balance in an afternoon.
--
-- ⚠️ This limits ANONYMOUS callers only. A signed-in app user never reaches
-- the guarded path, so the app's behaviour is unchanged.
--
-- IPs are stored as a salted SHA-256, never in the clear: the counter needs to
-- tell two callers apart, which does not require knowing who they are.

create table if not exists public.ai_anon_usage (
  ip_hash      text        not null,
  window_start timestamptz not null,
  calls        integer     not null default 0,
  primary key (ip_hash, window_start)
);

comment on table public.ai_anon_usage is
  'Hourly call counters for unauthenticated Jamindar callers. Rows older than two days are pruned on write; nothing here identifies a person.';

alter table public.ai_anon_usage enable row level security;
-- No policies at all: only the service role (the edge function) touches this,
-- and the service role bypasses RLS. Anon and authenticated get nothing.

create or replace function public.ai_anon_take(
  p_hash       text,
  p_hour_limit int default 20,
  p_day_limit  int default 80
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_hour  timestamptz := date_trunc('hour', now());
  v_day   integer;
  v_calls integer;
begin
  if coalesce(trim(p_hash), '') = '' then
    -- No usable client identity. Fail CLOSED: an un-attributable caller is
    -- exactly the shape a scripted flood has.
    return jsonb_build_object('ok', false, 'scope', 'unidentified');
  end if;

  -- Cheap enough to run on every call, and it keeps the table from growing
  -- without bound now that there is no scheduled job for it.
  delete from ai_anon_usage where window_start < now() - interval '2 days';

  select coalesce(sum(calls), 0) into v_day
    from ai_anon_usage
   where ip_hash = p_hash and window_start > now() - interval '24 hours';

  if v_day >= p_day_limit then
    return jsonb_build_object('ok', false, 'scope', 'day');
  end if;

  -- Count first, judge second: the upsert is atomic, so two concurrent
  -- requests cannot both read "19" and both be allowed through.
  insert into ai_anon_usage (ip_hash, window_start, calls)
  values (p_hash, v_hour, 1)
  on conflict (ip_hash, window_start)
    do update set calls = ai_anon_usage.calls + 1
  returning calls into v_calls;

  if v_calls > p_hour_limit then
    return jsonb_build_object('ok', false, 'scope', 'hour');
  end if;

  return jsonb_build_object('ok', true, 'remaining', p_hour_limit - v_calls);
end;
$function$;

-- The edge function calls this with the service role. Nobody else may.
revoke execute on function public.ai_anon_take(text,int,int) from public;
revoke execute on function public.ai_anon_take(text,int,int) from anon, authenticated;
