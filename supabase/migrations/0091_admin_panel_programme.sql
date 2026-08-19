-- 0091 — the Jamin Bazaar admin panel programme (owner spec, 2026-08-17).
--
-- Applied to the live project on 2026-08-19 as nine separate migrations through
-- the Supabase migration API; this file is the consolidated, final form of all
-- of them so a fresh database comes up identical to production. It is written
-- to be re-runnable.
--
-- WHAT IS DELIBERATELY *NOT* HERE, and why:
--   · `commission_config` is untouched. It is the GLOBAL commission ladder and
--     the money path (admin_set_commission, commissions) reads it. The new
--     `property_referral_levels` is a per-project table that nothing existing
--     reads, so adding it cannot move a single payout.
--   · `properties.plot_layout` remains the one and only plot store. The spec
--     asks for a plot list with per-plot detail; that is served by adding keys
--     to the rows of this jsonb array, because it already holds the traced DTCP
--     plan geometry (block, poly, at, clipped) that draws the public site plan.
--     A separate plots table would have meant migrating 77 live rows, changing
--     the public website, and keeping two stores in step for ever.
--   · `properties.documents` (jsonb) is untouched — the app and the website both
--     read it. `project_documents` is the managed store beside it.

-- ── §1/§3 the Excel columns that had no home on `properties` ────────────────
-- Twelve of the sheet's seventeen columns already map onto existing columns.
-- Only these five are new; all nullable with no default, so existing rows and
-- every existing read path are unchanged.
alter table public.properties
  add column if not exists project_id            text,
  add column if not exists total_sqft            numeric,
  add column if not exists price_per_sqft        numeric,
  add column if not exists offer_price_per_sqft  numeric,
  add column if not exists commission_type       text;

comment on column public.properties.project_id is
  'Owner-facing project code from the Excel import (sheet column "Project ID"). Unique when present; the key the importer matches on to decide create vs update.';
comment on column public.properties.total_sqft is 'Excel "Total SQRT" — saleable extent of the whole project.';
comment on column public.properties.price_per_sqft is 'Excel "per sqrt price" — the standard rate.';
comment on column public.properties.offer_price_per_sqft is 'Excel "Offer per Sqrt price" — the launch rate.';
comment on column public.properties.commission_type is 'Excel "Commission Type", normalised to rupees|percent; the sheet spells these "Rupess"/"Percetage".';

alter table public.properties drop constraint if exists properties_commission_type_check;
alter table public.properties
  add constraint properties_commission_type_check
  check (commission_type is null or commission_type in ('rupees','percent'));

-- §1.6 duplicate Project IDs are refused by the database, not only the browser.
-- Partial, so the many rows with no code yet do not collide with each other.
create unique index if not exists properties_project_id_key
  on public.properties (project_id) where project_id is not null;

-- §26 indexes for frequently searched fields
create index if not exists properties_status_idx  on public.properties (status);
create index if not exists properties_created_idx on public.properties (created_at desc);

