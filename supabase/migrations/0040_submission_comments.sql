-- 0040_submission_comments.sql
-- Additive: free-text comments the promoter writes for the admin review team
-- on a property submission (owner request 2026-07-28). No RLS/grant changes —
-- column inherits the table's existing policies.
alter table public.property_submissions add column if not exists comments text;
