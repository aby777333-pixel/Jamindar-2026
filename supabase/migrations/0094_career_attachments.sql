-- ============================================================================
-- 0094 — CAREER ATTACHMENTS (owner, 2026-08-23: "add upload image, resume,
-- word, as optional in everything. make admin and storage provisions also")
--
-- One private bucket, four nullable columns, and four new parameters on an
-- existing RPC. Optional everywhere: an application with no file is exactly as
-- valid as it was yesterday.
--
-- ⚠️ ADDITIVE, with ONE exception that is called out below and is not additive:
-- `website_career_apply` is DROPPED and recreated. Read that note before
-- running this.
-- ============================================================================

-- ── THE BUCKET ─────────────────────────────────────────────────────────────
-- Modelled on `vault`, which is the only other bucket on this project that an
-- ANONYMOUS visitor writes to. Two differences, both tighter:
--
--   • `allowed_mime_types` is set. The vault's is null, meaning anything. Here
--     the owner asked for images, a resume and Word, so the list IS the
--     feature — it is also what stops the bucket becoming a general file drop.
--   • 10 MB rather than 25. A CV is a few hundred KB and a phone photo is
--     under 8; anything larger is a mistake or an experiment.
--
-- ⚠️ THE PROJECT-WIDE CAP SITS IN FRONT OF THIS NUMBER AND DEFAULTS TO 50 MB
-- (Kong, Settings → Storage). 10 MB is comfortably under it, so uploads cannot
-- 413 at the gateway. If this limit is ever raised past 50 MB, the gateway has
-- to be raised first or the failure looks like a bucket problem and is not.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'career-uploads', 'career-uploads', false, 10485760,
  array[
    'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- 🚨 INSERT ONLY, AND NO UPDATE OR DELETE FOR ANYBODY BUT THE DESK.
-- An applicant needs to put one file in and never needs to touch it again.
-- Without that asymmetry the bucket is writable storage on the open internet:
-- with UPDATE, a second caller could overwrite a real applicant's CV at a path
-- they had guessed; with DELETE they could remove it.
drop policy if exists career_uploads_insert on storage.objects;
create policy career_uploads_insert on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'career-uploads');

-- ⚠️ NO ANON SELECT. The bucket is private, so the file is reachable only
-- through a signed URL the admin console mints. An applicant cannot read back
-- even their own upload, which is correct: they know what they sent, and a
-- readable path would make the bucket enumerable.
drop policy if exists career_uploads_admin_read on storage.objects;
create policy career_uploads_admin_read on storage.objects
  for select to authenticated
  using (bucket_id = 'career-uploads' and public.is_super_admin());

drop policy if exists career_uploads_admin_write on storage.objects;
create policy career_uploads_admin_write on storage.objects
  for all to authenticated
  using (bucket_id = 'career-uploads' and public.is_super_admin())
  with check (bucket_id = 'career-uploads' and public.is_super_admin());

-- ── THE COLUMNS ────────────────────────────────────────────────────────────
-- All nullable. The name and type are stored as the browser reported them so
-- the desk can show "Ravi-CV.pdf" rather than a uuid, and the size so an
-- obviously empty file is visible before anybody downloads it.
alter table public.career_applications
  add column if not exists attachment_path text,
  add column if not exists attachment_name text,
  add column if not exists attachment_type text,
  add column if not exists attachment_size integer;

-- ============================================================================
-- THE WRITE — same function, four more optional parameters
--
-- 🚨 DROPPED AND RECREATED, NOT `create or replace`. Adding parameters CHANGES
-- THE SIGNATURE, and `create or replace` would therefore have left the 11-arg
-- version in place beside a new 15-arg one. Two overloads differing only by
-- trailing defaulted parameters make a named-argument call AMBIGUOUS, and
-- Postgres refuses it at call time — the live website's form would have begun
-- failing the moment this ran, with an error nobody would connect to a
-- migration about attachments.
--
-- ⚠️ THE DROP IS SAFE TO RUN BEFORE THE SITE IS DEPLOYED, and that ordering is
-- deliberate: the new function still accepts the OLD call exactly, because
-- every added parameter has a default. So the currently-live page keeps working
-- against it, and the deploy that starts sending attachments can follow at any
-- time. Migrate first, deploy second — never the reverse, or the page sends
-- four parameters the database has never heard of.
-- ============================================================================
drop function if exists public.website_career_apply(
  text, text, text, text, text, text, text, text, text, text, boolean);

create function public.website_career_apply(
  p_role_key    text,
  p_role_label  text,
  p_name        text,
  p_mobile      text,
  p_email       text default null,
  p_city        text default null,
  p_experience  text default null,
  p_message     text default null,
  p_ref         text default null,
  p_source_url  text default null,
  p_consent     boolean default false,
  p_file_path   text default null,
  p_file_name   text default null,
  p_file_type   text default null,
  p_file_size   integer default null
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
  v_path   text := nullif(trim(coalesce(p_file_path, '')), '');
  v_fname  text := nullif(left(trim(coalesce(p_file_name, '')), 160), '');
  v_ftype  text := nullif(lower(trim(coalesce(p_file_type, ''))), '');
  v_fsize  integer := p_file_size;
begin
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

  -- 🚨 THE PATH IS VALIDATED, NOT TRUSTED. The browser uploads the file and
  -- then tells this function where it went, so without a shape check a crafted
  -- request could record a path pointing at some other bucket's object — and
  -- the admin console, which mints a signed URL from whatever is stored here,
  -- would hand it out. The pattern is exactly what the client writes:
  -- `careers/<uuid>/<filename>`.
  if v_path is not null then
    if v_path !~ '^careers/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[A-Za-z0-9._-]{1,160}$' then
      return jsonb_build_object('ok', false, 'error', 'That attachment could not be accepted. Please try again without it.');
    end if;
    -- Belt and braces: the bucket enforces both of these too, but the bucket
    -- cannot stop a row CLAIMING a 900 MB PDF that was never uploaded.
    if v_ftype is null or v_ftype not in (
      'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
      'application/pdf', 'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ) then
      return jsonb_build_object('ok', false, 'error', 'Please attach an image, a PDF or a Word document.');
    end if;
    if v_fsize is null or v_fsize <= 0 or v_fsize > 10485760 then
      return jsonb_build_object('ok', false, 'error', 'That file is too large. Please keep it under 10 MB.');
    end if;
  else
    -- No path means no attachment, whatever else was sent alongside.
    v_fname := null; v_ftype := null; v_fsize := null;
  end if;

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
    referral_code, source_url, consent,
    attachment_path, attachment_name, attachment_type, attachment_size
  ) values (
    v_role, nullif(v_label, ''), v_name, v_mobile, v_email, v_city, v_exp, v_msg,
    v_ref, nullif(left(coalesce(p_source_url, ''), 500), ''), coalesce(p_consent, false),
    v_path, v_fname, v_ftype, v_fsize
  );

  perform notify_admins(
    'lead',
    'Job application from the website',
    v_name || ' (+91' || v_mobile || ') applied for ' || coalesce(nullif(v_label, ''), v_role) || '.'
      || case when v_path is not null then ' Attachment included.' else '' end,
    jsonb_build_object('source', 'website_careers', 'role_key', v_role,
                       'has_attachment', v_path is not null)
  );

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.website_career_apply(
  text, text, text, text, text, text, text, text, text, text, boolean,
  text, text, text, integer) from public;
grant execute on function public.website_career_apply(
  text, text, text, text, text, text, text, text, text, text, boolean,
  text, text, text, integer) to anon, authenticated;

-- ============================================================================
-- THE DESK'S DOWNLOAD
--
-- The admin console could call `createSignedUrl` directly — it is signed in as
-- a super admin and the read policy above would allow it. It goes through this
-- function instead so that handing out a file is an AUDITED act rather than a
-- silent one: the same reason `admin_review_career_application` exists when a
-- direct update would also have worked.
--
-- ⚠️ It returns the path, not the URL. Minting the signed URL needs the storage
-- API, which SQL cannot reach; the console signs the path this returns. What
-- this adds is the authorisation check and the audit row, both of which happen
-- before the console ever learns the path.
-- ============================================================================
create or replace function public.admin_career_attachment(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_app career_applications%rowtype;
begin
  if not public.is_super_admin() then
    return jsonb_build_object('ok', false, 'error', 'Not authorised.');
  end if;

  select * into v_app from career_applications where id = p_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Application not found.');
  end if;
  if v_app.attachment_path is null then
    return jsonb_build_object('ok', false, 'error', 'No attachment on that application.');
  end if;

  begin
    perform public.admin_log(
      'career_attachment_open', 'careers', p_id::text,
      coalesce(v_app.full_name, '') || ' — ' || coalesce(v_app.attachment_name, 'file'),
      null, jsonb_build_object('path', v_app.attachment_path)
    );
  exception when others then null;
  end;

  return jsonb_build_object(
    'ok', true,
    'path', v_app.attachment_path,
    'name', v_app.attachment_name,
    'type', v_app.attachment_type,
    'size', v_app.attachment_size
  );
end;
$$;

revoke all on function public.admin_career_attachment(uuid) from public, anon;
grant execute on function public.admin_career_attachment(uuid) to authenticated;
