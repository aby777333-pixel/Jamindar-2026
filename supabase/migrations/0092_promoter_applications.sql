-- ============================================================================
-- 0092 — PROMOTER APPLICATIONS (owner spec, 2026-08-21 §3 "Buyer → Promoter
-- Upgrade")
--
-- "The Buyer can then submit a Promoter Application. Submitting an application
--  should not immediately convert the account into a Promoter account. The
--  application must first appear in the Admin Panel for verification and
--  approval. Once approved by the Super Admin, the user's account receives
--  Promoter access and features while retaining the same user identity,
--  registered phone number, profile and historical activity."
--
-- 🚨 WHAT THIS DELIBERATELY DOES **NOT** TOUCH
--
-- `profiles.role` and `profiles.partner_status` are two different facts and the
-- project has a standing rule never to collapse them: the ROLE is what a
-- promoter is, `partner_status = 'verified'` is a badge that is EARNED through
-- KYC. Approving an application therefore grants the ROLE only. A freshly
-- approved promoter is a real promoter with none of the verified badge's
-- claims attached, exactly as one created any other way.
--
-- It also leaves the app's existing self-serve path alone. Nothing here changes
-- how an account already becomes a promoter inside the mobile app; this adds a
-- reviewed route for the WEBSITE, which had none at all — a buyer was told to
-- go and telephone the desk.
--
-- ⚠️ ADDITIVE ONLY. One new table, one new RPC, no column added to or removed
-- from any existing table, no existing policy altered. Nothing that works today
-- can behave differently because this ran.
-- ============================================================================

create table if not exists public.promoter_applications (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,

  -- Captured as typed, so the desk reviews what the applicant actually wrote
  -- rather than whatever their profile happened to say afterwards.
  full_name     text,
  mobile        text,
  email         text,
  city          text,
  occupation    text,
  experience    text,
  motivation    text,

  status        text not null default 'pending'
                check (status in ('pending', 'approved', 'rejected')),
  review_reason text,
  reviewed_by   uuid references public.profiles(id),
  reviewed_at   timestamptz,
  consent       boolean not null default false,
  created_at    timestamptz not null default now()
);

-- ⚠️ ONE PENDING APPLICATION PER PERSON, and PARTIAL on purpose. A double tap
-- must not queue the desk twice, but somebody rejected once must be able to
-- apply again later — which a plain unique index would forbid for ever.
create unique index if not exists promoter_applications_one_pending
  on public.promoter_applications (user_id) where status = 'pending';

create index if not exists promoter_applications_status_idx
  on public.promoter_applications (status, created_at desc);

alter table public.promoter_applications enable row level security;

-- § "Every user's Account area must be private and unique to that individual
--    user… Super Admin must have authorized access to all user accounts."
drop policy if exists promoter_apps_self_read on public.promoter_applications;
create policy promoter_apps_self_read on public.promoter_applications
  for select to authenticated
  using (user_id = auth.uid() or public.is_super_admin());

-- ⚠️ A member may file only their OWN application and only as PENDING. Without
-- the status half of the check, an applicant could insert themselves a row
-- already marked `approved` — the write path would then be the approval.
drop policy if exists promoter_apps_self_insert on public.promoter_applications;
create policy promoter_apps_self_insert on public.promoter_applications
  for insert to authenticated
  with check (user_id = auth.uid() and status = 'pending');

-- No member-facing UPDATE or DELETE policy at all: the only way a row's status
-- moves is the reviewed RPC below, which is the whole point of the feature.
drop policy if exists promoter_apps_admin_all on public.promoter_applications;
create policy promoter_apps_admin_all on public.promoter_applications
  for all to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

-- ============================================================================
-- THE REVIEW — the only thing that may grant the role
-- ============================================================================
create or replace function public.admin_review_promoter_application(
  p_id       uuid,
  p_decision text,
  p_reason   text default null
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_app promoter_applications%rowtype;
begin
  -- ⚠️ SECURITY DEFINER, so the guard is not optional. Without it any
  -- authenticated caller could approve their own application by RPC.
  if not public.is_super_admin() then
    return jsonb_build_object('ok', false, 'error', 'Not authorised.');
  end if;

  if p_decision not in ('approved', 'rejected') then
    return jsonb_build_object('ok', false, 'error', 'Unknown decision.');
  end if;

  select * into v_app from promoter_applications where id = p_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Application not found.');
  end if;
  if v_app.status <> 'pending' then
    return jsonb_build_object('ok', false, 'error', 'That application has already been reviewed.');
  end if;

  update promoter_applications
     set status = p_decision,
         review_reason = nullif(trim(coalesce(p_reason, '')), ''),
         reviewed_by = auth.uid(),
         reviewed_at = now()
   where id = p_id;

  if p_decision = 'approved' then
    -- 🚨 THE ROLE ONLY. `partner_status` is the earned badge and is untouched
    -- here; see the header. `where role = 'buyer'` so an approval can never
    -- demote a super_admin who happened to apply.
    update profiles
       set role = 'promoter'
     where id = v_app.user_id
       and role = 'buyer';

    insert into notifications (user_id, type, title, body, meta)
    values (
      v_app.user_id, 'promoter',
      'You are now a Jamin promoter',
      'Your promoter application has been approved. Your promoter tools are available in your account.',
      jsonb_build_object('source', 'promoter_application')
    );
  else
    insert into notifications (user_id, type, title, body, meta)
    values (
      v_app.user_id, 'promoter',
      'About your promoter application',
      coalesce(nullif(trim(coalesce(p_reason, '')), ''),
               'Your promoter application was not approved at this time.'),
      jsonb_build_object('source', 'promoter_application')
    );
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.admin_review_promoter_application(uuid, text, text) from public;
grant execute on function public.admin_review_promoter_application(uuid, text, text) to authenticated;
