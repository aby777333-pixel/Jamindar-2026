-- ============================================================================
-- 0096 — PROJECT BANK ACCOUNTS + ADVANCE PAYMENTS
-- (owner, "jamin changes - 01-09-2026.docx", items 2 and 3)
--
--   2. "every single project need 2 bank account details included in add
--      properties page" — bank name, account no, IFSC, branch, account type.
--   3. Advance payment: the admin sets a MINIMUM advance per project; a buyer
--      pays it by transfer, enters the transaction id and uploads the proof;
--      the desk sees both, approves or rejects; the buyer sees Pending until
--      the desk decides; the desk keeps the history.
--
-- ⚠️ ADDITIVE. Two nullable/defaulted columns on properties, one new table,
-- one private bucket, four new RPCs. Nothing existing is dropped or altered.
--
-- 🚨 DELIBERATELY NOT `public.bookings` AND NOT A PLOT-STATUS CHANGE.
-- `bookings` fires trg_bazaar_process_booking, which accrues promoter
-- commission on insert — a buyer's self-reported transfer must never do that.
-- Approving an advance here changes ONLY the payment's status. Marking the
-- plot Booked stays the desk's explicit "Payment received" action on the
-- property drawer (admin_set_plot_status), exactly as before, so a typo'd
-- approval cannot take a plot off the market.
-- ============================================================================

-- ── 1. properties: the two bank accounts + the minimum advance ─────────────
-- bank_accounts is a jsonb ARRAY of up to two objects:
--   { bank_name, account_no, ifsc, branch, account_type, account_name? }
-- An array rather than ten flat columns so a third account later is data,
-- not a migration. The admin console writes it; the buyer app reads it on
-- the payment step so the buyer no longer has to wait for a call to learn
-- where to send the money.
alter table public.properties
  add column if not exists bank_accounts jsonb not null default '[]'::jsonb,
  add column if not exists min_advance_amount numeric(18,2);

comment on column public.properties.bank_accounts is
  'Up to two company bank accounts buyers pay this project''s advance into. [{bank_name,account_no,ifsc,branch,account_type}]';
comment on column public.properties.min_advance_amount is
  'Minimum advance a buyer must pay to reserve a plot in this project. Null = not offered.';

-- ── 2. the bucket ──────────────────────────────────────────────────────────
-- Modelled on `kyc` (0008): private, the buyer writes under their own uid
-- folder, and only the buyer or the desk can read it back. 10 MB and a
-- fixed mime list, same reasoning as career-uploads (0094).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'payment-proofs', 'payment-proofs', false, 10485760,
  array['image/jpeg','image/png','image/webp','image/heic','image/heif','application/pdf']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists payment_proofs_own on storage.objects;
create policy payment_proofs_own on storage.objects
  for all to authenticated
  using (bucket_id = 'payment-proofs' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'payment-proofs' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists payment_proofs_admin on storage.objects;
create policy payment_proofs_admin on storage.objects
  for all to authenticated
  using (bucket_id = 'payment-proofs' and public.is_super_admin())
  with check (bucket_id = 'payment-proofs' and public.is_super_admin());

-- ── 3. the table ───────────────────────────────────────────────────────────
create sequence if not exists public.advance_payment_seq;

create table if not exists public.advance_payments (
  id              uuid primary key default gen_random_uuid(),
  ref             text unique not null default ('AP' || to_char(nextval('public.advance_payment_seq'), 'FM000000')),
  property_id     uuid not null references public.properties(id) on delete cascade,
  plot            text,
  hold_id         uuid references public.plot_holds(id) on delete set null,
  buyer_id        uuid not null references public.profiles(id) on delete cascade,
  amount          numeric(18,2) not null check (amount > 0),
  method          text not null default 'bank' check (method in ('bank','upi')),
  transaction_id  text not null,
  proof_path      text,
  proof_name      text,
  proof_type      text,
  proof_size      integer,
  status          text not null default 'pending' check (status in ('pending','approved','rejected')),
  remarks         text,
  decided_by      uuid,
  decided_at      timestamptz,
  created_at      timestamptz not null default now()
);

create index if not exists advance_payments_buyer_idx    on public.advance_payments(buyer_id, created_at desc);
create index if not exists advance_payments_property_idx on public.advance_payments(property_id, created_at desc);
create index if not exists advance_payments_status_idx   on public.advance_payments(status, created_at desc);

alter table public.advance_payments enable row level security;

drop policy if exists advance_payments_own on public.advance_payments;
create policy advance_payments_own on public.advance_payments
  for select to authenticated using (buyer_id = auth.uid() or public.is_super_admin());

drop policy if exists advance_payments_admin on public.advance_payments;
create policy advance_payments_admin on public.advance_payments
  for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin());

