-- 0030 — Anonymous referral-click logging for the public /welcome landing page.
-- The Referral Centre already surfaces a "clicks" stat (0011), but nothing
-- could ever write a click for a web visitor. The landing page calls this RPC
-- when it is opened with ?ref=<code>. Stats-only insert; unknown codes no-op.

create or replace function public.log_referral_click(p_code text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ref uuid;
begin
  if p_code is null or length(p_code) > 64 then return; end if;

  select id into v_ref from public.profiles
   where referral_code = p_code or partner_code = p_code limit 1;
  if v_ref is null then
    select id into v_ref from public.promoter_profiles
     where referral_code = p_code limit 1;
  end if;
  if v_ref is null then return; end if;

  insert into public.referral_events (referrer_id, event_type, meta)
  values (v_ref, 'click', jsonb_build_object('source', 'web_landing', 'code', p_code));
end;
$$;

revoke execute on function public.log_referral_click(text) from public;
grant execute on function public.log_referral_click(text) to anon, authenticated;
