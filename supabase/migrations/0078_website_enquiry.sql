-- 0078 — enquiry capture for the public website.
--
-- Until now the website's only conversion path was a link that handed the
-- visitor to the app's login screen, which loses most of them at exactly the
-- moment they were interested (§39).
--
-- This is modelled directly on `card_inquiry` (0051), which already solved the
-- same problem for the V-Card: an anon-callable SECURITY DEFINER function that
-- validates its input, resolves attribution, de-duplicates, writes one lead and
-- notifies the right person. Copying that shape means the desk sees website
-- enquiries in the same queue, with the same statuses, as every other lead.
--
-- Why an RPC rather than an insert grant: `leads` must never be writable
-- directly by anon. A grant would let anyone forge promoter_id and steal
-- attribution — the commission engine reads that column.
--
-- Unlike card_inquiry this uses the real columns (`name`, `phone`, `email`,
-- `property_id`, `referral_code`, `source_url`, `campaign`, consent) that the
-- Lead Engine added in 0072/0073, instead of packing everything into `notes`.

create or replace function public.website_enquiry(
  p_name       text,
  p_mobile     text,
  p_email      text default null,
  p_property   uuid default null,
  p_message    text default null,
  p_ref        text default null,
  p_source_url text default null,
  p_campaign   text default null,
  p_consent    boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_name     text := trim(coalesce(p_name, ''));
  v_mobile   text := regexp_replace(coalesce(p_mobile, ''), '\D', '', 'g');
  v_email    text := nullif(lower(trim(coalesce(p_email, ''))), '');
  v_message  text := left(trim(coalesce(p_message, '')), 1000);
  v_ref      text := nullif(upper(trim(coalesce(p_ref, ''))), '');
  v_promoter uuid;
  v_property uuid;
begin
  -- ── validation ───────────────────────────────────────────────────────────
  if length(v_name) < 2 or length(v_name) > 80 then
    return jsonb_build_object('ok', false, 'error', 'Please enter your name.');
  end if;

  if v_mobile ~ '^91[0-9]{10}$' then
    v_mobile := right(v_mobile, 10);
  end if;
  if v_mobile !~ '^[6-9][0-9]{9}$' then
    return jsonb_build_object('ok', false, 'error', 'Please enter a valid 10-digit mobile number.');
  end if;

  if v_email is not null and v_email !~ '^[^@\s]+@[^@\s.]+\.[^@\s]+$' then
    return jsonb_build_object('ok', false, 'error', 'That email address does not look right.');
  end if;

  -- Only a real, published property may be attached. A forged id would put a
  -- lead against something the desk cannot open.
  if p_property is not null then
    select id into v_property
      from properties
     where id = p_property and status in ('available','reserved','sold')
     limit 1;
  end if;

  -- ── abuse guards ─────────────────────────────────────────────────────────
  -- A repeated submission within ten minutes is a double tap, not a second
  -- enquiry. Answer success so the visitor is not told off for our latency.
  if exists (
    select 1 from leads
     where phone = v_mobile
       and coalesce(property_id::text,'') = coalesce(v_property::text,'')
       and created_at > now() - interval '10 minutes'
  ) then
    return jsonb_build_object('ok', true, 'note', 'already_received');
  end if;

  -- Beyond that, cap one number at six enquiries an hour. Silently accepted so
  -- a scripted flood learns nothing from the response.
  if (select count(*) from leads
       where phone = v_mobile and created_at > now() - interval '1 hour') >= 6 then
    return jsonb_build_object('ok', true, 'note', 'already_received');
  end if;

  -- ── attribution (§40) ────────────────────────────────────────────────────
  -- Same rule as everywhere else in this system: a promoter is someone with
  -- the role OR a verified partner — the owner is the latter with the role
  -- super_admin, and a role-only test would drop his attribution.
  if v_ref is not null then
    select id into v_promoter
      from profiles
     where (role = 'promoter' or partner_status = 'verified')
       and (upper(coalesce(partner_code, '')) = v_ref
         or upper(coalesce(referral_code, '')) = v_ref)
     limit 1;
  end if;

  insert into leads (
    promoter_id, property_id, source, status, name, phone, email, notes,
    referral_code, source_url, campaign, consent_marketing, consent_at
  ) values (
    v_promoter, v_property, 'website', 'new', v_name, v_mobile, v_email,
    nullif(v_message, ''),
    v_ref, left(coalesce(p_source_url,''), 500), left(coalesce(p_campaign,''), 120),
    coalesce(p_consent, false),
    case when coalesce(p_consent, false) then now() else null end
  );

  if v_promoter is not null then
    insert into notifications (user_id, type, title, body, meta)
    values (
      v_promoter, 'lead', 'New enquiry from your link',
      v_name || ' (+91' || v_mobile || ') enquired through a page you shared.',
      jsonb_build_object('source', 'website')
    );
  end if;

  return jsonb_build_object('ok', true);
end;
$function$;

revoke execute on function public.website_enquiry(text,text,text,uuid,text,text,text,text,boolean) from public;
grant  execute on function public.website_enquiry(text,text,text,uuid,text,text,text,text,boolean) to anon, authenticated;
