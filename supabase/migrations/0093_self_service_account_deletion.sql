-- 0093 — the account deletion the published policy already promises.
--
-- Google Play requires an in-app deletion path for any app that creates
-- accounts, and the Account Deletion page shipped on the website already
-- describes this exact flow ("Profile → Settings → Tap Delete Account"). The
-- app had no such flow and the database had no function behind one: the only
-- deletion that existed was `admin_delete_account`, which takes a TARGET user
-- and refuses anyone who is not a super admin. A buyer could not remove their
-- own account by any route except emailing the office.
--
-- ⚠️ THE ACCOUNT IS ANONYMISED, NOT ROW-DELETED, AND THAT IS THE WHOLE DESIGN.
-- `profiles.id` references `auth.users(id) ON DELETE CASCADE`, and hanging off
-- `profiles` by their own CASCADE are `commissions`, `wallet_withdrawals`,
-- `bazaar_income_ledger` and `bazaar_awards`. Deleting the auth row would
-- therefore destroy, silently and in the same statement, precisely the
-- financial records the published policy commits to keeping for 8 years from
-- the end of the financial year. So the row stays and the PERSON in it is
-- destroyed — the same reading `admin_delete_account` already took, and for
-- the same reason.
--
-- WHAT THIS MEANS FOR SIGNING IN: the mobile is overwritten with a tombstone,
-- which both frees the real number to register again (a new account, no
-- history — as the policy states) and makes the old account unreachable,
-- because OTP login resolves the account by that number. The app signs the
-- user out the moment this returns. The `auth.users` row is deliberately left
-- behind; it is an empty shell that nothing can log into.
--
-- STATUTORY RETENTION IS A BRANCH, NOT A BLANKET. The policy promises KYC
-- documents are "permanently removed from storage", but also that identity
-- records evidencing a COMPLETED property transaction are retained for 8
-- years. Both cannot be true of the same account, so the branch is on whether
-- a confirmed booking exists. `bookings.status` is constrained to exactly
-- 'confirmed' or 'cancelled', so this is a clean test and not a guess.
--
-- ⚠️ THE AVATAR IS DELETED FROM STORAGE, NOT JUST UNLINKED. The `avatars`
-- bucket is PUBLIC. Nulling `profiles.avatar_url` hides the photograph from
-- the app while leaving it fetchable for ever by anyone who saw the URL once —
-- which is not deletion in any sense a regulator would accept.
--
-- ⚠️ FILE DELETION IS DONE TWICE, ON PURPOSE, AND THE ORDER MATTERS.
-- The app removes `kyc/<uid>/*` and `avatars/<uid>/*` through the Storage API
-- BEFORE calling this function — that is the true deletion, the one that
-- removes bytes from object storage, and the user's own RLS grant
-- (`kyc_obj_owner_rw`, `avatars_owner`) is what authorises it. The deletes
-- below are the metadata fallback for a client that failed or skipped that
-- step: they need `storage.allow_delete_query` because Supabase guards
-- `storage.objects` against direct SQL deletes (its statement-level trigger
-- vetoes the whole statement otherwise — found by running this, not by
-- reading about it). A metadata-only delete leaves orphaned bytes that no
-- URL can ever reach again, which is why it is the fallback and not the plan.
--
-- ⚠️ KYC FILES ARE PURGED BY PATH PREFIX, NOT BY THE SEVEN PATH COLUMNS.
-- `kyc_submissions` names its uploads across pan_doc, aadhaar_front,
-- aadhaar_back, bank_proof, nominee_pan_doc, nominee_aadhaar_front and
-- nominee_aadhaar_back. Deleting only what those columns point at leaves
-- behind every file from an abandoned or re-tried upload, because a replaced
-- document overwrites the COLUMN and not the OBJECT. Every KYC object is
-- stored under `<user-id>/…`, so the prefix catches the orphans too.
--
-- SHARED RECORDS KEEP THE ROW AND LOSE THE PERSON. `leads` is a promoter's
-- own CRM record and carries denormalised name/phone/email; those three are
-- nulled rather than the row deleted, and since the profile the lead points at
-- is anonymised in the same transaction, nothing identifying survives on
-- either side. Community writing is withdrawn but retained, as §16 asks.
--
-- It is one function, so it is one transaction: a failure part-way leaves the
-- account exactly as it was.
create or replace function public.delete_my_account(p_confirm text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_uid   uuid := auth.uid();
  v_p     profiles;
  v_tomb  text;
  v_keep_kyc boolean;
  v_files int := 0; v_kyc   int := 0; v_visits int := 0; v_favs int := 0;
  v_msgs  int := 0; v_leads int := 0; v_posts  int := 0; v_comments int := 0;
begin
  if v_uid is null then
    raise exception 'not signed in';
  end if;

  -- the caller has to type the word the confirmation dialog shows, exactly as
  -- admin_delete_account requires. There is no p_user parameter at all: this
  -- function can only ever act on auth.uid(), so it cannot be turned against
  -- another account by a caller who edits the request.
  if coalesce(p_confirm, '') <> 'DELETE' then
    raise exception 'confirmation phrase missing';
  end if;

  select * into v_p from profiles where id = v_uid;
  if v_p.id is null then
    raise exception 'account not found';
  end if;
  if v_p.full_name = 'Deleted user' then
    raise exception 'this account has already been removed';
  end if;
  -- Staff accounts are the three allowlisted numbers. Letting one delete
  -- itself in the app would strand the ecosystem it administers, and
  -- `enforce_super_admin_role` would fight the tombstone on the way out.
  if v_p.role::text = 'super_admin' then
    raise exception 'An administrator account cannot be deleted from the app. Please write to info@jaminbazaar.in.';
  end if;

  v_keep_kyc := exists (
    select 1 from bookings where buyer_id = v_uid and status = 'confirmed'
  );

  -- profiles guards its protected columns with a trigger; this is the same
  -- escape hatch admin_delete_account uses, and it lasts for this transaction.
  perform set_config('app.allow_protected', 'on', true);
  -- and storage.objects guards against direct deletes; also transaction-local.
  perform set_config('storage.allow_delete_query', 'true', true);

  ------------------------------------------------------------------ KYC
  if not v_keep_kyc then
    delete from storage.objects
      where bucket_id = 'kyc' and path_tokens[1] = v_uid::text;
    get diagnostics v_files = row_count;

    delete from kyc_history     where user_id = v_uid;
    delete from kyc_submissions where user_id = v_uid;
    get diagnostics v_kyc = row_count;
  end if;

  ------------------------------------------------- the public avatar file
  delete from storage.objects
    where bucket_id = 'avatars' and path_tokens[1] = v_uid::text;

  ------------------------------------------------- the user's own records
  delete from favorites            where buyer_id = v_uid;
  get diagnostics v_favs = row_count;
  delete from site_visits          where buyer_id = v_uid;
  get diagnostics v_visits = row_count;
  delete from messages             where sender_id = v_uid;
  get diagnostics v_msgs = row_count;
  delete from thread_participants  where user_id  = v_uid;
  delete from buyer_preferences    where buyer_id = v_uid;
  delete from questionnaire_answers where user_id = v_uid;
  delete from jamindar_memory      where user_id  = v_uid;
  delete from conversations        where user_id  = v_uid;
  delete from plot_holds           where buyer_id = v_uid;
  delete from notifications        where user_id  = v_uid;
  delete from document_requests    where user_id  = v_uid;
  delete from voice_logs           where user_id  = v_uid;
  delete from brochure_downloads   where user_id  = v_uid;

  ------------------------------------- shared records: keep row, lose person
  update leads set name = null, phone = null, email = null
    where buyer_id = v_uid
      and (name is not null or phone is not null or email is not null);
  get diagnostics v_leads = row_count;

  update community_posts set status = 'removed'
    where author_id = v_uid and status <> 'removed';
  get diagnostics v_posts = row_count;

  update community_comments
     set status = 'removed', deleted_at = now(), deleted_by = v_uid
    where author_id = v_uid and coalesce(status, 'published') <> 'removed';
  get diagnostics v_comments = row_count;

  ------------------------------------------------------------- the person
  v_tomb := 'deleted-' || replace(v_uid::text, '-', '');

  update profiles set
      full_name = 'Deleted user',
      email = null, mobile = v_tomb, avatar_url = null,
      city = null, district = null, state = null, pincode = null,
      -- acquisition_meta is NOT NULL DEFAULT '{}' — null violates the
      -- constraint. (admin_delete_account had this same latent fault; 0094
      -- repairs it.)
      dob = null, gender = null, is_active = false, acquisition_meta = '{}'::jsonb,
      -- 'not_started' is one of the four values the CHECK allows; a purged
      -- account must not keep claiming it is KYC-approved.
      kyc_status = case when v_keep_kyc then kyc_status else 'not_started' end
    where id = v_uid;

  return jsonb_build_object(
    'ok', true,
    'kyc_purged',            not v_keep_kyc,
    'kyc_files_deleted',     v_files,
    'kyc_records_deleted',   v_kyc,
    'saved_plots_deleted',   v_favs,
    'site_visits_deleted',   v_visits,
    'messages_deleted',      v_msgs,
    'enquiries_anonymised',  v_leads,
    'posts_withdrawn',       v_posts,
    'comments_withdrawn',    v_comments,
    'financial_records',     'retained',
    'referral_tree',         'unchanged'
  );
end $fn$;

-- anon must never reach this: it acts on auth.uid() and an anonymous caller
-- has none, but an explicit revoke is cheaper than reasoning about it later.
revoke execute on function public.delete_my_account(text) from public, anon;
grant  execute on function public.delete_my_account(text) to authenticated;

-- THE CLIENT NEEDS THE RETENTION ANSWER BEFORE THE RPC RUNS, NOT AFTER. The
-- physical file sweep has to happen through the Storage API while the object
-- metadata still exists (the RPC's fallback removes the metadata, after which
-- nothing can list the files to delete them) — but a buyer cannot read their
-- own bookings (`bookings_read_own` covers the seller and admins only), so
-- the app cannot decide for itself whether this account's KYC files are
-- retention-bound. This answers exactly that one question and nothing else.
create or replace function public.kyc_must_be_retained()
returns boolean
language sql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
  select exists (
    select 1 from bookings
    where buyer_id = auth.uid() and status = 'confirmed'
  );
$fn$;
revoke execute on function public.kyc_must_be_retained() from public, anon;
grant  execute on function public.kyc_must_be_retained() to authenticated;
