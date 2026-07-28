-- 0049 — Owner report 28-07: a Verified partner's status is no longer final.
-- admin_review_partner now also accepts 'pending' (back to review), and both
-- pending/rejected are allowed FROM verified. Reverting removes the promoter
-- role (unless the target is a super admin) but keeps their partner_code, so
-- re-verifying restores the same JA-P id. Audit stays in activity_log
-- ('partner_reviewed' events). Verify path identical to 0025.

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
    -- pending (back to review) or rejected — either way the promoter role is
    -- withdrawn until re-verified; partner_code stays for continuity.
    update public.profiles
       set partner_status      = p_decision,
           partner_verified_at = null,
           role                = case when role = 'super_admin' then role else 'buyer'::public.user_role end
     where id = p_user;
    insert into public.notifications (user_id, type, title, body)
    values (p_user, 'partner',
            case when p_decision = 'pending' then 'Partner status under review' else 'Partner request update' end,
            coalesce(p_reason,
              case when p_decision = 'pending'
                   then 'Your partner status is being re-checked by the Jamin team. We will update you shortly.'
                   else 'Your partner request was not approved this time.' end));
  end if;

  insert into public.activity_log (user_id, event_type, meta)
  values (v_uid, 'partner_reviewed',
          jsonb_build_object('target', p_user, 'decision', p_decision, 'reason', p_reason));
end;
$$;

revoke execute on function public.admin_review_partner(uuid, text, text) from public, anon;
grant  execute on function public.admin_review_partner(uuid, text, text) to authenticated;