-- ── §23 audit trail ────────────────────────────────────────────────────────
-- Schema-light on purpose: module + record_id + before/after jsonb covers every
-- action the spec lists without a column per module.
create table if not exists public.admin_audit (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid references public.profiles(id) on delete set null,
  actor_name  text,                       -- denormalised: survives actor removal
  action      text not null,              -- 'kyc.approve', 'property.import', …
  module      text not null,
  record_id   text,                       -- text, not uuid: some ids are codes
  summary     text,
  old_value   jsonb,
  new_value   jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists admin_audit_created_idx on public.admin_audit (created_at desc);
create index if not exists admin_audit_module_idx  on public.admin_audit (module, created_at desc);
create index if not exists admin_audit_record_idx  on public.admin_audit (record_id);
create index if not exists admin_audit_actor_idx   on public.admin_audit (actor_id);

alter table public.admin_audit enable row level security;
drop policy if exists admin_audit_read  on public.admin_audit;
drop policy if exists admin_audit_write on public.admin_audit;
create policy admin_audit_read  on public.admin_audit for select using (public.is_super_admin());
-- Insert-only, and NO update or delete policy at all: an audit row an admin can
-- edit is not an audit row.
create policy admin_audit_write on public.admin_audit for insert with check (public.is_super_admin());

-- ── §2/§27 per-project referral levels ─────────────────────────────────────
create table if not exists public.property_referral_levels (
  id              uuid primary key default gen_random_uuid(),
  property_id     uuid not null references public.properties(id) on delete cascade,
  level           integer not null check (level >= 1),
  referral_type   text not null default 'indirect' check (referral_type in ('direct','indirect')),
  amount          numeric,                -- ₹ per sq ft when commission_type = rupees
  percent         numeric,                -- % of sale when commission_type = percent
  commission_type text check (commission_type is null or commission_type in ('rupees','percent')),
  min_qualifying_sale numeric,
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (property_id, level)
);
create index if not exists prl_property_idx on public.property_referral_levels (property_id, level);

alter table public.property_referral_levels enable row level security;
drop policy if exists prl_read  on public.property_referral_levels;
drop policy if exists prl_admin on public.property_referral_levels;
create policy prl_read  on public.property_referral_levels for select to authenticated using (true);
create policy prl_admin on public.property_referral_levels for all
  using (public.is_super_admin()) with check (public.is_super_admin());

-- ── §1 launch offers become per-project ────────────────────────────────────
-- Existing rows stay valid: property_id null still means "applies to
-- everything", which is what the live offers currently are.
alter table public.bazaar_launch_offers
  add column if not exists property_id uuid references public.properties(id) on delete cascade;
create index if not exists blo_property_idx on public.bazaar_launch_offers (property_id);
comment on column public.bazaar_launch_offers.property_id is
  'Null = platform-wide offer (the original behaviour). Set = the offer belongs to that project, as imported from the Excel sheet.';

-- ── §4/§8 project documents ────────────────────────────────────────────────
create table if not exists public.project_documents (
  id            uuid primary key default gen_random_uuid(),
  property_id   uuid not null references public.properties(id) on delete cascade,
  doc_type      text not null default 'other'
                check (doc_type in ('approval_plan','legal_opinion','approval_copy','sale_agreement','other')),
  name          text not null,
  file_url      text not null,
  storage_path  text,
  file_size     bigint,
  mime_type     text,
  version       integer not null default 1,
  on_request    boolean not null default false,
  is_public     boolean not null default true,
  status        text not null default 'active' check (status in ('active','archived')),
  uploaded_by   uuid references public.profiles(id) on delete set null,
  uploaded_at   timestamptz not null default now(),
  created_at    timestamptz not null default now()
);
create index if not exists pdoc_property_idx on public.project_documents (property_id, doc_type);
create index if not exists pdoc_status_idx   on public.project_documents (status);

alter table public.project_documents enable row level security;
drop policy if exists pdoc_read  on public.project_documents;
drop policy if exists pdoc_admin on public.project_documents;
-- Any signed-in member may see that a document EXISTS — that is what draws the
-- "Approval plan" / "Request document" control. Whether they may fetch the FILE
-- is decided by the storage policies further down, not by this row.
create policy pdoc_read  on public.project_documents for select to authenticated
  using (status = 'active' and is_public);
create policy pdoc_admin on public.project_documents for all
  using (public.is_super_admin()) with check (public.is_super_admin());

-- ── §8 the request workflow ────────────────────────────────────────────────
create table if not exists public.document_requests (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  property_id   uuid references public.properties(id) on delete set null,
  document_id   uuid references public.project_documents(id) on delete set null,
  doc_name      text,                -- denormalised: history survives a removed doc
  status        text not null default 'pending'
                check (status in ('pending','approved','rejected','downloaded')),
  note          text,
  review_reason text,
  reviewed_by   uuid references public.profiles(id) on delete set null,
  reviewed_at   timestamptz,
  downloaded_at timestamptz,
  requested_at  timestamptz not null default now(),
  created_at    timestamptz not null default now()
);
create index if not exists dreq_status_idx   on public.document_requests (status, requested_at desc);
create index if not exists dreq_user_idx     on public.document_requests (user_id, requested_at desc);
create index if not exists dreq_property_idx on public.document_requests (property_id);
-- One live request per member per document; asking again after a decision is
-- fine, which is why the index is partial.
create unique index if not exists dreq_open_unique
  on public.document_requests (user_id, document_id) where status = 'pending';

alter table public.document_requests enable row level security;
drop policy if exists dreq_own_read   on public.document_requests;
drop policy if exists dreq_own_insert on public.document_requests;
drop policy if exists dreq_own_update on public.document_requests;
drop policy if exists dreq_admin      on public.document_requests;
create policy dreq_own_read   on public.document_requests for select to authenticated
  using (user_id = auth.uid());
create policy dreq_own_insert on public.document_requests for insert to authenticated
  with check (user_id = auth.uid() and status = 'pending');
-- A member may mark only their OWN already-approved request as downloaded. The
-- USING half pins the row to one that is already approved, so they can never
-- move themselves to approved.
create policy dreq_own_update on public.document_requests for update to authenticated
  using (user_id = auth.uid() and status = 'approved')
  with check (user_id = auth.uid() and status in ('approved','downloaded'));
create policy dreq_admin on public.document_requests for all
  using (public.is_super_admin()) with check (public.is_super_admin());

-- ── §9/§12 KYC history ─────────────────────────────────────────────────────
create table if not exists public.kyc_history (
  id            uuid primary key default gen_random_uuid(),
  submission_id uuid references public.kyc_submissions(id) on delete cascade,
  user_id       uuid references public.profiles(id) on delete cascade,
  from_status   text,
  to_status     text,
  reason        text,
  corrections   text,
  actor_id      uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now()
);
create index if not exists kychist_sub_idx  on public.kyc_history (submission_id, created_at desc);
create index if not exists kychist_user_idx on public.kyc_history (user_id, created_at desc);

alter table public.kyc_history enable row level security;
drop policy if exists kychist_read  on public.kyc_history;
drop policy if exists kychist_admin on public.kyc_history;
create policy kychist_read  on public.kyc_history for select to authenticated using (user_id = auth.uid());
create policy kychist_admin on public.kyc_history for all
  using (public.is_super_admin()) with check (public.is_super_admin());

-- Captured by a trigger rather than inside admin_review_kyc, for two reasons:
-- the money-path RPC is left untouched, and a status change made by ANY path is
-- recorded just the same.
--
-- 🚨 It swallows its own failures on purpose. This is an audit side-effect
-- hanging off a user-facing write; it must never be the reason a KYC review
-- fails.
create or replace function public.kyc_history_capture()
returns trigger language plpgsql security definer set search_path to 'public' as $fn$
begin
  if tg_op = 'INSERT' then
    insert into public.kyc_history(submission_id, user_id, from_status, to_status, actor_id)
    values (new.id, new.user_id, null, new.status, auth.uid());
  elsif new.status is distinct from old.status then
    insert into public.kyc_history(submission_id, user_id, from_status, to_status, reason, corrections, actor_id)
    values (new.id, new.user_id, old.status, new.status, new.review_reason, new.review_corrections,
            coalesce(new.reviewed_by, auth.uid()));
  end if;
  return new;
exception when others then
  return new;
end $fn$;

drop trigger if exists kyc_history_capture_trg on public.kyc_submissions;
create trigger kyc_history_capture_trg
  after insert or update on public.kyc_submissions
  for each row execute function public.kyc_history_capture();

-- ── §22 the private document bucket ────────────────────────────────────────
-- "Sensitive documents and KYC files must not be publicly accessible through
-- predictable URLs." `property-media` is a PUBLIC bucket and stays that way for
-- brochures and photographs, which are meant to be shared. Legal opinions and
-- sale agreements are not.
--
-- 🚨 EVERY project document goes to this private bucket whatever its on-request
-- setting. That is what makes the §8 toggle a real switch: the two policies
-- below decide who may read an object, so flipping the toggle changes access
-- immediately with no file to move and no URL to invalidate.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('project-docs', 'project-docs', false, 26214400,
        array['application/pdf','image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

drop policy if exists projdocs_admin_all     on storage.objects;
drop policy if exists projdocs_approved_read on storage.objects;
drop policy if exists projdocs_open_read     on storage.objects;

create policy projdocs_admin_all on storage.objects for all to authenticated
  using (bucket_id = 'project-docs' and public.is_super_admin())
  with check (bucket_id = 'project-docs' and public.is_super_admin());

-- the "on request" half: an approved request is required
create policy projdocs_approved_read on storage.objects for select to authenticated
  using (
    bucket_id = 'project-docs'
    and exists (
      select 1
        from public.document_requests r
        join public.project_documents d on d.id = r.document_id
       where r.user_id = auth.uid()
         and r.status in ('approved','downloaded')
         and d.storage_path = storage.objects.name
    )
  );

-- the "open" half: an ungated document is readable by any signed-in member
create policy projdocs_open_read on storage.objects for select to authenticated
  using (
    bucket_id = 'project-docs'
    and exists (
      select 1 from public.project_documents d
       where d.storage_path = storage.objects.name
         and d.status = 'active' and d.is_public and not d.on_request
    )
  );

-- ── §23 one place that writes the audit trail ──────────────────────────────
create or replace function public.admin_log(
  p_action text, p_module text, p_record text default null,
  p_summary text default null, p_old jsonb default null, p_new jsonb default null)
returns uuid language plpgsql security definer set search_path to 'public' as $fn$
declare v_id uuid; v_name text;
begin
  if not public.is_super_admin() then raise exception 'not authorized'; end if;
  select full_name into v_name from profiles where id = auth.uid();
  insert into admin_audit(actor_id, actor_name, action, module, record_id, summary, old_value, new_value)
  values (auth.uid(), v_name, p_action, p_module, p_record, p_summary, p_old, p_new)
  returning id into v_id;
  return v_id;
end $fn$;
revoke execute on function public.admin_log(text,text,text,text,jsonb,jsonb) from public, anon;
grant  execute on function public.admin_log(text,text,text,text,jsonb,jsonb) to authenticated;

-- ── §8 approve / reject a document request ─────────────────────────────────
create or replace function public.admin_review_document_request(
  p_id uuid, p_decision text, p_reason text default null)
returns void language plpgsql security definer set search_path to 'public' as $fn$
declare v_row document_requests; v_title text;
begin
  if not public.is_super_admin() then raise exception 'not authorized'; end if;
  if p_decision not in ('approved','rejected') then raise exception 'invalid decision'; end if;
  -- §10 makes a reason mandatory on a KYC rejection; the same rule applies here,
  -- because a refused document with no reason is a support ticket.
  if p_decision = 'rejected' and coalesce(btrim(p_reason),'') = '' then
    raise exception 'a reason is required when rejecting a request';
  end if;

  update document_requests
     set status = p_decision, review_reason = p_reason, reviewed_by = auth.uid(), reviewed_at = now()
   where id = p_id
  returning * into v_row;
  if v_row.id is null then raise exception 'request not found'; end if;

  v_title := coalesce(v_row.doc_name, 'Document');
  insert into notifications(user_id, type, title, body, meta)
  values (v_row.user_id, 'document',
          case p_decision when 'approved' then v_title || ' approved'
                          else v_title || ' request declined' end,
          case p_decision when 'approved' then 'You can now download ' || v_title || ' from the project page.'
                          else coalesce(p_reason, 'Your request was not approved.') end,
          jsonb_build_object('request_id', p_id, 'document_id', v_row.document_id,
                             'property_id', v_row.property_id, 'decision', p_decision));

  perform public.admin_log('document_request.' || p_decision, 'documents', p_id::text,
                           v_title, null, jsonb_build_object('decision', p_decision, 'reason', p_reason));
end $fn$;
revoke execute on function public.admin_review_document_request(uuid,text,text) from public, anon;
grant  execute on function public.admin_review_document_request(uuid,text,text) to authenticated;

-- ── §20 dashboard statistics ───────────────────────────────────────────────
-- `bookings.status` only ever holds 'confirmed' or 'cancelled', so there is no
-- such thing as a pending booking; a sale that has not completed is a live hold
-- on a plot, which is what 'pending' counts. Plot counts come from the
-- `plot_layout` array, which remains the single source of truth for plots.
create or replace function public.admin_dashboard_stats()
returns jsonb language plpgsql stable security definer set search_path to 'public' as $fn$
declare v_plots jsonb;
begin
  if not public.is_super_admin() then raise exception 'not authorized'; end if;

  select jsonb_build_object(
    'total',     count(*),
    'available', count(*) filter (where coalesce(p->>'status','available') = 'available'),
    'reserved',  count(*) filter (where p->>'status' = 'reserved'),
    'sold',      count(*) filter (where p->>'status' = 'sold'),
    'blocked',   count(*) filter (where p->>'status' = 'blocked'))
    into v_plots
  from properties pr, lateral jsonb_array_elements(coalesce(pr.plot_layout, '[]'::jsonb)) p;

  return jsonb_build_object(
    'projects', jsonb_build_object(
      'total',     (select count(*) from properties),
      'active',    (select count(*) from properties where status = 'available'),
      'completed', (select count(*) from properties where project_phase = 'completed'),
      'draft',     (select count(*) from properties where status = 'draft'),
      'sold',      (select count(*) from properties where status = 'sold')),
    'plots', coalesce(v_plots, jsonb_build_object('total',0,'available',0,'reserved',0,'sold',0,'blocked',0)),
    'users', jsonb_build_object(
      'total',        (select count(*) from profiles),
      'new_30d',      (select count(*) from profiles where created_at > now() - interval '30 days'),
      'active',       (select count(*) from profiles where coalesce(is_active,true)),
      'promoters',    (select count(*) from profiles where role = 'promoter'),
      'buyers',       (select count(*) from profiles where role = 'buyer'),
      'kyc_pending',  (select count(*) from profiles where kyc_status = 'pending'),
      'kyc_approved', (select count(*) from profiles where kyc_status = 'approved'),
      'kyc_rejected', (select count(*) from profiles where kyc_status = 'rejected')),
    'sales', jsonb_build_object(
      'total',     (select count(*) from bookings),
      'value',     (select coalesce(sum(sale_amount),0) from bookings where status = 'confirmed'),
      'pending',   (select count(*) from plot_holds where status not in ('expired','released','cancelled')),
      'completed', (select count(*) from bookings where status = 'confirmed'),
      'cancelled', (select count(*) from bookings where status = 'cancelled')),
    'referral', jsonb_build_object(
      'total',      (select count(*) from profiles where referred_by is not null),
      'direct',     (select count(*) from commissions where level = 1),
      'indirect',   (select count(*) from commissions where level > 1),
      'commission', (select coalesce(sum(amount),0) from commissions),
      'pending',    (select coalesce(sum(amount),0) from commissions where status = 'pending')),
    'documents', jsonb_build_object(
      'requests_pending', (select count(*) from document_requests where status = 'pending'),
      'total',            (select count(*) from project_documents where status = 'active'))
  );
end $fn$;
revoke execute on function public.admin_dashboard_stats() from public, anon;
grant  execute on function public.admin_dashboard_stats() to authenticated;

-- ── §13/§27 the referral tree, to whatever depth the data actually has ─────
-- The depth is a parameter and empty levels simply do not appear, so a member
-- with four levels shows four and one with eight shows eight. The number five
-- is not written anywhere in here.
create or replace function public.admin_referral_tree(p_user uuid, p_levels integer default 10)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $fn$
declare v_out jsonb;
begin
  if not public.is_super_admin() then raise exception 'not authorized'; end if;

  with recursive walk as (
    select c.id, c.full_name, c.email, c.mobile, c.member_code, c.role::text as role,
           c.created_at, c.is_active, c.kyc_status, c.referred_by, 1 as lvl
      from profiles c
     where c.referred_by = p_user
    union all
    select c.id, c.full_name, c.email, c.mobile, c.member_code, c.role::text,
           c.created_at, c.is_active, c.kyc_status, c.referred_by, w.lvl + 1
      from profiles c
      join walk w on c.referred_by = w.id
     where w.lvl < greatest(1, least(p_levels, 20))   -- hard stop: a cycle cannot hang this
  )
  select coalesce(jsonb_agg(x order by x.lvl), '[]'::jsonb) into v_out
  from (
    select lvl,
           count(*) as members,
           count(*) filter (where coalesce(is_active,true)) as active,
           jsonb_agg(jsonb_build_object(
             'id', id, 'name', full_name, 'email', email, 'phone', mobile,
             'member_code', member_code, 'role', role, 'joined', created_at,
             'active', coalesce(is_active,true), 'kyc', kyc_status,
             'parent', referred_by) order by created_at) as people
      from walk group by lvl
  ) x;
  return v_out;
end $fn$;
revoke execute on function public.admin_referral_tree(uuid,integer) from public, anon;
grant  execute on function public.admin_referral_tree(uuid,integer) to authenticated;

-- ── §11–§17 one call for the whole user profile ────────────────────────────
-- Every list is capped. The profile drawer is a summary, not an export.
create or replace function public.admin_user_profile(p_user uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $fn$
declare v_p profiles; v_ref profiles;
begin
  if not public.is_super_admin() then raise exception 'not authorized'; end if;
  select * into v_p from profiles where id = p_user;
  if v_p.id is null then raise exception 'user not found'; end if;
  select * into v_ref from profiles where id = v_p.referred_by;

  return jsonb_build_object(
    'profile', to_jsonb(v_p) || jsonb_build_object(
      'referrer_name', v_ref.full_name, 'referrer_code', v_ref.member_code,
      'promoter', (select to_jsonb(pp) from promoter_profiles pp where pp.id = p_user)),

    'kyc', (select to_jsonb(k) from kyc_submissions k where k.user_id = p_user
             order by k.created_at desc limit 1),
    'kyc_history', (select coalesce(jsonb_agg(to_jsonb(h) order by h.created_at desc), '[]'::jsonb)
                      from kyc_history h where h.user_id = p_user),

    'referral', jsonb_build_object(
      'code',     coalesce(v_p.referral_code, v_p.member_code),
      'direct',   (select count(*) from profiles c where c.referred_by = p_user),
      'active',   (select count(*) from profiles c where c.referred_by = p_user and coalesce(c.is_active,true)),
      'inactive', (select count(*) from profiles c where c.referred_by = p_user and not coalesce(c.is_active,true)),
      'events',   (select count(*) from referral_events e where e.referrer_id = p_user)),

    'earnings', jsonb_build_object(
      'commission_total',   (select coalesce(sum(amount),0) from commissions where beneficiary_id = p_user),
      'commission_direct',  (select coalesce(sum(amount),0) from commissions where beneficiary_id = p_user and level = 1),
      'commission_indirect',(select coalesce(sum(amount),0) from commissions where beneficiary_id = p_user and level > 1),
      'commission_paid',    (select coalesce(sum(amount),0) from commissions where beneficiary_id = p_user and status = 'paid'),
      'commission_pending', (select coalesce(sum(amount),0) from commissions where beneficiary_id = p_user and status in ('pending','approved')),
      'incentives',         (select coalesce(sum(amount),0) from bazaar_income_ledger where user_id = p_user and status in ('approved','paid')),
      'withdrawn',          (select coalesce(sum(amount),0) from wallet_withdrawals where user_id = p_user and status = 'paid'),
      'withdraw_pending',   (select coalesce(sum(amount),0) from wallet_withdrawals where user_id = p_user and status in ('pending','approved'))),

    'transactions', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'at', t.at, 'ref', t.ref, 'source', t.source, 'level', t.level,
               'amount', t.amount, 'status', t.status, 'project', t.project)), '[]'::jsonb)
      from (
        select c.created_at as at, c.id::text as ref, 'Referral commission' as source,
               c.level as level, c.amount as amount, c.status as status,
               (select pr.title from bookings b join properties pr on pr.id = b.property_id
                 where b.id = c.booking_id) as project
          from commissions c where c.beneficiary_id = p_user
        union all
        select l.created_at, coalesce(l.reference_no, l.id::text), initcap(l.income_type),
               null::integer, l.amount, l.status, l.description
          from bazaar_income_ledger l where l.user_id = p_user
        union all
        select w.created_at, w.id::text, 'Withdrawal', null::integer, -w.amount, w.status, w.method
          from wallet_withdrawals w where w.user_id = p_user
        order by 1 desc limit 100
      ) t),

    'sales', (select coalesce(jsonb_agg(jsonb_build_object(
                'id', s.id, 'at', s.created_at, 'amount', s.sale_amount, 'sqft', s.sqft,
                'status', s.status, 'note', s.note, 'project', s.project,
                'project_code', s.project_code, 'side', s.side,
                'buyer_name', s.buyer_name, 'commission', s.commission)), '[]'::jsonb)
              from (
                select b.id, b.created_at, b.sale_amount, b.sqft, b.status, b.note,
                       pr.title as project, pr.project_id as project_code,
                       case when b.buyer_id = p_user then 'buyer' else 'promoter' end as side,
                       (select bp.full_name from profiles bp where bp.id = b.buyer_id) as buyer_name,
                       (select coalesce(sum(c.amount),0) from commissions c
                         where c.booking_id = b.id and c.beneficiary_id = p_user) as commission
                  from bookings b left join properties pr on pr.id = b.property_id
                 where b.buyer_id = p_user or b.seller_promoter_id = p_user
                 order by b.created_at desc limit 100) s),

    'community', jsonb_build_object(
      'posts',    (select count(*) from community_posts    where author_id = p_user),
      'comments', (select count(*) from community_comments where author_id = p_user),
      'likes',    (select count(*) from community_likes    where user_id  = p_user),
      'recent_posts', (select coalesce(jsonb_agg(jsonb_build_object(
                          'id', cp.id, 'body', left(cp.body, 240), 'status', cp.status,
                          'visibility', cp.visibility, 'created_at', cp.created_at,
                          'edited_at', cp.edited_at)), '[]'::jsonb)
                        from (select * from community_posts where author_id = p_user
                              order by created_at desc limit 25) cp),
      'recent_comments', (select coalesce(jsonb_agg(jsonb_build_object(
                          'id', cc.id, 'post_id', cc.post_id, 'body', left(cc.body, 200),
                          'status', cc.status, 'created_at', cc.created_at)), '[]'::jsonb)
                        from (select * from community_comments where author_id = p_user
                              order by created_at desc limit 25) cc)),

    'activity', (select coalesce(jsonb_agg(jsonb_build_object(
                   'at', a.created_at, 'event', a.event_type, 'meta', a.meta)), '[]'::jsonb)
                 from (select * from activity_log where user_id = p_user
                       order by created_at desc limit 100) a),

    'doc_requests', (select coalesce(jsonb_agg(jsonb_build_object(
                       'id', r.id, 'doc', r.doc_name, 'status', r.status,
                       'requested_at', r.requested_at, 'reviewed_at', r.reviewed_at,
                       'project', (select pr.title from properties pr where pr.id = r.property_id))
                       order by r.requested_at desc), '[]'::jsonb)
                     from document_requests r where r.user_id = p_user)
  );
