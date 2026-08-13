-- 0089 — `website_callback`, for the "talk to an executive" band that now
-- appears on the ordinary pages.
--
-- ⚠️ THE WHOLE POINT IS THE DIFFERENTIATOR. A Vault enquiry and a site-wide
-- callback are handled by different people with different expectations, and
-- until now the site had no way to tell an admin which was which. They now
-- separate three ways: different TABLE (vault_requests vs leads), different
-- lead SOURCE ('website_callback' vs 'website'), and a different notification
-- meta.source ('website' vs 'vault').
--
-- ⚠️ Three fields and nothing else. A callback form that asks for a budget is a
-- lead-capture form wearing a callback's clothes.
create or replace function public.website_callback(
  p_name text, p_mobile text,
  p_when text default null, p_email text default null,
  p_ref text default null, p_source_url text default null,
  p_consent boolean default false
) returns jsonb
language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_name   text := trim(coalesce(p_name, ''));
  v_mobile text := regexp_replace(coalesce(p_mobile, ''), '\D', '', 'g');
  v_email  text := nullif(lower(trim(coalesce(p_email, ''))), '');
  v_when   text := nullif(left(trim(coalesce(p_when, '')), 40), '');
  v_promoter uuid;
  v_id uuid;
begin
  if length(v_name) < 2 or length(v_name) > 80 then
    return jsonb_build_object('ok', false, 'error', 'Please enter your name.');
  end if;

  if v_mobile ~ '^91[0-9]{10}$' then v_mobile := right(v_mobile, 10); end if;
  if v_mobile !~ '^[6-9][0-9]{9}$' then
    return jsonb_build_object('ok', false, 'error', 'Please enter a valid 10-digit mobile number.');
  end if;

  if v_email is not null and v_email !~ '^[^@\s]+@[^@\s.]+\.[^@\s]+$' then
    return jsonb_build_object('ok', false, 'error', 'That email address does not look right.');
  end if;

  -- Same courtesy the other three RPCs extend: a second tap inside ten minutes
  -- is the same person, not a second request.
  if exists (
    select 1 from leads
     where phone = v_mobile
       and source = 'website_callback'
       and created_at > now() - interval '10 minutes'
  ) then
    return jsonb_build_object('ok', true, 'note', 'already_received');
  end if;

  if (select count(*) from leads
       where phone = v_mobile and created_at > now() - interval '24 hours') >= 8 then
    return jsonb_build_object('ok', true, 'note', 'already_received');
  end if;

  -- A referral code in the link still attributes the caller, exactly as the
  -- enquiry form does.
  select p.id into v_promoter
    from profiles p
   where nullif(upper(trim(coalesce(p_ref, ''))), '') is not null
     and upper(p.referral_code) = upper(trim(p_ref))
   limit 1;

  insert into leads (name, phone, email, source, status, promoter_id,
                     referral_code, source_url, notes,
                     consent_marketing, consent_at)
  values (v_name, v_mobile, v_email, 'website_callback', 'new', v_promoter,
          nullif(upper(trim(coalesce(p_ref, ''))), ''),
          left(coalesce(p_source_url, ''), 500),
          case when v_when is null then null else 'Prefers a call: ' || v_when end,
          coalesce(p_consent, false),
          case when coalesce(p_consent, false) then now() else null end)
  returning id into v_id;

  insert into notifications (user_id, type, title, body, meta)
  select p.id, 'lead', 'Callback requested',
         v_name || ' asked for a call back' ||
           case when v_when is null then '' else ' (' || v_when || ')' end || '.',
         jsonb_build_object('source', 'website', 'channel', 'callback', 'lead', v_id)
    from profiles p
   where p.role = 'super_admin';

  return jsonb_build_object('ok', true);
end;
$function$;

revoke execute on function public.website_callback(text, text, text, text, text, text, boolean) from public;
grant execute on function public.website_callback(text, text, text, text, text, text, boolean) to anon, authenticated;
