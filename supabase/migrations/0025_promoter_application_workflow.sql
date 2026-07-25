-- 0025 — Promoter application workflow + role escalation guard.
-- Additive & non-breaking to data; tightens who may change `profiles.role`.
--
-- Before this, app/role.tsx wrote `role = 'promoter'` straight to the profile,
-- so any user could grant themselves the full promoter dashboard with no
-- approval at all. `role` was the only sensitive column the 0009/0015 guard did
-- not cover. Now:
--   user applies (request_partner)  ->  partner_status = 'pending'
--   admin approves (admin_review_partner) -> role = 'promoter',
--        partner_status = 'verified', partner_code JA-P-0001 minted, notified.
--
-- CAREFUL — trigger order on profiles is alphabetical:
--   trg_assign_member_identity -> trg_enforce_super_admin -> trg_guard_protected_profile_cols
-- The guard therefore runs LAST and can undo what enforce_super_admin_role just
-- decided. That is why the role rule below carries an explicit exception for
-- allowlisted admin mobiles, and why it only ever blocks *escalations* — a
-- demotion performed by enforce_super_admin_role must be allowed to stand.

create or replace function public.guard_protected_profile_cols()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(current_setting('app.allow_protected', true), '') = 'on' then return new; end if;
  if exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin') then return new; end if;

  new.kyc_status          := old.kyc_status;
  new.partner_status      := old.partner_status;
  new.partner_code        := old.partner_code;
  new.partner_verified_at := old.partner_verified_at;
  new.member_code         := old.member_code;
  new.referral_code       := old.referral_code;
  new.referred_by         := old.referred_by;

  -- role: never self-serve. Allowlisted admin mobiles are exempt so that
  -- trg_enforce_super_admin's decision survives this trigger.
  if not public.is_super_admin_mobile(new.mobile) then
    if new.role = 'super_admin' then
      new.role := 'buyer';                       -- block escalation to admin
    elsif new.role is distinct from old.role and old.role <> 'super_admin' then
      new.role := old.role;                      -- block buyer -> promoter
    end if;
  end if;

  return new;
end;
$$;

revoke execute on function public.guard_protected_profile_cols() from public, anon, authenticated;

-- Approval now also grants the promoter role, which is what actually unlocks
-- the promoter dashboard. Rejection leaves the applicant a buyer.
create or replace function public.admin_review_partner(
  p_user     uuid,
  p_decision text,
  p_reason   text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_code text;
begin
  if not exists (select 1 from public.profiles p where p.id = v_uid and p.role = 'super_admin') then
    raise exception 'not authorized';
  end if;
  if p_decision not in ('verified', 'rejected') then raise exception 'invalid decision'; end if;

  perform set_config('app.allow_protected', 'on', true);

  if p_decision = 'verified' then
    v_code := 'JA-P-' || lpad(nextval('public.partner_code_seq')::text, 4, '0');
    update public.profiles
       set partner_status      = 'verified',
           partner_code        = coalesce(partner_code, v_code),
           partner_verified_at = now(),
           -- never demote an admin who was also approved as a partner
           role                = case when role = 'super_admin' then role else 'promoter'::public.user_role end
     where id = p_user;

    -- a verified partner needs a promoter_profiles row for their V-card,
    -- referral link and WhatsApp number to resolve
    insert into public.promoter_profiles (id, referral_code)
    select p_user, coalesce((select referral_code from public.profiles where id = p_user),
                            'JA-REF-' || substr(replace(p_user::text, '-', ''), 1, 8))
    on conflict (id) do nothing;

    insert into public.notifications (user_id, type, title, body)
    values (p_user, 'partner', 'You are now a Verified Jamin Partner',
            'Your partner verification is complete. Your Promoter ID, referral link and digital card are ready. Welcome aboard! 🎉');
  else
    update public.profiles set partner_status = 'rejected' where id = p_user;
    insert into public.notifications (user_id, type, title, body)
    values (p_user, 'partner', 'Partner request update',
            coalesce(p_reason, 'Your partner request was not approved this time.'));
  end if;

  insert into public.activity_log (user_id, event_type, meta)
  values (v_uid, 'partner_reviewed',
          jsonb_build_object('target', p_user, 'decision', p_decision, 'reason', p_reason));
end;
$$;

revoke execute on function public.admin_review_partner(uuid, text, text) from public, anon;
grant  execute on function public.admin_review_partner(uuid, text, text) to authenticated;