end $fn$;
revoke execute on function public.admin_user_profile(uuid) from public, anon;
grant  execute on function public.admin_user_profile(uuid) to authenticated;

-- ── §10 activate / deactivate ──────────────────────────────────────────────
create or replace function public.admin_set_user_active(p_user uuid, p_active boolean)
returns void language plpgsql security definer set search_path to 'public' as $fn$
declare v_old boolean; v_name text; v_role text;
begin
  if not public.is_super_admin() then raise exception 'not authorized'; end if;
  select is_active, full_name, role::text into v_old, v_name, v_role from profiles where id = p_user;
  if v_role is null then raise exception 'user not found'; end if;
  if v_role = 'super_admin' then
    raise exception 'an administrator account cannot be deactivated from here';
  end if;
  perform set_config('app.allow_protected', 'on', true);
  update profiles set is_active = p_active where id = p_user;
  perform public.admin_log(case when p_active then 'user.activate' else 'user.deactivate' end,
                           'users', p_user::text, v_name,
                           jsonb_build_object('is_active', v_old),
                           jsonb_build_object('is_active', p_active));
end $fn$;
revoke execute on function public.admin_set_user_active(uuid,boolean) from public, anon;
grant  execute on function public.admin_set_user_active(uuid,boolean) to authenticated;

