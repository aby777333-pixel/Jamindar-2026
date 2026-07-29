-- 0059 — Wallet & withdrawal approval workflow + admin pending-activity counts
-- (owner spec 29-07 evening).
--
-- Wallet model (kept additive — no change to the 0017/0056 income engine):
--   withdrawable = approved commissions + approved bazaar ledger rows
--   balance      = withdrawable − withdrawals in pending/approved/paid
-- Marking a withdrawal "paid" therefore deducts it from the wallet instantly
-- and permanently; declined requests release their hold automatically.
-- The wallet_withdrawals table itself is the auditable payout ledger
-- (who requested, who decided, when, remarks, payment details).

-- ── table ────────────────────────────────────────────────────────────────
create table if not exists public.wallet_withdrawals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  amount numeric not null check (amount > 0),
  method text not null default 'bank' check (method in ('bank','upi','other')),
  details jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending','approved','declined','paid')),
  remarks text,
  decided_by uuid references public.profiles(id),
  decided_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_wallet_wd_user on public.wallet_withdrawals(user_id, created_at desc);
create index if not exists idx_wallet_wd_status on public.wallet_withdrawals(status, created_at desc);

alter table public.wallet_withdrawals enable row level security;
drop policy if exists wd_select_own on public.wallet_withdrawals;
create policy wd_select_own on public.wallet_withdrawals
  for select using (user_id = auth.uid()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin'));
-- all writes go through the SECURITY DEFINER RPCs below

revoke all on public.wallet_withdrawals from anon;
grant select on public.wallet_withdrawals to authenticated;

-- ── internal helpers ─────────────────────────────────────────────────────
create or replace function public.bazaar_wallet_numbers(p_user uuid)
returns jsonb
language sql stable security definer set search_path to 'public'
as $$
  select jsonb_build_object(
    'withdrawable',
      coalesce((select sum(amount) from commissions where beneficiary_id = p_user and status = 'approved'), 0)
      + coalesce((select sum(amount) from bazaar_income_ledger where user_id = p_user and status = 'approved'), 0),
    'pending_income',
      coalesce((select sum(amount) from commissions where beneficiary_id = p_user and status = 'pending'), 0)
      + coalesce((select sum(amount) from bazaar_income_ledger where user_id = p_user and status = 'pending'), 0),
    'total_earnings',
      coalesce((select sum(amount) from commissions where beneficiary_id = p_user and status <> 'cancelled'), 0)
      + coalesce((select sum(amount) from bazaar_income_ledger where user_id = p_user and status <> 'rejected'), 0),
    'on_hold',
      coalesce((select sum(amount) from wallet_withdrawals where user_id = p_user and status in ('pending','approved')), 0),
    'withdrawn',
      coalesce((select sum(amount) from wallet_withdrawals where user_id = p_user and status = 'paid'), 0)
  );
$$;
revoke execute on function public.bazaar_wallet_numbers(uuid) from public, anon, authenticated;

-- ── promoter side ────────────────────────────────────────────────────────
create or replace function public.bazaar_wallet_summary()
returns jsonb
language plpgsql stable security definer set search_path to 'public'
as $$
declare
  me uuid := auth.uid();
  n jsonb;
  v_min numeric := coalesce((public.bazaar_cfg()->>'min_withdrawal')::numeric, 100);
begin
  if me is null then raise exception 'not authenticated'; end if;
  n := public.bazaar_wallet_numbers(me);
  return n || jsonb_build_object(
    'balance', greatest((n->>'withdrawable')::numeric - (n->>'on_hold')::numeric - (n->>'withdrawn')::numeric, 0),
    'min_withdrawal', v_min,
    'last_details', (select w.details || jsonb_build_object('method', w.method)
                       from wallet_withdrawals w where w.user_id = me order by w.created_at desc limit 1),
    'requests', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', w.id, 'amount', w.amount, 'method', w.method, 'status', w.status,
        'remarks', w.remarks, 'created_at', w.created_at, 'decided_at', w.decided_at, 'paid_at', w.paid_at)
        order by w.created_at desc)
      from (select * from wallet_withdrawals where user_id = me order by created_at desc limit 30) w), '[]'::jsonb)
  );
