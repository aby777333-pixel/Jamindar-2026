-- 0073 — "A promoter is a promoter" (owner directive, 2026-08-04).
--
-- The app offers two ways in: Buyer or Promoter. Until now, picking
-- "Enter as a Promoter" only called request_partner(): partner_status went to
-- 'pending' and the ROLE stayed 'buyer', so home, Account, dashboards and
-- notifications all kept rendering the BUYER experience until an admin
-- approved the application. The owner's rule: someone who enters as a
-- promoter IS a promoter — go easy on his KYC, and prompt him to complete the
-- full KYC to become a Verified Jamin Partner.
--
-- New model — two independent facts, neither of which replaces the other:
--   profiles.role = 'promoter'          -> "this member is a promoter".
--                                          Self-serve. Grants the promoter UI.
--   profiles.partner_status = 'verified'-> "Verified Jamin Partner".
--                                          Earned via KYC + admin approval.
--                                          The gold badge, the public V-card
--                                          green check and every "verified"
--                                          affordance keep keying off THIS —
--                                          none of them read `role`.
--
-- Why this is safe to self-serve (checked against the live database):
--   * NO row-level-security policy anywhere keys off role = 'promoter'.
--     Every promoter-scoped policy (leads, site_visits, property_submissions,
--     bookings, properties, profiles_promoter_read) is ownership-based
--     (promoter_id / assigned_promoter = auth.uid()), so the role grants a UI,
--     never data belonging to somebody else.
--   * Money is unreachable by construction: commissions and bazaar_income
--     rows are only created when an admin records a booking, and a withdrawal
--     is capped by that ledger — a self-serve promoter's wallet is ₹0.
--   * super_admin is untouched: enforce_super_admin_role() (0004) still owns
--     that role, and every branch below preserves it explicitly.

-- ─────────────────────────────────────────────────────────────────────────
-- 1. join_as_promoter() — the new self-serve entry point.
--    Idempotent: calling it again on an existing promoter is a no-op that
--    just re-asserts the promoter_profiles row and returns current state.
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.join_as_promoter()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me            uuid := auth.uid();
  v_prof        record;
  v_is_new      boolean;
begin
  if me is null then raise exception 'not authenticated'; end if;

  select role, partner_status, kyc_status, referral_code
    into v_prof
    from public.profiles
   where id = me;
  if not found then raise exception 'profile not found'; end if;

  v_is_new := v_prof.role is distinct from 'promoter'::public.user_role;

  -- the 0009/0025 guard trigger reverts role/partner_status for non-admins
  -- unless a definer RPC opts in for this transaction
  perform set_config('app.allow_protected', 'on', true);

  update public.profiles
     set role = case when role = 'super_admin' then role
                     else 'promoter'::public.user_role end,
         -- an already-verified partner never loses the badge by re-entering
         partner_status = case when partner_status = 'verified' then partner_status
                               else 'pending' end
   where id = me;

  -- a promoter needs this row for their referral link, V-card and WhatsApp
  insert into public.promoter_profiles (id, referral_code)
  select me, coalesce(v_prof.referral_code,
                      'JA-REF-' || substr(replace(me::text, '-', ''), 1, 8))
  on conflict (id) do nothing;

  if v_is_new then
    insert into public.notifications (user_id, type, title, body)
    values (me, 'partner', 'Welcome, Jamin Promoter 🎉',
            'Your promoter dashboard, Promoter ID, referral link and digital card are ready. '
            || 'Complete your KYC whenever you like to become a Verified Jamin Partner.');

    insert into public.activity_log (user_id, event_type, meta)
    values (me, 'promoter_joined', jsonb_build_object('from_role', v_prof.role));
  end if;

  select role, partner_status, kyc_status
    into v_prof
    from public.profiles
   where id = me;

  return jsonb_build_object(
    'role',           v_prof.role,
    'partner_status', v_prof.partner_status,
    'kyc_status',     v_prof.kyc_status,
    'joined',         v_is_new
  );