grant select on public.advance_payments to authenticated;
grant usage on sequence public.advance_payment_seq to authenticated;
revoke all on public.advance_payments from anon;

-- ── 4. buyer: submit an advance payment ────────────────────────────────────
-- Insert-only through this RPC (there is no member INSERT policy), so every
-- row passes the same checks: signed in, a real property, the amount is at
-- least the project's minimum, a transaction id, and a proof path that lives
-- under the caller's own folder — the console mints a signed URL from what is
-- stored here, so the path is VALIDATED, never trusted.
create or replace function public.submit_advance_payment(
  p_property       uuid,
  p_amount         numeric,
  p_transaction_id text,
  p_plot           text default null,
  p_hold           uuid default null,
  p_method         text default 'bank',
  p_proof_path     text default null,
  p_proof_name     text default null,
  p_proof_type     text default null,
  p_proof_size     integer default null
) returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare
  prop   public.properties;
  v_txn  text := left(trim(coalesce(p_transaction_id, '')), 80);
  v_path text := nullif(trim(coalesce(p_proof_path, '')), '');
  v_hold uuid := p_hold;
  r      public.advance_payments;
begin
  if auth.uid() is null then
    raise exception 'Sign in to record a payment' using errcode = '28000';
  end if;
  if p_method not in ('bank','upi') then
    raise exception 'Unsupported payment method %', p_method using errcode = '22023';
  end if;

  select * into prop from public.properties where id = p_property;
  if not found then raise exception 'Property not found' using errcode = 'P0002'; end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Enter the amount you paid' using errcode = '22023';
  end if;
  if prop.min_advance_amount is not null and p_amount < prop.min_advance_amount then
    raise exception 'The minimum advance for this project is ₹%', to_char(prop.min_advance_amount, 'FM9,99,99,99,999')
      using errcode = '22023';
  end if;
  if length(v_txn) < 4 then
    raise exception 'Enter the transaction ID / UTR from your bank' using errcode = '22023';
  end if;

  if v_path is not null then
    if v_path !~ ('^' || auth.uid()::text || '/[A-Za-z0-9._-]{1,160}$') then
      raise exception 'That payment proof could not be accepted. Please attach it again.' using errcode = '22023';
    end if;
    if p_proof_type is null or p_proof_type not in
       ('image/jpeg','image/png','image/webp','image/heic','image/heif','application/pdf') then
      raise exception 'Attach a photo, screenshot or PDF of the payment' using errcode = '22023';
    end if;
  end if;

  -- a hold may be quoted, but only the caller's own live/confirmed one
  if v_hold is not null and not exists (
    select 1 from public.plot_holds h
     where h.id = v_hold and h.buyer_id = auth.uid() and h.property_id = p_property) then
    v_hold := null;
  end if;

  insert into public.advance_payments(
    property_id, plot, hold_id, buyer_id, amount, method, transaction_id,
    proof_path, proof_name, proof_type, proof_size)
  values (
    p_property, nullif(trim(coalesce(p_plot,'')),''), v_hold, auth.uid(), p_amount, p_method, v_txn,
    v_path, case when v_path is null then null else left(coalesce(p_proof_name,''),160) end,
    case when v_path is null then null else p_proof_type end,
    case when v_path is null then null else p_proof_size end)
  returning * into r;

  perform public.notify_admins(
    'advance_payment',
    'Advance payment ' || r.ref,
    'A buyer reports ₹' || to_char(r.amount, 'FM9,99,99,99,999') || ' paid for '
      || prop.title || coalesce(' (plot ' || r.plot || ')', '') || '. Txn ' || r.transaction_id || '.',
    jsonb_build_object('advance_id', r.id, 'ref', r.ref, 'property_id', p_property, 'plot', r.plot));

  return jsonb_build_object('id', r.id, 'ref', r.ref, 'status', r.status,
                            'amount', r.amount, 'createdAt', r.created_at);
end $$;

-- ── 5. desk: the queue ─────────────────────────────────────────────────────
create or replace function public.admin_advance_payments(p_status text default null)
returns table(
  id uuid, ref text, property_id uuid, property_title text, project_id text,
  plot text, hold_ref text, buyer_id uuid, full_name text, member_code text, mobile text,
  amount numeric, method text, transaction_id text,
  proof_path text, proof_name text, proof_type text, proof_size integer,
  status text, remarks text, decided_at timestamptz, created_at timestamptz)