end $$;

create or replace function public.bazaar_request_withdrawal(p_amount numeric, p_method text default 'bank', p_details jsonb default '{}'::jsonb)
returns jsonb
language plpgsql security definer set search_path to 'public'
as $$
declare
  me uuid := auth.uid();
  n jsonb;
  v_balance numeric;
  v_min numeric := coalesce((public.bazaar_cfg()->>'min_withdrawal')::numeric, 100);
  v_row wallet_withdrawals;
  v_name text;
begin
  if me is null then raise exception 'not authenticated'; end if;
  if p_amount is null or p_amount <= 0 then return jsonb_build_object('ok', false, 'error', 'Enter a valid amount.'); end if;
  if p_method not in ('bank','upi','other') then p_method := 'other'; end if;
  n := public.bazaar_wallet_numbers(me);
  v_balance := greatest((n->>'withdrawable')::numeric - (n->>'on_hold')::numeric - (n->>'withdrawn')::numeric, 0);
  if p_amount < v_min then
    return jsonb_build_object('ok', false, 'error', 'Minimum withdrawal is ' || v_min::text || '.');
  end if;
  if p_amount > v_balance then
    return jsonb_build_object('ok', false, 'error', 'Amount exceeds your available balance.');
  end if;

  insert into wallet_withdrawals (user_id, amount, method, details)
  values (me, p_amount, p_method, coalesce(p_details, '{}'::jsonb))
  returning * into v_row;

  select coalesce(full_name, member_code, 'A promoter') into v_name from profiles where id = me;
  insert into notifications (user_id, type, title, body, meta)
  select p.id, 'withdrawal_request', 'New withdrawal request',
         v_name || ' requested a withdrawal of ' || p_amount::text || '.',
         jsonb_build_object('withdrawal_id', v_row.id, 'user_id', me, 'amount', p_amount)
  from profiles p where p.role = 'super_admin';

  return jsonb_build_object('ok', true, 'id', v_row.id, 'balance', v_balance - p_amount);
end $$;

-- ── admin side ───────────────────────────────────────────────────────────
create or replace function public.bazaar_admin_withdrawals(p_status text default null)
returns table(id uuid, user_id uuid, full_name text, member_code text, mobile text,
              amount numeric, method text, details jsonb, status text, remarks text,
              balance numeric, withdrawn numeric, created_at timestamptz,
              decided_at timestamptz, paid_at timestamptz)
language plpgsql stable security definer set search_path to 'public'
as $$
begin
  if not exists (select 1 from profiles where profiles.id = auth.uid() and role = 'super_admin') then
    raise exception 'not authorized';
  end if;
  return query
  select w.id, w.user_id, pr.full_name, pr.member_code, pr.mobile,
         w.amount, w.method, w.details, w.status, w.remarks,
         greatest((n->>'withdrawable')::numeric - (n->>'on_hold')::numeric - (n->>'withdrawn')::numeric, 0) as balance,
         (n->>'withdrawn')::numeric as withdrawn,
         w.created_at, w.decided_at, w.paid_at
  from wallet_withdrawals w
  join profiles pr on pr.id = w.user_id
  cross join lateral (select public.bazaar_wallet_numbers(w.user_id) as n) x
  where (p_status is null or w.status = p_status)
  order by (w.status = 'pending') desc, w.created_at desc
  limit 200;
end $$;

create or replace function public.bazaar_admin_withdrawal_action(p_id uuid, p_action text, p_remarks text default null)
returns jsonb
language plpgsql security definer set search_path to 'public'
as $$
declare
  me uuid := auth.uid();
  v_row wallet_withdrawals;
