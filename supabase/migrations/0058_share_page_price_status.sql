-- 0058 — share_page_data: expose price/status so the /s/ share page can show
-- an explicit "₹ price" or "Price on Request" line and the availability state
-- (owner spec 29-07 §4). Same signature — safe CREATE OR REPLACE.
create or replace function public.share_page_data(p_property uuid, p_ref text default null)
returns jsonb
language plpgsql stable security definer set search_path to 'public'
as $$
declare
  v_prop jsonb;
  v_promoter jsonb;
  v_cfg jsonb;
begin
  select jsonb_build_object(
    'id', p.id, 'title', p.title, 'slug', p.slug,
    'description', p.description, 'project_phase', p.project_phase,
    'city', p.city, 'taluk', p.taluk, 'district', p.district, 'state', p.state,
    'images', coalesce(p.images, '[]'::jsonb),
    'brochure_url', p.brochure_url,
    'plots_total', p.plots_total, 'plots_available', p.plots_available,
    'amenities', coalesce(p.amenities, '[]'::jsonb),
    'approvals', coalesce(p.approvals, '{}'::jsonb),
    'rera_number', p.rera_number,
    'gmaps_url', p.gmaps_url,
    'price', p.price, 'price_unit', p.price_unit, 'price_negotiable', p.price_negotiable,
    'status', p.status,
    'translations', coalesce(p.translations, '{}'::jsonb)
  ) into v_prop
  from properties p
  where p.id = p_property and p.status <> 'archived';
  if v_prop is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;

  select jsonb_build_object(
    'id', pr.id,
    'name', pr.full_name,
    'avatar_url', pr.avatar_url,
    'mobile', pr.mobile,
    'email', pr.email,
    'whatsapp', coalesce(nullif(pp.whatsapp, ''), pr.mobile),
    'partner_code', pr.partner_code,
    'referral_code', pr.referral_code,
    'designation', pp.designation,
    'verified', (pr.partner_status = 'verified')
  ) into v_promoter
  from profiles pr
  left join promoter_profiles pp on pp.id = pr.id
  where (pr.role = 'promoter' or pr.partner_status = 'verified' or pr.role = 'super_admin')
    and (upper(coalesce(pr.partner_code, '')) = upper(trim(coalesce(p_ref, '')))
      or upper(coalesce(pr.referral_code, '')) = upper(trim(coalesce(p_ref, ''))))
  limit 1;

  select value into v_cfg from site_config where key = 'share';

  return jsonb_build_object('ok', true, 'property', v_prop, 'promoter', v_promoter,
                            'config', coalesce(v_cfg, '{}'::jsonb));
end $$;
