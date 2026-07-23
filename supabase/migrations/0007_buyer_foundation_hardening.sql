-- 0007_buyer_foundation_hardening.sql
-- Resolve the security-advisor warnings introduced by 0006. All non-breaking.
--   • pin search_path on the new trigger function
--   • acquisition writes go through capture_acquisition() only (no "always true" policy)
--   • referral_events inserts must be by a party to the event
--   • SECURITY DEFINER RPCs: revoke default PUBLIC execute, grant intended roles

-- pin search_path (linter 0011)
create or replace function public.assign_member_identity()
returns trigger
language plpgsql
set search_path = public
as $$
declare n bigint;
begin
  if new.member_code is null then
    n := nextval('public.member_code_seq');
    new.member_code := 'JA' || lpad(n::text, 6, '0');
    if new.referral_code is null then
      new.referral_code := 'JA-REF-' || lpad(n::text, 5, '0');
    end if;
  end if;
  return new;
end;
$$;

-- acquisition_events: only the SECURITY DEFINER RPC writes (linter 0024)
drop policy if exists acq_insert on public.acquisition_events;
revoke insert on public.acquisition_events from anon, authenticated;

-- referral_events: inserter must be the referrer or the referred party (linter 0024)
drop policy if exists refev_insert on public.referral_events;
create policy refev_insert on public.referral_events
  for insert to authenticated
  with check (referrer_id = auth.uid() or referred_id = auth.uid());

-- lock SECURITY DEFINER RPC execution to intended roles (drops implicit PUBLIC grant)
revoke execute on function public.log_activity(text, jsonb) from public;
grant  execute on function public.log_activity(text, jsonb) to authenticated;

revoke execute on function public.capture_acquisition(text, text, text, text, text, uuid, jsonb) from public;
grant  execute on function public.capture_acquisition(text, text, text, text, text, uuid, jsonb) to anon, authenticated;
