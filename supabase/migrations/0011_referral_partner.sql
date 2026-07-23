-- 0011_referral_partner.sql
-- Buyer-module Increment 5: referral stats + Jamin Partner tier.
-- Additive & non-breaking. Protected profile columns (partner_*) are written
-- only via these SECURITY DEFINER RPCs (they set app.allow_protected, honoured
-- by the 0009 guard trigger).

create sequence if not exists public.partner_code_seq start 1;

-- Aggregated referral funnel for the current user (RETURNS jsonb, not TABLE).
create or replace function public.my_referral_stats()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_uid uuid := auth.uid(); v_out jsonb;
begin
  if v_uid is null then return '{}'::jsonb; end if;
  select jsonb_build_object(
    'registrations', (select count(*) from public.profiles p where p.referred_by = v_uid),
    'kyc_completed', (select count(*) from public.profiles p where p.referred_by = v_uid and p.kyc_status = 'approved'),
    'clicks',        (select count(*) from public.referral_events e where e.referrer_id = v_uid and e.event_type = 'click'),
    'downloads',     (select count(*) from public.referral_events e where e.referrer_id = v_uid and e.event_type = 'download'),
    'enquiries',     (select count(*) from public.referral_events e where e.referrer_id = v_uid and e.event_type = 'enquiry'),
    'site_visits',   (select count(*) from public.referral_events e where e.referrer_id = v_uid and e.event_type = 'site_visit'),
    'purchases',     (select count(*) from public.referral_events e where e.referrer_id = v_uid and e.event_type = 'purchase'),
    'rewards',       (select count(*) from public.referral_events e where e.referrer_id = v_uid and e.event_type = 'reward')
  ) into v_out;
  return v_out;
end;
$$;

-- Buyer requests to become a Jamin Partner (moves status to 'pending').
create or replace function public.request_partner()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_uid uuid := auth.uid(); v_status text;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  select partner_status into v_status from public.profiles where id = v_uid;
  if v_status in ('verified','pending') then return; end if;
  perform set_config('app.allow_protected', 'on', true);
  update public.profiles set partner_status = 'pending' where id = v_uid;
  insert into public.activity_log(user_id, event_type, meta) values (v_uid, 'partner_requested', '{}'::jsonb);
end;
$$;

-- Admin approves / rejects a partner request.
create or replace function public.admin_review_partner(
  p_user uuid, p_decision text, p_reason text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_uid uuid := auth.uid(); v_code text;
begin
  if not exists (select 1 from public.profiles p where p.id = v_uid and p.role = 'super_admin') then raise exception 'not authorized'; end if;
  if p_decision not in ('verified','rejected') then raise exception 'invalid decision'; end if;
  perform set_config('app.allow_protected', 'on', true);
  if p_decision = 'verified' then
    v_code := 'JA-P-' || lpad(nextval('public.partner_code_seq')::text, 4, '0');
    update public.profiles
       set partner_status = 'verified', partner_code = coalesce(partner_code, v_code), partner_verified_at = now()
     where id = p_user;
    insert into public.notifications(user_id, type, title, body)
      values (p_user, 'partner', 'You are now a Verified Jamin Partner', 'Your partner verification is complete. Welcome aboard! 🎉');
  else
    update public.profiles set partner_status = 'rejected' where id = p_user;
    insert into public.notifications(user_id, type, title, body)
      values (p_user, 'partner', 'Partner request update', coalesce(p_reason, 'Your partner request was not approved this time.'));
  end if;
  insert into public.activity_log(user_id, event_type, meta)
    values (v_uid, 'partner_reviewed', jsonb_build_object('target', p_user, 'decision', p_decision));
end;
$$;

revoke execute on function public.my_referral_stats() from public;
grant  execute on function public.my_referral_stats() to authenticated;
revoke execute on function public.request_partner() from public;
grant  execute on function public.request_partner() to authenticated;
revoke execute on function public.admin_review_partner(uuid, text, text) from public;
grant  execute on function public.admin_review_partner(uuid, text, text) to authenticated;
