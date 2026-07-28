-- 0051b: V-Card eligibility fix — the owner (super_admin) is also a verified
-- partner, but promoter_card/card_inquiry matched role='promoter' only.
-- New rule: the card resolves for anyone with the promoter role OR a
-- verified partner status. Demoted partners (role buyer, status pending/
-- rejected) stay hidden.

create or replace function public.promoter_card(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_p record;
  v_promo record;
  v_projects jsonb;
begin
  if p_code is null or length(trim(p_code)) < 3 or length(trim(p_code)) > 40 then
    return null;
  end if;

  select id, full_name, avatar_url, mobile, email, city, district, state,
         member_code, partner_code, referral_code, partner_status
    into v_p
    from profiles
   where (role = 'promoter' or partner_status = 'verified')
     and (upper(coalesce(partner_code, '')) = upper(trim(p_code))
       or upper(coalesce(referral_code, '')) = upper(trim(p_code)))
   limit 1;
  if not found then
    return null;
  end if;

  select referral_code, bio, designation, company, whatsapp, vcard
    into v_promo
    from promoter_profiles
   where id = v_p.id;

  select coalesce(jsonb_agg(row_data), '[]'::jsonb) into v_projects
  from (
    select jsonb_build_object(
             'id', id,
             'title', title,
             'project_name', project_name,
             'city', city,
             'price', price,
             'status', status,
             'phase', project_phase,
             'image', images -> 0
           ) as row_data
      from properties
     where status in ('available', 'reserved')
     order by is_featured desc, created_at desc
     limit 6
  ) t;

  return jsonb_build_object(
    'name',          v_p.full_name,
    'avatar_url',    v_p.avatar_url,
    'verified',      v_p.partner_status = 'verified',
    'partner_code',  v_p.partner_code,
    'member_code',   v_p.member_code,
    'referral_code', coalesce(v_p.referral_code, v_promo.referral_code, v_p.member_code),
    'designation',   coalesce(nullif(trim(v_promo.designation), ''), 'Jamin Partner'),
    'company',       coalesce(nullif(trim(v_promo.company), ''), 'Jamin Properties'),
    'bio',           v_promo.bio,
    'mobile',        v_p.mobile,
    'whatsapp',      coalesce(nullif(trim(v_promo.whatsapp), ''), v_p.mobile),
    'email',         v_p.email,
    'location',      nullif(concat_ws(', ', v_p.city, v_p.district, v_p.state), ''),
    'socials',       coalesce(v_promo.vcard, '{}'::jsonb),
    'projects',      v_projects
  );
end;
$$;

create or replace function public.card_inquiry(
  p_code text,
  p_name text,
  p_mobile text,
  p_message text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_promoter uuid;
  v_name text := trim(coalesce(p_name, ''));
  v_mobile text := regexp_replace(coalesce(p_mobile, ''), '\D', '', 'g');
  v_message text := left(trim(coalesce(p_message, '')), 1000);
begin
  if length(v_name) < 2 or length(v_name) > 80 then
    return jsonb_build_object('ok', false, 'error', 'Please enter your name.');
  end if;
  if v_mobile ~ '^91[0-9]{10}$' then
    v_mobile := right(v_mobile, 10);
  end if;
  if v_mobile !~ '^[6-9][0-9]{9}$' then
    return jsonb_build_object('ok', false, 'error', 'Please enter a valid 10-digit mobile number.');
  end if;

  select id into v_promoter
    from profiles
   where (role = 'promoter' or partner_status = 'verified')
     and (upper(coalesce(partner_code, '')) = upper(trim(coalesce(p_code, '')))
       or upper(coalesce(referral_code, '')) = upper(trim(coalesce(p_code, ''))))
   limit 1;
  if v_promoter is null then
    return jsonb_build_object('ok', false, 'error', 'This card is no longer active.');
  end if;

  if exists (
    select 1 from leads
     where promoter_id = v_promoter
       and source = 'vcard'
       and notes like '%+91' || v_mobile || '%'
       and created_at > now() - interval '10 minutes'
  ) then
    return jsonb_build_object('ok', true, 'note', 'already_received');
  end if;

  insert into leads (promoter_id, source, status, notes)
  values (
    v_promoter,
    'vcard',
    'new',
    'V-Card inquiry — ' || v_name || ' · +91' || v_mobile
      || case when v_message <> '' then E'\n' || v_message else '' end
  );

  insert into notifications (user_id, type, title, body, meta)
  values (
    v_promoter,
    'lead',
    'New inquiry from your V-Card',
    v_name || ' (+91' || v_mobile || ') reached out through your digital card.',
    jsonb_build_object('source', 'vcard')
  );

  return jsonb_build_object('ok', true);
end;
$$;