-- ── §18/§19 account removal ────────────────────────────────────────────────
-- 🚨 THIS REMOVES THE PERSON, NOT THE LEDGER, and that is a reading of the spec
-- rather than a shortcut around it. §18 itself says "do not blindly break
-- financial/accounting records" and to handle them "using the required
-- retention policy"; §19 says deletion must never orphan a user, invalidate a
-- parent id, or change a commission calculation.
--
-- The only way to satisfy both at once is to keep the ROW and destroy the
-- PERSON inside it:
--   · every identifying field is overwritten;
--   · the mobile becomes a tombstone, freeing the real number to register again
--     and making the old account impossible to sign into;
--   · the account is deactivated and its community writing withdrawn but
--     retained, which is what §16 asks for;
--   · commissions, bookings, the income ledger and withdrawals are UNTOUCHED;
--   · referred_by, on this row and every row beneath it, is UNTOUCHED — so the
--     tree keeps its exact shape and not one payout moves. §19 is satisfied by
--     construction rather than by repair: there is nothing to re-point, because
--     nothing was removed.
--
-- It is one function, so it is one transaction: a failure part-way leaves the
-- account exactly as it was.
create or replace function public.admin_delete_account(p_user uuid, p_confirm text)
returns jsonb language plpgsql security definer set search_path to 'public' as $fn$
declare v_p profiles; v_tomb text; v_posts int; v_comments int; v_reqs int;
begin
  if not public.is_super_admin() then raise exception 'not authorized'; end if;
  -- the admin has to type the word the confirmation dialog shows
  if coalesce(p_confirm,'') <> 'DELETE' then raise exception 'confirmation phrase missing'; end if;

  select * into v_p from profiles where id = p_user;
  if v_p.id is null then raise exception 'user not found'; end if;
  if v_p.role::text = 'super_admin' then raise exception 'an administrator account cannot be deleted from here'; end if;
  if v_p.full_name = 'Deleted user' then raise exception 'this account has already been removed'; end if;

  v_tomb := 'deleted-' || replace(p_user::text, '-', '');

  perform set_config('app.allow_protected', 'on', true);

  update profiles set
      full_name = 'Deleted user',
      email = null, mobile = v_tomb, avatar_url = null,
      city = null, district = null, state = null, pincode = null,
      dob = null, gender = null, is_active = false, acquisition_meta = null
    where id = p_user;

  update community_posts set status = 'removed'
    where author_id = p_user and status <> 'removed';
  get diagnostics v_posts = row_count;

  update community_comments set status = 'removed', deleted_at = now(), deleted_by = auth.uid()
    where author_id = p_user and coalesce(status,'published') <> 'removed';
  get diagnostics v_comments = row_count;

  update document_requests set status = 'rejected', review_reason = 'Account removed',
         reviewed_by = auth.uid(), reviewed_at = now()
    where user_id = p_user and status = 'pending';
  get diagnostics v_reqs = row_count;

  delete from notifications where user_id = p_user;

  perform public.admin_log('user.delete', 'users', p_user::text,
    coalesce(v_p.full_name,'user') || ' anonymised and deactivated',
    jsonb_build_object('full_name', v_p.full_name, 'email', v_p.email, 'mobile', v_p.mobile,
                       'member_code', v_p.member_code, 'role', v_p.role::text),
    jsonb_build_object('anonymised', true, 'posts_removed', v_posts,
                       'comments_removed', v_comments, 'requests_closed', v_reqs,
                       'financial_records', 'retained', 'referral_tree', 'unchanged'));

  return jsonb_build_object('ok', true, 'posts_removed', v_posts,
                            'comments_removed', v_comments, 'requests_closed', v_reqs);
end $fn$;
revoke execute on function public.admin_delete_account(uuid,text) from public, anon;
grant  execute on function public.admin_delete_account(uuid,text) to authenticated;
