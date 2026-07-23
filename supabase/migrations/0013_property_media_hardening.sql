-- 0013_property_media_hardening.sql
-- Clear the advisor findings introduced by 0012. Non-breaking.
--   • trigger functions should not be callable as RPCs → revoke PUBLIC execute
--   • public 'property-media' bucket: drop the broad object-listing SELECT
--     policy (public object URLs still serve without it; only enumeration is
--     removed). Admins keep full access via propmedia_admin.
--   • re-assert admin RPCs are not anon-callable.

revoke execute on function public.sync_property_media() from public;
revoke execute on function public.guard_protected_profile_cols() from public;

drop policy if exists propmedia_read on storage.objects;

revoke execute on function public.admin_review_kyc(uuid, text, text, text) from anon, public;
revoke execute on function public.admin_review_partner(uuid, text, text)   from anon, public;
grant  execute on function public.admin_review_kyc(uuid, text, text, text) to authenticated;
grant  execute on function public.admin_review_partner(uuid, text, text)   to authenticated;
