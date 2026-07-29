-- 0060 — bug report #9: the enquiry notification must carry the user's actual
-- message (and expose it in meta) so the promoter can read the request without
-- hunting for the lead. Same signature — safe CREATE OR REPLACE; everything
-- else in the function is unchanged from 0053.
create or replace function public.share_capture_lead(
  p_ref text, p_property uuid, p_name text, p_mobile text,
  p_message text default null, p_intent text default 'enquiry')
returns jsonb
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_promoter uuid;
  v_prop_title text;
  v_name text := trim(coalesce(p_name, ''));
  v_mobile text := regexp_replace(coalesce(p_mobile, ''), '\D', '', 'g');
  v_message text := left(trim(coalesce(p_message, '')), 1000);
  v_intent text := case when p_intent = 'site_visit' then 'site_visit' else 'enquiry' end;
  v_source text := case when p_intent = 'site_visit' then 'share_site_visit' else 'share_page' end;
begin
  if length(v_name) < 2 or length(v_name) > 80 then
    return jsonb_build_object('ok', false, 'error', 'Please enter your name.');
  end if;
  if v_mobile ~ '^91[0-9]{10}$' then v_mobile := right(v_mobile, 10); end if;
  if v_mobile !~ '^[6-9][0-9]{9}$' then
    return jsonb_build_object('ok', false, 'error', 'Please enter a valid 10-digit mobile number.');
  end if;

  select id into v_promoter from profiles
   where (role = 'promoter' or partner_status = 'verified' or role = 'super_admin')
     and (upper(coalesce(partner_code, '')) = upper(trim(coalesce(p_ref, '')))
       or upper(coalesce(referral_code, '')) = upper(trim(coalesce(p_ref, ''))))
   limit 1;
  if v_promoter is null then
    -- fall back to the property's promoter so no web lead is ever lost
    select promoter_id into v_promoter from properties where id = p_property;
  end if;

  select title into v_prop_title from properties where id = p_property;

  if exists (
    select 1 from leads
     where coalesce(promoter_id, '00000000-0000-0000-0000-000000000000') = coalesce(v_promoter, '00000000-0000-0000-0000-000000000000')
       and source = v_source
       and notes like '%+91' || v_mobile || '%'
       and created_at > now() - interval '10 minutes'
  ) then
    return jsonb_build_object('ok', true, 'note', 'already_received');
  end if;

  insert into leads (promoter_id, property_id, source, status, referral_code, notes)
  values (
    v_promoter, p_property, v_source, 'new', upper(trim(coalesce(p_ref, ''))),
    case when v_intent = 'site_visit' then 'Site-visit request — ' else 'Share-page enquiry — ' end
      || v_name || ' · +91' || v_mobile
      || coalesce(' · ' || nullif(v_prop_title, ''), '')
      || case when v_message <> '' then E'\n' || v_message else '' end
  );

  if v_promoter is not null then
    insert into notifications (user_id, type, title, body, meta)
    values (
      v_promoter, 'lead',
      case when v_intent = 'site_visit' then 'New site-visit request 🏡' else 'New enquiry from your share link' end,
      v_name || ' (+91' || v_mobile || ')' ||
      case when v_prop_title is not null then ' is interested in ' || v_prop_title else ' reached out from your shared link.' end ||
      case when v_message <> '' then E'\n“' || v_message || '”' else '' end,
      jsonb_build_object('source', v_source, 'property_id', p_property, 'message', nullif(v_message, ''),
                         'name', v_name, 'mobile', '+91' || v_mobile)
    );
  end if;

  return jsonb_build_object('ok', true);
end $$;