language plpgsql stable security definer set search_path to 'public' as $$
begin
  if not public.is_super_admin() then raise exception 'not authorized'; end if;
  return query
  select a.id, a.ref, a.property_id, p.title, p.project_id,
         a.plot, h.ref, a.buyer_id, pr.full_name, pr.member_code, pr.mobile,
         a.amount, a.method, a.transaction_id,
         a.proof_path, a.proof_name, a.proof_type, a.proof_size,
         a.status, a.remarks, a.decided_at, a.created_at
    from public.advance_payments a
    join public.properties p on p.id = a.property_id
    join public.profiles pr on pr.id = a.buyer_id
    left join public.plot_holds h on h.id = a.hold_id
   where (p_status is null or a.status = p_status)
   order by (a.status = 'pending') desc, a.created_at desc
   limit 500;
end $$;

-- ── 6. desk: approve / reject ──────────────────────────────────────────────
-- A verdict, not a pipeline: once decided, a second decision is refused —
-- the buyer has already been told, and a silent flip would contradict it.
create or replace function public.admin_review_advance_payment(
  p_id uuid, p_action text, p_remarks text default null)
returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare
  a public.advance_payments;
  prop public.properties;
  v_status text;
begin
  if not public.is_super_admin() then
    return jsonb_build_object('ok', false, 'error', 'Not authorised.');
  end if;
  if p_action not in ('approve','reject') then
    return jsonb_build_object('ok', false, 'error', 'Unknown action.');
  end if;

  select * into a from public.advance_payments where id = p_id for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'Payment not found.'); end if;
  if a.status <> 'pending' then
    return jsonb_build_object('ok', false, 'error', 'Already ' || a.status || '.');
  end if;

  v_status := case when p_action = 'approve' then 'approved' else 'rejected' end;
  update public.advance_payments
     set status = v_status, remarks = nullif(trim(coalesce(p_remarks,'')),''),
         decided_by = auth.uid(), decided_at = now()
   where id = p_id;

  select * into prop from public.properties where id = a.property_id;

  perform public.notify_user(a.buyer_id, 'advance_payment_' || v_status,
    case when v_status = 'approved' then 'Advance payment approved' else 'Advance payment not accepted' end,
    case when v_status = 'approved'
         then 'Your advance of ₹' || to_char(a.amount, 'FM9,99,99,99,999') || ' for ' || coalesce(prop.title,'the project')
              || coalesce(' (plot ' || a.plot || ')', '') || ' is approved. Reference ' || a.ref || '.'
         else 'We could not verify your advance ' || a.ref || ' for ' || coalesce(prop.title,'the project')
              || coalesce('. ' || nullif(trim(coalesce(p_remarks,'')),''), '') || ' Please contact the sales desk.'
    end,
    jsonb_build_object('advance_id', a.id, 'ref', a.ref, 'property_id', a.property_id,
                       'plot', a.plot, 'status', v_status));

  begin
    perform public.admin_log('advance_payment.' || p_action, 'payments', a.id::text,
      a.ref || ' · ₹' || to_char(a.amount, 'FM9,99,99,99,999') || ' · ' || coalesce(prop.title,''),
      jsonb_build_object('status', 'pending'),
      jsonb_build_object('status', v_status, 'remarks', p_remarks));
  exception when others then null;
  end;

  return jsonb_build_object('ok', true, 'status', v_status);
end $$;

-- ── 7. desk: open the proof (audited, like admin_career_attachment) ────────
create or replace function public.admin_advance_payment_proof(p_id uuid)
returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare a public.advance_payments;
begin
  if not public.is_super_admin() then
    return jsonb_build_object('ok', false, 'error', 'Not authorised.');
  end if;
  select * into a from public.advance_payments where id = p_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'Payment not found.'); end if;
  if a.proof_path is null then return jsonb_build_object('ok', false, 'error', 'No proof was attached.'); end if;
  begin
    perform public.admin_log('advance_payment.proof_open', 'payments', a.id::text,
      a.ref || ' — ' || coalesce(a.proof_name, 'proof'), null, jsonb_build_object('path', a.proof_path));
  exception when others then null;
  end;
  return jsonb_build_object('ok', true, 'path', a.proof_path, 'name', a.proof_name,
                            'type', a.proof_type, 'size', a.proof_size);
end $$;

-- ── grants: members call submit; the desk calls the other three ────────────
revoke execute on function public.submit_advance_payment(uuid, numeric, text, text, uuid, text, text, text, text, integer) from public, anon;
grant  execute on function public.submit_advance_payment(uuid, numeric, text, text, uuid, text, text, text, text, integer) to authenticated;
revoke execute on function public.admin_advance_payments(text) from public, anon;
grant  execute on function public.admin_advance_payments(text) to authenticated;
revoke execute on function public.admin_review_advance_payment(uuid, text, text) from public, anon;
grant  execute on function public.admin_review_advance_payment(uuid, text, text) to authenticated;
revoke execute on function public.admin_advance_payment_proof(uuid) from public, anon;
grant  execute on function public.admin_advance_payment_proof(uuid) to authenticated;