end;
$$;

revoke execute on function public.join_as_promoter() from public, anon;
grant  execute on function public.join_as_promoter() to authenticated;

-- request_partner() is deliberately left in place, unchanged, so any older
-- APK still in someone's hand keeps working exactly as it did.

-- ─────────────────────────────────────────────────────────────────────────
-- 2. admin_review_partner — 'pending' no longer strips the promoter role.
--    Under the old model 'pending' meant "application not yet approved", so
--    reverting a partner to pending also took the promoter role away (0049).
--    Now 'pending' is the NORMAL state of an unverified promoter, so only an
--    explicit rejection withdraws promoter access. Verify path unchanged.
-- ─────────────────────────────────────────────────────────────────────────
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
  if p_decision not in ('verified', 'rejected', 'pending') then raise exception 'invalid decision'; end if;

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

    insert into public.promoter_profiles (id, referral_code)
    select p_user, coalesce((select referral_code from public.profiles where id = p_user),
                            'JA-REF-' || substr(replace(p_user::text, '-', ''), 1, 8))
    on conflict (id) do nothing;

    insert into public.notifications (user_id, type, title, body)
    values (p_user, 'partner', 'You are now a Verified Jamin Partner',
            'Your partner verification is complete. Your Promoter ID, referral link and digital card are ready. Welcome aboard! 🎉');
  else
    update public.profiles
       set partner_status      = p_decision,
           partner_verified_at = null,
           role                = case
                                   when role = 'super_admin'   then role
                                   when p_decision = 'rejected' then 'buyer'::public.user_role
                                   else role                     -- 'pending' keeps the promoter role
                                 end
     where id = p_user;

    insert into public.notifications (user_id, type, title, body)
    values (p_user, 'partner',
            case when p_decision = 'pending' then 'Partner verification under review' else 'Partner request update' end,
            coalesce(p_reason,
              case when p_decision = 'pending'
                   then 'Your Verified Jamin Partner status is being re-checked by the Jamin team. Your promoter tools stay available meanwhile.'
                   else 'Your partner request was not approved this time.' end));
  end if;

  insert into public.activity_log (user_id, event_type, meta)
  values (v_uid, 'partner_reviewed',
          jsonb_build_object('target', p_user, 'decision', p_decision, 'reason', p_reason));
end;
$$;

revoke execute on function public.admin_review_partner(uuid, text, text) from public, anon;
grant  execute on function public.admin_review_partner(uuid, text, text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 3. Backfill — anyone who already applied under the old flow (they picked
--    "Enter as a Promoter", so partner_status='pending' while role stayed
--    'buyer') becomes a promoter now. Verified partners and admins are not
--    touched; nobody is demoted.
-- ─────────────────────────────────────────────────────────────────────────
do $$
declare v_ids uuid[];
begin
  select array_agg(id) into v_ids
    from public.profiles
   where role = 'buyer' and partner_status = 'pending';

  if v_ids is null then return; end if;

  perform set_config('app.allow_protected', 'on', true);

  update public.profiles
     set role = 'promoter'::public.user_role
   where id = any(v_ids);

  insert into public.promoter_profiles (id, referral_code)
  select p.id, coalesce(p.referral_code, 'JA-REF-' || substr(replace(p.id::text, '-', ''), 1, 8))
    from public.profiles p
   where p.id = any(v_ids)
  on conflict (id) do nothing;

  insert into public.notifications (user_id, type, title, body)
  select id, 'partner', 'Your promoter tools are live 🎉',
         'Your promoter dashboard, Promoter ID, referral link and digital card are ready to use. '
         || 'Complete your KYC whenever you like to become a Verified Jamin Partner.'
    from public.profiles where id = any(v_ids);

  insert into public.activity_log (user_id, event_type, meta)
  select id, 'promoter_joined', jsonb_build_object('from_role', 'buyer', 'via', 'migration_0073')
    from public.profiles where id = any(v_ids);
end $$;
