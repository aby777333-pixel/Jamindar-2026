-- 0033 — Referral list for the Referral Centre (owner report 27-07 item 2):
-- "referral list not able to see — need name, user id, joined date, referral
-- add date". Profiles are self-only under RLS, so a SECURITY DEFINER function
-- exposes exactly the four fields for people the caller referred — nothing else.
create or replace function public.my_referrals()
returns table (
  referred_name text,
  referred_code text,
  joined_at     timestamptz,
  referred_at   timestamptz
)
language sql
security definer
set search_path = public
as $$
  select p.full_name                                        as referred_name,
         p.member_code                                      as referred_code,
         p.created_at                                       as joined_at,
         coalesce((select min(e.created_at)
                     from public.referral_events e
                    where e.referred_id = p.id
                      and e.referrer_id = auth.uid()),
                  p.created_at)                             as referred_at
    from public.profiles p
   where p.referred_by = auth.uid()
   order by p.created_at desc
$$;

revoke execute on function public.my_referrals() from public, anon;
grant execute on function public.my_referrals() to authenticated;