begin
  if not exists (select 1 from profiles where profiles.id = me and role = 'super_admin') then
    raise exception 'not authorized';
  end if;
  select * into v_row from wallet_withdrawals where id = p_id for update;
  if v_row.id is null then return jsonb_build_object('ok', false, 'error', 'Request not found.'); end if;

  if p_action = 'approve' then
    if v_row.status <> 'pending' then return jsonb_build_object('ok', false, 'error', 'Only pending requests can be approved.'); end if;
    update wallet_withdrawals set status = 'approved', remarks = coalesce(p_remarks, remarks),
           decided_by = me, decided_at = now() where id = p_id;
    insert into notifications (user_id, type, title, body, meta) values
      (v_row.user_id, 'withdrawal_update', 'Withdrawal approved',
       'Your withdrawal of ' || v_row.amount::text || ' has been approved and will be paid shortly.' ||
       coalesce(' Note: ' || p_remarks, ''),
       jsonb_build_object('withdrawal_id', p_id, 'status', 'approved'));
  elsif p_action = 'decline' then
    if v_row.status not in ('pending','approved') then return jsonb_build_object('ok', false, 'error', 'This request was already settled.'); end if;
    update wallet_withdrawals set status = 'declined', remarks = coalesce(p_remarks, remarks),
           decided_by = me, decided_at = now() where id = p_id;
    insert into notifications (user_id, type, title, body, meta) values
      (v_row.user_id, 'withdrawal_update', 'Withdrawal declined',
       'Your withdrawal of ' || v_row.amount::text || ' was declined.' || coalesce(' Reason: ' || p_remarks, ''),
       jsonb_build_object('withdrawal_id', p_id, 'status', 'declined'));
  elsif p_action = 'paid' then
    if v_row.status not in ('pending','approved') then return jsonb_build_object('ok', false, 'error', 'This request was already settled.'); end if;
    update wallet_withdrawals set status = 'paid', remarks = coalesce(p_remarks, remarks),
           decided_by = coalesce(decided_by, me), decided_at = coalesce(decided_at, now()), paid_at = now()
     where id = p_id;
    insert into notifications (user_id, type, title, body, meta) values
      (v_row.user_id, 'withdrawal_update', 'Withdrawal paid 🎉',
       'Your withdrawal of ' || v_row.amount::text || ' has been paid. The amount has been deducted from your wallet.',
       jsonb_build_object('withdrawal_id', p_id, 'status', 'paid'));
  else
    return jsonb_build_object('ok', false, 'error', 'Unknown action.');
  end if;

  return jsonb_build_object('ok', true, 'id', p_id, 'status',
    (select status from wallet_withdrawals where id = p_id));
end $$;

-- ── smart activity counts for nav badges (web + app) ─────────────────────
create or replace function public.admin_pending_counts()
returns jsonb
language plpgsql stable security definer set search_path to 'public'
as $$
begin
  if not exists (select 1 from profiles where profiles.id = auth.uid() and role = 'super_admin') then
    raise exception 'not authorized';
  end if;
  return jsonb_build_object(
    'kyc',         (select count(*) from kyc_submissions where status = 'pending'),
    'submissions', (select count(*) from property_submissions where status = 'submitted'),
    'visits',      (select count(*) from site_visits where status = 'requested'),
    'leads',       (select count(*) from leads where status = 'new'),
    'partners',    (select count(*) from profiles where partner_status = 'pending'),
    'withdrawals', (select count(*) from wallet_withdrawals where status = 'pending'),
    'community',   (select count(*) from community_reports where status = 'open'),
    'invites',     (select count(*) from referral_wa_requests where status = 'new')
  );
end $$;

-- ── grants ───────────────────────────────────────────────────────────────
revoke execute on function public.bazaar_wallet_summary() from public, anon;
revoke execute on function public.bazaar_request_withdrawal(numeric, text, jsonb) from public, anon;
revoke execute on function public.bazaar_admin_withdrawals(text) from public, anon;
revoke execute on function public.bazaar_admin_withdrawal_action(uuid, text, text) from public, anon;
revoke execute on function public.admin_pending_counts() from public, anon;
grant execute on function public.bazaar_wallet_summary() to authenticated;
grant execute on function public.bazaar_request_withdrawal(numeric, text, jsonb) to authenticated;
grant execute on function public.bazaar_admin_withdrawals(text) to authenticated;
grant execute on function public.bazaar_admin_withdrawal_action(uuid, text, text) to authenticated;
grant execute on function public.admin_pending_counts() to authenticated;
