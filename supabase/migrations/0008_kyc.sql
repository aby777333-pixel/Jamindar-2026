-- 0008_kyc.sql
-- Buyer-module Increment 2: KYC.  Additive & non-breaking.
--   • kyc_submissions (identity / courier address / bank / nominee + doc paths)
--   • private 'kyc' storage bucket + owner/admin object policies
--   • notifications table (in-app surface for review results)
--   • submit_kyc() / admin_review_kyc() RPCs (SECURITY DEFINER)
--   • column-privilege lockdown: users can never write their own kyc/partner/
--     member/referral columns — only the definer RPCs (run as owner) can.

-- ─────────────────────────────────────────────────────────────
-- kyc_submissions
-- ─────────────────────────────────────────────────────────────
create table if not exists public.kyc_submissions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  status        text not null default 'pending' check (status in ('pending','approved','rejected')),
  -- identity
  pan_number    text,
  aadhaar_number text,
  pan_doc       text,
  aadhaar_front text,
  aadhaar_back  text,
  -- courier address
  addr_house    text,
  addr_street   text,
  addr_landmark text,
  addr_area     text,
  addr_city     text,
  addr_district text,
  addr_state    text,
  addr_country  text default 'India',
  addr_pincode  text,
  -- bank
  bank_account_name   text,
  bank_account_number text,
  bank_ifsc     text,
  bank_name     text,
  bank_branch   text,
  bank_proof    text,
  upi_id        text,
  -- nominee
  nominee_name         text,
  nominee_relationship text,
  nominee_phone        text,
  nominee_email        text,
  nominee_address      text,
  nominee_pan          text,
  nominee_aadhaar      text,
  nominee_pan_doc      text,
  nominee_aadhaar_front text,
  nominee_aadhaar_back  text,
  -- review
  reviewed_by       uuid references public.profiles(id) on delete set null,
  review_reason     text,
  review_corrections text,
  submitted_at  timestamptz not null default now(),
  reviewed_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
alter table public.kyc_submissions enable row level security;
create index if not exists kyc_submissions_user_idx   on public.kyc_submissions(user_id);
create index if not exists kyc_submissions_status_idx on public.kyc_submissions(status);

