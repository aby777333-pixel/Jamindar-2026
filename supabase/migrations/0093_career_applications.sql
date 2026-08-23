-- ============================================================================
-- 0093 — CAREER APPLICATIONS (owner, 2026-08-23: a /careers page on the
-- website, "make provisions in the admin for the same")
--
-- The website had no way at all to receive a job application. The careers page
-- lists eleven role families and every one of them ends in a call to action, so
-- those buttons need somewhere to land and the desk needs somewhere to read
-- them.
--
-- 🚨 WHY THIS IS **NOT** A `leads` ROW
--
-- `website_enquiry` already exists and would have been two lines of work. It is
-- the wrong home: `leads` is the SALES pipeline. Its rows carry `promoter_id`,
-- `property_id`, a `lead_status` enum and a commission trail, they are counted
-- on the admin dashboard, they are routed to promoters by referral code, and
-- they are what the money path reads. A person asking for a job is none of
-- those things. Filing them together would inflate every lead count on the
-- dashboard, notify promoters about applicants they cannot act on, and put a
-- jobseeker's phone number into a pipeline built to be worked commercially.
--
-- So: its own table, its own RPC, its own admin desk. Nothing that exists today
-- reads or writes it.
--
-- ⚠️ ADDITIVE ONLY, on the same terms as 0092. One new table, two new
-- functions. No column added to or removed from any existing table, no existing
-- policy altered, no existing function replaced. Nothing that works today can
-- behave differently because this ran.
-- ============================================================================

create table if not exists public.career_applications (
  id            uuid primary key default gen_random_uuid(),

  -- ⚠️ BOTH THE KEY AND THE LABEL, and the duplication is deliberate. The key
  -- is what the page's tab strip uses and what the admin filters on; the label
  -- is the words the applicant actually saw above the button they pressed. If
  -- a role family is ever renamed or retired, the desk can still read what
  -- somebody applied for two years ago. The label is not derived from the key.
  role_key      text not null,
  role_label    text,

  full_name     text not null,
  mobile        text not null,
  email         text,
  city          text,
  experience    text,
  message       text,

  -- A pipeline, not a verdict. 0092's promoter application is approve/reject
  -- because approving GRANTS something; a job application is worked through
  -- stages and most of them end in a conversation rather than a decision.
  status        text not null default 'new'
                check (status in ('new', 'shortlisted', 'contacted', 'declined')),
  review_reason text,
  reviewed_by   uuid references public.profiles(id),
  reviewed_at   timestamptz,

  -- Attribution, exactly as `leads` records it, so an application that arrived
  -- through a promoter's shared link is still traceable to them.
  referral_code text,
  source_url    text,
  consent       boolean not null default false,
  created_at    timestamptz not null default now()
);

create index if not exists career_applications_status_idx
  on public.career_applications (status, created_at desc);
create index if not exists career_applications_role_idx
  on public.career_applications (role_key, created_at desc);
-- Serves the RPC's own duplicate check below, which is the hottest read here.
create index if not exists career_applications_mobile_idx
  on public.career_applications (mobile, created_at desc);

alter table public.career_applications enable row level security;

-- 🚨 EXACTLY ONE POLICY, AND IT IS SUPER-ADMIN ONLY.
--
-- There is no self-read policy because there is no `user_id` — an applicant is
-- an anonymous website visitor, not an account. There is no insert policy for
-- anon or authenticated because the RPC below is `security definer` and is
-- therefore the only way a row can be created. That is not belt-and-braces: it
-- is what stops a jobseeker's name, mobile and message being writable — or
-- readable — straight off the browser with the publishable key.
drop policy if exists career_apps_admin_all on public.career_applications;
create policy career_apps_admin_all on public.career_applications
  for all to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

