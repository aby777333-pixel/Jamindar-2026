-- 0024 — Real-time platform synchronisation.
-- Additive & non-breaking: publication membership only, no schema or policy
-- changes. Existing behaviour is unaffected for anyone not subscribing.
--
-- Only `messages` and `message_threads` were in supabase_realtime, so admin
-- dashboards had no way to see platform activity without a manual refresh, and
-- admin edits did not propagate to already-open screens.
--
-- Realtime still enforces RLS per subscriber: the admin sees everything because
-- their policies allow it, a buyer only ever receives their own rows. Adding a
-- table here therefore widens *liveness*, never visibility.

do $$
declare
  t text;
  -- every table an admin must watch, plus the ones users need live updates on
  tables text[] := array[
    'activity_log',            -- the audit spine: every significant event
    'notifications',
    'properties',              -- admin edits / approvals reflect immediately
    'profiles',                -- registrations, role + block/activate changes
    'site_visits',
    'leads',
    'kyc_submissions',
    'property_submissions',
    'communication_events',    -- calls and channel opens
    'bookings',
    'commissions'
  ];
begin
  foreach t in array tables loop
    -- skip anything not present, so this migration stays safe to re-run
    if exists (select 1 from pg_tables where schemaname = 'public' and tablename = t) then
      if not exists (
        select 1 from pg_publication_tables
         where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
      ) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end if;
  end loop;
end $$;

-- UPDATE/DELETE events carry only the primary key unless the replica identity
-- is full. The admin feed needs the changed row, so widen it for the tables an
-- admin actually edits. (Cheap here — these are low-write tables.)
do $$
declare
  t text;
  tables text[] := array['properties', 'profiles', 'site_visits', 'leads', 'property_submissions'];
begin
  foreach t in array tables loop
    if exists (select 1 from pg_tables where schemaname = 'public' and tablename = t) then
      execute format('alter table public.%I replica identity full', t);
    end if;
  end loop;
end $$;
