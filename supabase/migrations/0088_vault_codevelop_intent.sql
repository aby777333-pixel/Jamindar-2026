-- 0088 — "I want to co-develop a property".
--
-- A fifth Vault intent beside buy / rent / sell / lease. It is a REQUEST rather
-- than an offer: the visitor is proposing a partnership, not listing an asset,
-- so it belongs to `vault_request` and lands in `vault_requests`.
--
-- ⚠️ THE ENUM VALUE IS ADDED HERE AND USED IN 0089, NOT IN THIS FILE.
-- Postgres allows ALTER TYPE ... ADD VALUE inside a transaction from 12 on, but
-- the new label cannot be USED until that transaction commits. Splitting the
-- two is what keeps this migration replayable on a fresh database.
alter type vault_intent add value if not exists 'codevelop';

-- Five columns, nullable, and named for what they are.
--
-- ⚠️ They are NOT folded onto the existing generic text columns. `approx_size`
-- and `budget_range` would have taken the extent and the capital without a
-- schema change, and the admin console would then be showing "Budget range: 2
-- crore" on a record where nobody is buying anything. A column that means two
-- things is how a table stops being readable.
alter table public.vault_requests
  add column if not exists codev_role    text,
  add column if not exists codev_extent  text,
  add column if not exists codev_title   text,
  add column if not exists codev_capital text,
  add column if not exists codev_horizon text;

-- The discriminator the whole form turns on: the visitor either brings the land
-- or brings the money. Constrained rather than free text, because the admin
-- queue sorts by it.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'vault_requests_codev_role_chk'
  ) then
    alter table public.vault_requests
      add constraint vault_requests_codev_role_chk
      check (codev_role is null or codev_role in ('land', 'capital'));
  end if;
end $$;

comment on column public.vault_requests.codev_role is
  'Co-development only: land = the visitor owns the land, capital = the visitor brings money.';
comment on column public.vault_requests.codev_extent is
  'Co-development, land side: extent as the owner states it (cents / acres / sq ft).';
comment on column public.vault_requests.codev_title is
  'Co-development, land side: patta / EC / approval position, in the owner''s own words.';
comment on column public.vault_requests.codev_capital is
  'Co-development, capital side: the range the investor is willing to commit.';
comment on column public.vault_requests.codev_horizon is
  'Co-development, both sides: when they want to start or exit.';
