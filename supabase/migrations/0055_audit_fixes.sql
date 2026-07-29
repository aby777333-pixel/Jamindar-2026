-- Jamindar — 0055: audit round 29-07 (backend items).
-- 1) my_threads() existed only in the live DB (0023 revokes it but nothing
--    created it) — captured here so a rebuilt/branched DB keeps the inbox.
-- 2) share_page_data defaulted the approvals OBJECT column to '[]' — every
--    other consumer treats approvals as Record<string,boolean>.

create or replace function public.my_threads()
returns table(
  thread_id uuid, subject text, property_id uuid, last_message_at timestamptz,
  last_message_preview text, is_locked boolean, counterpart_id uuid,
  counterpart_name text, counterpart_avatar text, counterpart_role text, unread integer
)
language sql stable security definer set search_path to 'public' as $$
  select
    t.id,
    t.subject,
    t.property_id,
    t.last_message_at,
    t.last_message_preview,
    t.is_locked,
    other.id,
    other.full_name,
    other.avatar_url,
    other.role::text,
    (
      select count(*)::int
        from public.messages m
       where m.thread_id = t.id
         and m.sender_id <> auth.uid()
         and m.deleted_at is null
         and (me.last_read_at is null or m.created_at > me.last_read_at)
    )
  from public.message_threads t
  join public.thread_participants me
    on me.thread_id = t.id and me.user_id = auth.uid()
  left join lateral (
    select p.id, p.full_name, p.avatar_url, p.role
      from public.thread_participants tp
      join public.profiles p on p.id = tp.user_id
     where tp.thread_id = t.id and tp.user_id <> auth.uid()
     limit 1
  ) other on true
  order by t.last_message_at desc;
$$;
revoke execute on function public.my_threads() from anon;

-- share_page_data: approvals must default to an object, matching lib/types.ts.
create or replace function public.share_page_data(p_property uuid, p_ref text default null)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
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
