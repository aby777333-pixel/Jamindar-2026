-- 0090 — `vault_request` accepts the co-develop intent and its five fields.
--
-- ⚠️ THE ROLE GUARD IS WRITTEN `is null or ... not in`, AND THE FIRST HALF IS
-- THE BUG FIX. Written the obvious way —
--
--     if v_role not in ('land', 'capital') then return <error>; end if;
--
-- — a request with no role at all sails straight through, because
-- `NULL not in ('land','capital')` evaluates to NULL rather than TRUE and the
-- branch never fires. Caught in testing: a call with every co-develop field
-- omitted returned a reference instead of an error and left a row whose
-- `codev_role` was null on an intent that cannot mean anything without one.
--
-- ⚠️ The CHECK constraint in 0088 does not catch it either, and should not — it
-- allows NULL because the other four intents have no role. Nullability that is
-- right for the table has to be enforced per-intent in the function.
create or replace function public.vault_request(
  p_intent text, p_name text, p_mobile text,
  p_email text default null, p_whatsapp text default null, p_preferred text default null,
  p_asset text default null, p_location text default null, p_alt text default null,
  p_budget text default null, p_size text default null, p_use text default null,
  p_features text default null, p_possession date default null, p_duration text default null,
  p_additional text default null, p_confidential text default null, p_brief text default null,
  p_attachments text[] default '{}', p_ref text default null, p_campaign text default null,
  p_source_url text default null, p_consent boolean default false,
  p_codev_role text default null, p_codev_extent text default null,
  p_codev_title text default null, p_codev_capital text default null,
  p_codev_horizon text default null
) returns jsonb
language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_name   text := trim(coalesce(p_name, ''));
  v_mobile text := regexp_replace(coalesce(p_mobile, ''), '\D', '', 'g');
  v_email  text := nullif(lower(trim(coalesce(p_email, ''))), '');
  v_wa     text := regexp_replace(coalesce(p_whatsapp, ''), '\D', '', 'g');
  v_intent vault_intent;
  v_role   text := nullif(lower(trim(coalesce(p_codev_role, ''))), '');
  v_ref    text;
begin
  if lower(coalesce(p_intent, '')) not in ('buy', 'rent', 'codevelop') then
    return jsonb_build_object('ok', false, 'error', 'Please choose what you would like to do.');
  end if;
  v_intent := lower(p_intent)::vault_intent;

  if v_intent = 'codevelop' then
    if v_role is null or v_role not in ('land', 'capital') then
      return jsonb_build_object('ok', false, 'error', 'Please tell us whether you are bringing land or capital.');
    end if;
  else
    v_role := null;
  end if;

  if length(v_name) < 2 or length(v_name) > 80 then
    return jsonb_build_object('ok', false, 'error', 'Please enter your name.');
  end if;

  if v_mobile ~ '^91[0-9]{10}$' then v_mobile := right(v_mobile, 10); end if;
  if v_mobile !~ '^[6-9][0-9]{9}$' then
    return jsonb_build_object('ok', false, 'error', 'Please enter a valid 10-digit mobile number.');
  end if;
  if v_wa ~ '^91[0-9]{10}$' then v_wa := right(v_wa, 10); end if;
  if v_wa !~ '^[6-9][0-9]{9}$' then v_wa := null; end if;

  if v_email is not null and v_email !~ '^[^@\s]+@[^@\s.]+\.[^@\s]+$' then
    return jsonb_build_object('ok', false, 'error', 'That email address does not look right.');
  end if;

  select reference into v_ref
    from vault_requests
   where mobile = v_mobile and created_at > now() - interval '10 minutes'
   limit 1;
  if v_ref is not null then
    return jsonb_build_object('ok', true, 'reference', v_ref, 'note', 'already_received');
  end if;

  if (select count(*) from vault_requests
       where mobile = v_mobile and created_at > now() - interval '24 hours') >= 8 then
    return jsonb_build_object('ok', true, 'note', 'already_received');
  end if;

  insert into vault_requests (
    intent, name, mobile, whatsapp, email, preferred_contact,
    asset_sought, preferred_location, alt_locations, budget_range, approx_size,
    intended_use, required_features, possession_date, rental_duration,
    additional_requirements, confidential_notes, brief, attachments,
    ref, campaign, source_url, consent, consent_at,
    codev_role, codev_extent, codev_title, codev_capital, codev_horizon
  ) values (
    v_intent, v_name, v_mobile, v_wa, v_email,
    nullif(left(trim(coalesce(p_preferred, '')), 40), ''),
    nullif(left(trim(coalesce(p_asset, '')), 200), ''),
    nullif(left(trim(coalesce(p_location, '')), 200), ''),
    nullif(left(trim(coalesce(p_alt, '')), 300), ''),
    nullif(left(trim(coalesce(p_budget, '')), 120), ''),
    nullif(left(trim(coalesce(p_size, '')), 120), ''),
    nullif(left(trim(coalesce(p_use, '')), 200), ''),
    nullif(left(trim(coalesce(p_features, '')), 600), ''),
    p_possession,
    nullif(left(trim(coalesce(p_duration, '')), 120), ''),
    nullif(left(trim(coalesce(p_additional, '')), 2000), ''),
    nullif(left(trim(coalesce(p_confidential, '')), 2000), ''),
    nullif(left(trim(coalesce(p_brief, '')), 4000), ''),
    coalesce(p_attachments, '{}'),
    nullif(upper(trim(coalesce(p_ref, ''))), ''),
    nullif(left(trim(coalesce(p_campaign, '')), 120), ''),
    left(coalesce(p_source_url, ''), 500),
    coalesce(p_consent, false),
    case when coalesce(p_consent, false) then now() else null end,
    v_role,
    nullif(left(trim(coalesce(p_codev_extent, '')), 160), ''),
    nullif(left(trim(coalesce(p_codev_title, '')), 400), ''),
    nullif(left(trim(coalesce(p_codev_capital, '')), 160), ''),
    nullif(left(trim(coalesce(p_codev_horizon, '')), 160), '')
  )
  returning reference into v_ref;

  insert into notifications (user_id, type, title, body, meta)
  select p.id, 'lead',
         case when v_intent = 'codevelop' then 'New co-development proposal'
              else 'New Vault requirement' end,
         v_name ||
           case when v_intent = 'codevelop'
                then ' wants to co-develop (' || v_role || ') — ' || v_ref || '.'
                else ' has sent a private requirement to The Vault (' || v_ref || ').' end,
         jsonb_build_object('source', 'vault', 'reference', v_ref,
                            'intent', v_intent::text, 'codev_role', v_role)
    from profiles p
   where p.role = 'super_admin';

  return jsonb_build_object('ok', true, 'reference', v_ref);
end;
$function$;
