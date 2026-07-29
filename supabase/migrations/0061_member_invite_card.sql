-- 0061 — Buyer testing report: the Referral Centre QR of a plain BUYER led to
-- "Invite not found", because promoter_card only matched promoters/verified
-- partners. Every user can refer (buyer module), so the card now resolves for
-- ANY profile — but contact details (mobile/WhatsApp/email) are only exposed
-- for VERIFIED partners; a buyer's invite shows name + code only, so nobody
-- can harvest phone numbers by guessing referral codes. Same signature.
create or replace function public.promoter_card(p_code text)
returns jsonb
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_p record;
  v_promo record;
  v_projects jsonb;
  v_verified boolean;
begin
  if p_code is null or length(trim(p_code)) < 3 or length(trim(p_code)) > 40 then
    return null;
  end if;

  -- verified partners / promoters first (unchanged behaviour), then any member
  select id, full_name, avatar_url, mobile, email, city, district, state,
         member_code, partner_code, referral_code, partner_status, role
    into v_p
    from profiles
   where (upper(coalesce(partner_code, '')) = upper(trim(p_code))
       or upper(coalesce(referral_code, '')) = upper(trim(p_code))
       or upper(coalesce(member_code, '')) = upper(trim(p_code)))
   order by (role = 'promoter' or partner_status = 'verified') desc
   limit 1;
  if not found then
    return null;
  end if;

  v_verified := (v_p.partner_status = 'verified');

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
    'verified',      v_verified,
    'partner_code',  v_p.partner_code,
    'member_code',   v_p.member_code,
    'referral_code', coalesce(v_p.referral_code, v_promo.referral_code, v_p.member_code),
    'designation',   case when v_verified or v_p.role = 'promoter'
                          then coalesce(nullif(trim(v_promo.designation), ''), 'Jamin Partner')
                          else 'Jamin Bazaar Member' end,
    'company',       coalesce(nullif(trim(v_promo.company), ''), 'Jamin Bazaar'),
    'bio',           case when v_verified then v_promo.bio else null end,
    'mobile',        case when v_verified then v_p.mobile else null end,
    'whatsapp',      case when v_verified then coalesce(nullif(trim(v_promo.whatsapp), ''), v_p.mobile) else null end,
    'email',         case when v_verified then v_p.email else null end,
    'location',      nullif(concat_ws(', ', v_p.city, v_p.district, v_p.state), ''),
    'socials',       case when v_verified then coalesce(v_promo.vcard, '{}'::jsonb) else '{}'::jsonb end,
    'projects',      v_projects
  );
end;
$$;
