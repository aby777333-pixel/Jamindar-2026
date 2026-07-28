-- 0048 — Bug report 28-07 (#6): an accidentally approved/rejected KYC can be
-- sent back to review by an admin. admin_review_kyc now also accepts
-- 'pending' (revert-to-review); every change stays in activity_log for audit.
-- Body otherwise identical to 0009.

create or replace function public.admin_review_kyc(
  p_submission uuid, p_decision text, p_reason text default null, p_corrections text default null
) returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_target uuid;
begin
  if not exists (select 1 from public.profiles p where p.id = v_uid and p.role = 'super_admin') then raise exception 'not authorized'; end if;
  if p_decision not in ('approved','rejected','pending') then raise exception 'invalid decision'; end if;
  update public.kyc_submissions
     set status = p_decision, reviewed_by = v_uid, review_reason = p_reason, review_corrections = p_corrections, reviewed_at = now(), updated_at = now()
   where id = p_submission returning user_id into v_target;
  if v_target is null then raise exception 'submission not found'; end if;
  perform set_config('app.allow_protected', 'on', true);
  update public.profiles set kyc_status = p_decision where id = v_target;
  insert into public.notifications(user_id, type, title, body, meta) values (
    v_target, 'kyc',
    case p_decision when 'approved' then 'KYC approved'
                    when 'pending'  then 'KYC under review again'
                    else 'KYC needs attention' end,
    case p_decision when 'approved' then 'Your KYC is verified. You now have full access to Jamin services.'
                    when 'pending'  then coalesce(p_reason, 'Our team is re-checking your KYC. No action is needed unless we contact you.')
                    else coalesce(p_reason, 'Your KYC was rejected. Please review and resubmit.') end,
    jsonb_build_object('submission_id', p_submission, 'decision', p_decision, 'corrections', p_corrections)
  );
  insert into public.activity_log(user_id, event_type, meta) values (v_uid, 'kyc_reviewed', jsonb_build_object('submission_id', p_submission, 'decision', p_decision, 'target', v_target));
end;
$$;

revoke execute on function public.admin_review_kyc(uuid, text, text, text) from public, anon;
grant  execute on function public.admin_review_kyc(uuid, text, text, text) to authenticated;
