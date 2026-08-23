-- ============================================================================
-- 0095 — CLOSE THE `anon` GRANT ON EIGHT ADMIN RPCs (audit, 2026-08-23)
--
-- Supabase's security advisor reports 50 `anon_security_definer_function_
-- executable` warnings on this project. Eight of them are `admin_*` functions
-- that sit on the money path: the commission ladder, marking a commission
-- paid, recording a booking, approving a submission, approving a promoter.
--
-- 🚨 NONE OF THEM WAS ACTUALLY EXPLOITABLE, AND THAT WAS VERIFIED RATHER THAN
-- ASSUMED. Each was called as the `anon` role inside a rolled-back transaction:
--
--     admin_set_commission              -> refused: not authorized
--     admin_mark_commission             -> refused: not authorized
--     admin_review_submission           -> refused: not authorized
--     admin_review_wa_request           -> refused: not authorized
--     admin_promoter_tree_summary       -> refused: not authorized
--     admin_promoter_tree_level         -> refused: not authorized
--     admin_record_booking              -> refused: not authorized
--     admin_review_promoter_application -> {"ok":false,"error":"Not authorised."}
--                                          (0 rows mutated — it RETURNS its
--                                          refusal rather than raising, which
--                                          is the website-facing contract)
--
-- So this migration removes a door that was already locked. It is worth doing
-- anyway: the guard is one `if` inside a SECURITY DEFINER function, and the
-- grant is what decides whether an unauthenticated stranger can reach that
-- `if` at all. Defence in depth costs nothing here because nothing anonymous
-- calls them.
--
-- ⚠️ EVERY CALL SITE IS `public/admin.html`, WHICH IS OTP-GATED. Grepped both
-- repos: the console is the only caller, the mobile app never calls these, and
-- the public website's single mention is a code comment. `authenticated` keeps
-- its grant, so the console is untouched.
--
-- ⚠️ `revoke ... from public` IS NOT ENOUGH AND IS NOT WHAT THIS DOES. A grant
-- made directly to the `anon` role survives a revoke from PUBLIC — the trap
-- this project has hit before. `anon` is named explicitly.
--
-- ⚠️ THE OTHER 42 anon-executable functions are LEFT ALONE ON PURPOSE. They are
-- the public surface the share pages, the v-card, the brochure redirect and the
-- website's own forms depend on — `share_page_data`, `community_public_feed`,
-- `card_inquiry`, `promoter_card`, `log_referral_click`, `website_enquiry` and
-- the rest. Revoking those to silence a warning would break live pages, which
-- is the opposite of an audit.
-- ============================================================================

revoke execute on function public.admin_set_commission(integer, numeric) from anon;
revoke execute on function public.admin_mark_commission(uuid, text) from anon;
revoke execute on function public.admin_review_submission(uuid, text, text) from anon;
revoke execute on function public.admin_review_wa_request(uuid, text) from anon;
revoke execute on function public.admin_review_promoter_application(uuid, text, text) from anon;
revoke execute on function public.admin_promoter_tree_summary(uuid) from anon;
revoke execute on function public.admin_promoter_tree_level(uuid, integer) from anon;
revoke execute on function public.admin_record_booking(uuid, numeric, uuid, uuid, numeric, text) from anon;

-- Re-assert the grant the console actually uses, so a future `revoke from
-- public` on any of these cannot take the working path down with it.
grant execute on function public.admin_set_commission(integer, numeric) to authenticated;
grant execute on function public.admin_mark_commission(uuid, text) to authenticated;
grant execute on function public.admin_review_submission(uuid, text, text) to authenticated;
grant execute on function public.admin_review_wa_request(uuid, text) to authenticated;
grant execute on function public.admin_review_promoter_application(uuid, text, text) to authenticated;
grant execute on function public.admin_promoter_tree_summary(uuid) to authenticated;
grant execute on function public.admin_promoter_tree_level(uuid, integer) to authenticated;
grant execute on function public.admin_record_booking(uuid, numeric, uuid, uuid, numeric, text) to authenticated;