-- ============================================================================
-- THE PUBLIC WRITE — the only way in
--
-- Modelled line for line on `website_enquiry`: same validation, same silent
-- de-duplication, same rate limit, and the same contract of returning
-- `{ok:false,error}` rather than raising. A form that throws a Postgres error
-- at a visitor is a form that has told them nothing.
-- ============================================================================
create or replace function public.website_career_apply(
  p_role_key   text,
  p_role_label text,
  p_name       text,
  p_mobile     text,
  p_email      text default null,
  p_city       text default null,
  p_experience text default null,
  p_message    text default null,
  p_ref        text default null,
  p_source_url text default null,
  p_consent    boolean default false
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_role   text := lower(trim(coalesce(p_role_key, '')));
  v_label  text := left(trim(coalesce(p_role_label, '')), 120);
  v_name   text := trim(coalesce(p_name, ''));
  v_mobile text := regexp_replace(coalesce(p_mobile, ''), '\D', '', 'g');
  v_email  text := nullif(lower(trim(coalesce(p_email, ''))), '');
  v_city   text := nullif(left(trim(coalesce(p_city, '')), 80), '');
  v_exp    text := nullif(left(trim(coalesce(p_experience, '')), 400), '');
  v_msg    text := nullif(left(trim(coalesce(p_message, '')), 1500), '');
  v_ref    text := nullif(upper(trim(coalesce(p_ref, ''))), '');
begin
  -- ⚠️ THE ROLE KEY IS WHITELISTED SERVER-SIDE. The page sends it, so without
  -- this the table would accept whatever a crafted request cared to put in the
  -- column and the admin's role filter would grow entries nobody wrote.
  if v_role not in (
    'promoter', 'broker', 'bizdev', 'crm', 'sales',
    'site', 'security', 'marketing', 'design', 'tech', 'open'
  ) then
    return jsonb_build_object('ok', false, 'error', 'Please choose a role to apply for.');
  end if;

  if length(v_name) < 2 or length(v_name) > 80 then
    return jsonb_build_object('ok', false, 'error', 'Please enter your name.');
  end if;

  if v_mobile ~ '^91[0-9]{10}$' then
    v_mobile := right(v_mobile, 10);
  end if;
  if v_mobile !~ '^[6-9][0-9]{9}$' then
    return jsonb_build_object('ok', false, 'error', 'Please enter a valid 10-digit mobile number.');
  end if;

  if v_email is not null and v_email !~ '^[^@\s]+@[^@\s.]+\.[^@\s]+$' then
    return jsonb_build_object('ok', false, 'error', 'That email address does not look right.');
  end if;

  -- ⚠️ THE DUPLICATE CHECK RETURNS ok:true, DELIBERATELY. A double tap must not
  -- be told "you already applied" — that reads as a rejection to somebody who
  -- has done nothing wrong, and it also confirms to a stranger whether a given
  -- number is already in the table. Same reasoning as `website_enquiry`.
  if exists (
    select 1 from career_applications
     where mobile = v_mobile and role_key = v_role
       and created_at > now() - interval '10 minutes'
  ) then
    return jsonb_build_object('ok', true, 'note', 'already_received');
  end if;

  if (select count(*) from career_applications
       where mobile = v_mobile and created_at > now() - interval '1 hour') >= 6 then
    return jsonb_build_object('ok', true, 'note', 'already_received');
  end if;

  insert into career_applications (
    role_key, role_label, full_name, mobile, email, city, experience, message,
    referral_code, source_url, consent
  ) values (
    v_role, nullif(v_label, ''), v_name, v_mobile, v_email, v_city, v_exp, v_msg,
    v_ref, nullif(left(coalesce(p_source_url, ''), 500), ''), coalesce(p_consent, false)
  );

  -- 'lead' rather than a new 'career' type: `notifications.type` has no check
  -- constraint, so a new value would be accepted here and then meet a switch in
  -- the app that has never heard of it. Reusing a type the clients already
  -- render is the safe half of this change; the title says what it is.
  perform notify_admins(
    'lead',
    'Job application from the website',
    v_name || ' (+91' || v_mobile || ') applied for ' || coalesce(nullif(v_label, ''), v_role) || '.',
    jsonb_build_object('source', 'website_careers', 'role_key', v_role)
  );

  return jsonb_build_object('ok', true);
end;
$$;

-- ⚠️ `revoke from public` ALONE DOES NOT CLOSE A FUNCTION — a grant made
-- directly to `anon` or `authenticated` survives it. Both are named explicitly
-- everywhere in this file for that reason.
revoke all on function public.website_career_apply(text, text, text, text, text, text, text, text, text, text, boolean) from public;
grant execute on function public.website_career_apply(text, text, text, text, text, text, text, text, text, text, boolean) to anon, authenticated;

-- ============================================================================
-- THE DESK — moving an application along its pipeline
-- ============================================================================
create or replace function public.admin_review_career_application(
  p_id     uuid,
  p_status text,
  p_reason text default null
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_app career_applications%rowtype;
begin
  -- SECURITY DEFINER, so this guard is the whole protection. Without it any
  -- signed-in account could move anybody's application by RPC.
  if not public.is_super_admin() then
    return jsonb_build_object('ok', false, 'error', 'Not authorised.');
  end if;

  if p_status not in ('new', 'shortlisted', 'contacted', 'declined') then
    return jsonb_build_object('ok', false, 'error', 'Unknown status.');
  end if;

  select * into v_app from career_applications where id = p_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Application not found.');
  end if;

  -- ⚠️ NO "already reviewed" GUARD, unlike 0092. That one is a one-way grant so
  -- a second approval had to be refused; this is a pipeline and a desk must be
  -- able to walk a row backwards when somebody is contacted and then shortlisted
  -- again. Re-stamping `reviewed_at` on each move is the intended behaviour.
  update career_applications
     set status = p_status,
         review_reason = nullif(trim(coalesce(p_reason, '')), ''),
         reviewed_by = auth.uid(),
         reviewed_at = now()
   where id = p_id;

  -- Best-effort: the audit trail must never be the reason a decision fails.
  begin
    perform public.admin_log(
      'career_application_status', 'careers', p_id::text,
      coalesce(v_app.full_name, '') || ' → ' || p_status,
      jsonb_build_object('status', v_app.status),
      jsonb_build_object('status', p_status)
    );
  exception when others then null;
  end;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.admin_review_career_application(uuid, text, text) from public, anon;
grant execute on function public.admin_review_career_application(uuid, text, text) to authenticated;
