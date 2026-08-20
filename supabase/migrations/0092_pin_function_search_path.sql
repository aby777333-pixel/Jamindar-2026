-- 0092 — pin `search_path` on the six functions that were still resolving names
-- against whatever the caller happened to have set.
--
-- ⚠️ THIS IS HARDENING, NOT A PATCH FOR A LIVE HOLE. Read this before deciding
-- how urgently to ship it, because the honest severity is lower than
-- "search_path" usually implies:
--
--   * All six are SECURITY INVOKER. They run as the caller, with the caller's
--     rights, so a hijacked name buys an attacker nothing they did not already
--     have. Every SECURITY DEFINER function in this database — the ones where
--     this WOULD be an escalation — already pins its search_path, and 0092
--     deliberately does not touch them.
--   * `anon`, `authenticated` and `service_role` have all had CREATE on `public`
--     revoked, and PostgreSQL never searches the temp schema for function or
--     operator names. There is currently no schema in which a client role could
--     plant a shadowing object in the first place.
--
-- So why do it at all? Because both of those are *environmental* facts, not
-- properties of these functions. The day someone grants CREATE for a migration
-- tool, or adds an unqualified reference to a body below, the exposure appears
-- silently and nothing fails loudly to announce it. Pinning the path costs
-- nothing and removes the dependency on staying lucky.
--
-- WHY `ALTER` AND NOT `CREATE OR REPLACE`: `is_super_admin_mobile` is redefined
-- by four separate migrations (0004, 0029, 0042, 0045, 0054) because the admin
-- allowlist keeps changing. Restating a body here would mean this file silently
-- disagreeing with 0054 the next time a number is added. ALTER changes only the
-- configuration and cannot drift from whatever the body currently is.
--
-- WHY `public, pg_temp` AND NOT JUST `public`: naming pg_temp explicitly forces
-- it to be searched LAST. Left out of the list entirely it is searched FIRST for
-- relation names — the opposite of what is wanted. Only `blog_slug_redirect`
-- reads a table at all and it already qualifies it as `public.blog_redirects`,
-- so this changes no lookup that happens today; it constrains the ones that
-- might be written tomorrow.
--
-- ⚠️ A FUTURE `CREATE OR REPLACE` OF ANY OF THESE SIX SILENTLY UNDOES THIS.
-- PostgreSQL assigns every unspecified property its default on replace, so a
-- body rewritten without a SET clause drops the pin and re-raises the advisor
-- warning. Anyone redefining these must carry `set search_path to 'public',
-- 'pg_temp'` on the new definition — in particular the next allowlist change to
-- `is_super_admin_mobile`.
--
-- Behaviour is unchanged: no body is touched, no volatility or ownership
-- changes, and every name these six resolve is either schema-qualified already
-- or lives in pg_catalog, which is searched ahead of search_path regardless.

alter function public.touch_updated_at()          set search_path to 'public', 'pg_temp';
alter function public.is_super_admin_mobile(text) set search_path to 'public', 'pg_temp';
alter function public.enforce_super_admin_role()  set search_path to 'public', 'pg_temp';
alter function public.community_mask(text)        set search_path to 'public', 'pg_temp';
alter function public.blog_touch_updated_at()     set search_path to 'public', 'pg_temp';
alter function public.blog_slug_redirect()        set search_path to 'public', 'pg_temp';
