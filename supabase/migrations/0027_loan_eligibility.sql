-- 0027 — Bank-loan eligibility on a listing.
-- Additive & non-breaking: new nullable/defaulted columns only.
--
-- lib/property-search.ts has parsed "loan eligible" out of a user's query since
-- it was written, but there was no column to filter on, so searchProperties
-- silently ignored the flag and hasSearchFilters did not even count it — asking
-- Jamindar for "loan eligible plots" fell through to chat instead of searching.
--
-- Jamin's own brochures advertise this ("80–90% Bank Loan Arranged"), so it
-- earns a real, indexable column rather than being buried in a jsonb blob.
alter table public.properties add column if not exists loan_eligible  boolean not null default false;
alter table public.properties add column if not exists loan_details    text;

comment on column public.properties.loan_eligible is
  'Listing is bank-loan eligible; drives the "loan eligible" search filter.';
comment on column public.properties.loan_details is
  'Free text shown with the badge, e.g. "80–90% bank loan arranged".';

-- partial index: the filter only ever selects the true rows
create index if not exists idx_properties_loan_eligible
  on public.properties (loan_eligible) where loan_eligible;
