-- 0023 — Hardening for 0020–0022 (follows the 0007 / 0009 / 0013 habit).
--
-- `revoke execute ... from public` is NOT enough on Supabase: the platform sets
-- default privileges that grant EXECUTE on new public-schema functions directly
-- to `anon` and `authenticated`, and a revoke from PUBLIC does not remove an
-- explicit grant to a role. Without this file, any caller could invoke
-- `notify_user(<any uuid>, …)` and push arbitrary notifications to any account.
--
-- Internal helpers are revoked from both roles. Calls made from inside a
-- SECURITY DEFINER function still work, because the effective user there is the
-- function owner, not the caller.

-- ── internal-only helpers ──────────────────────────────────────────────────
revoke execute on function public.notify_user(uuid, text, text, text, jsonb) from anon, authenticated;
revoke execute on function public.notify_admins(text, text, text, jsonb)     from anon, authenticated;
revoke execute on function public.assign_visit_ref()                          from anon, authenticated;

-- trigger function: also pin its search_path (advisor 0011)
create or replace function public.assign_visit_ref()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.visit_ref is null then
    new.visit_ref := 'SV-' || lpad(nextval('public.site_visit_ref_seq')::text, 6, '0');
  end if;
  if new.scheduled_at is not null then
    new.preferred_date := (new.scheduled_at at time zone 'Asia/Kolkata')::date;
  end if;
  return new;
end $$;

revoke execute on function public.assign_visit_ref() from public, anon, authenticated;

-- ── signed-in-only RPCs: drop anon, keep authenticated ─────────────────────
-- Each already raises on a null auth.uid(); this closes the door earlier.
revoke execute on function public.book_site_visit(uuid, timestamptz, text, text) from anon;
revoke execute on function public.reschedule_site_visit(uuid, timestamptz, text) from anon;
revoke execute on function public.cancel_site_visit(uuid, text)                  from anon;
revoke execute on function public.set_site_visit_status(uuid, text)              from anon;
revoke execute on function public.resolve_contact(uuid, uuid)                    from anon;
revoke execute on function public.log_communication(text, uuid, uuid, uuid, uuid, uuid, text, text, jsonb) from anon;
revoke execute on function public.open_thread(uuid, uuid, uuid)                  from anon;
revoke execute on function public.send_message(uuid, text, text, text, text, text, uuid) from anon;
revoke execute on function public.mark_thread_read(uuid)                         from anon;
revoke execute on function public.my_unread_messages()                           from anon;
revoke execute on function public.my_threads()                                   from anon;
revoke execute on function public.admin_moderate_thread(uuid, boolean)           from anon;
revoke execute on function public.admin_delete_message(uuid)                     from anon;

-- `is_thread_member` / `is_thread_member_text` are referenced inside RLS and
-- storage policies, which are evaluated as the querying role — `authenticated`
-- must keep EXECUTE on them or every messaging read would fail.
revoke execute on function public.is_thread_member(uuid)      from anon;
revoke execute on function public.is_thread_member_text(text) from anon;
grant  execute on function public.is_thread_member(uuid)      to authenticated;
grant  execute on function public.is_thread_member_text(text) to authenticated;