-- user reads own; admin reads all
drop policy if exists kyc_read on public.kyc_submissions;
create policy kyc_read on public.kyc_submissions for select to authenticated
  using (user_id = auth.uid()
         or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin'));
-- user inserts own; edits own only while still pending (review is admin-only via RPC)
drop policy if exists kyc_insert on public.kyc_submissions;
create policy kyc_insert on public.kyc_submissions for insert to authenticated
  with check (user_id = auth.uid());
drop policy if exists kyc_update_pending on public.kyc_submissions;
create policy kyc_update_pending on public.kyc_submissions for update to authenticated
  using (user_id = auth.uid() and status = 'pending')
  with check (user_id = auth.uid() and status = 'pending');

-- ─────────────────────────────────────────────────────────────
-- notifications (reusable in-app surface)
-- ─────────────────────────────────────────────────────────────
create table if not exists public.notifications (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid not null references public.profiles(id) on delete cascade,
  type      text not null default 'info',
  title     text not null,
  body      text,
  meta      jsonb not null default '{}'::jsonb,
  read_at   timestamptz,
  created_at timestamptz not null default now()
);
alter table public.notifications enable row level security;
create index if not exists notifications_user_idx on public.notifications(user_id, created_at desc);

drop policy if exists notif_read on public.notifications;
create policy notif_read on public.notifications for select to authenticated
  using (user_id = auth.uid());
-- user may only flip their own read_at (definer RPCs create rows)
drop policy if exists notif_update on public.notifications;
create policy notif_update on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ─────────────────────────────────────────────────────────────
-- private storage bucket for KYC documents  (path: kyc/<user_id>/<file>)
-- ─────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('kyc', 'kyc', false)
on conflict (id) do nothing;

-- owner may manage only their own folder; admin may read all
drop policy if exists kyc_obj_owner_rw on storage.objects;
create policy kyc_obj_owner_rw on storage.objects for all to authenticated
  using (bucket_id = 'kyc' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'kyc' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists kyc_obj_admin_read on storage.objects;
create policy kyc_obj_admin_read on storage.objects for select to authenticated
  using (bucket_id = 'kyc'
         and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin'));

-- ─────────────────────────────────────────────────────────────
-- protect sensitive profile columns from client writes
-- (definer RPCs run as owner and bypass these column grants)
-- ─────────────────────────────────────────────────────────────
revoke update (kyc_status, partner_status, partner_code, partner_verified_at, member_code, referral_code)
  on public.profiles from anon, authenticated;

-- ─────────────────────────────────────────────────────────────
-- RPCs
-- ─────────────────────────────────────────────────────────────
-- submit / resubmit KYC: writes the row (as the user) and flips profile status
-- to 'pending' (which the client itself is no longer allowed to do).
create or replace function public.submit_kyc(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid; v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  insert into public.kyc_submissions (
    user_id, status,
    pan_number, aadhaar_number, pan_doc, aadhaar_front, aadhaar_back,
    addr_house, addr_street, addr_landmark, addr_area, addr_city, addr_district, addr_state, addr_country, addr_pincode,
    bank_account_name, bank_account_number, bank_ifsc, bank_name, bank_branch, bank_proof, upi_id,
    nominee_name, nominee_relationship, nominee_phone, nominee_email, nominee_address,
    nominee_pan, nominee_aadhaar, nominee_pan_doc, nominee_aadhaar_front, nominee_aadhaar_back
  ) values (
    v_uid, 'pending',
    p_payload->>'pan_number', p_payload->>'aadhaar_number', p_payload->>'pan_doc', p_payload->>'aadhaar_front', p_payload->>'aadhaar_back',
    p_payload->>'addr_house', p_payload->>'addr_street', p_payload->>'addr_landmark', p_payload->>'addr_area', p_payload->>'addr_city', p_payload->>'addr_district', p_payload->>'addr_state', coalesce(p_payload->>'addr_country','India'), p_payload->>'addr_pincode',
    p_payload->>'bank_account_name', p_payload->>'bank_account_number', p_payload->>'bank_ifsc', p_payload->>'bank_name', p_payload->>'bank_branch', p_payload->>'bank_proof', p_payload->>'upi_id',
    p_payload->>'nominee_name', p_payload->>'nominee_relationship', p_payload->>'nominee_phone', p_payload->>'nominee_email', p_payload->>'nominee_address',
    p_payload->>'nominee_pan', p_payload->>'nominee_aadhaar', p_payload->>'nominee_pan_doc', p_payload->>'nominee_aadhaar_front', p_payload->>'nominee_aadhaar_back'
  ) returning id into v_id;

  update public.profiles set kyc_status = 'pending' where id = v_uid;

  insert into public.activity_log(user_id, event_type, meta)
  values (v_uid, 'kyc_submitted', jsonb_build_object('submission_id', v_id));

  return v_id;
end;
$$;

-- admin approve / reject with reason; updates profile status + notifies the user
create or replace function public.admin_review_kyc(
  p_submission uuid, p_decision text, p_reason text default null, p_corrections text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_uid uuid := auth.uid(); v_target uuid;
begin
  if not exists (select 1 from public.profiles p where p.id = v_uid and p.role = 'super_admin') then
    raise exception 'not authorized';
  end if;
  if p_decision not in ('approved','rejected') then
    raise exception 'invalid decision';
  end if;

  update public.kyc_submissions
     set status = p_decision, reviewed_by = v_uid, review_reason = p_reason,
         review_corrections = p_corrections, reviewed_at = now(), updated_at = now()
   where id = p_submission
   returning user_id into v_target;

  if v_target is null then raise exception 'submission not found'; end if;

  update public.profiles set kyc_status = p_decision where id = v_target;

  insert into public.notifications(user_id, type, title, body, meta)
  values (
    v_target,
    'kyc',
    case when p_decision = 'approved' then 'KYC approved' else 'KYC needs attention' end,
    case when p_decision = 'approved'
         then 'Your KYC is verified. You now have full access to Jamin services.'
         else coalesce(p_reason, 'Your KYC was rejected. Please review and resubmit.') end,
    jsonb_build_object('submission_id', p_submission, 'decision', p_decision, 'corrections', p_corrections)
  );

  insert into public.activity_log(user_id, event_type, meta)
  values (v_uid, 'kyc_reviewed', jsonb_build_object('submission_id', p_submission, 'decision', p_decision, 'target', v_target));
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- grants
-- ─────────────────────────────────────────────────────────────
grant select, insert, update on public.kyc_submissions to authenticated;
grant select, update          on public.notifications  to authenticated;
revoke execute on function public.submit_kyc(jsonb) from public;
grant  execute on function public.submit_kyc(jsonb) to authenticated;
revoke execute on function public.admin_review_kyc(uuid, text, text, text) from public;
grant  execute on function public.admin_review_kyc(uuid, text, text, text) to authenticated;
