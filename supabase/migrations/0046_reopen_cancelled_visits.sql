-- 0046 — Bug report 28-07: cancelled site visits could not be reopened.
-- The RPC already accepted requested/confirmed/completed from any state; the
-- blockers were UI-side. Server change here: a reopened visit no longer
-- carries its old cancel_reason. Body otherwise identical to 0020.

create or replace function public.set_site_visit_status(
  p_visit_id uuid,
  p_status   text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v       record;
  v_admin boolean;
  v_title text;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if p_status not in ('requested', 'confirmed', 'completed') then
    raise exception 'invalid status';
  end if;

  select * into v from public.site_visits where id = p_visit_id;
  if v.id is null then raise exception 'visit not found'; end if;

  select exists (select 1 from public.profiles p where p.id = v_uid and p.role = 'super_admin') into v_admin;
  if not (v_admin or v.promoter_id = v_uid) then
    raise exception 'not authorized';
  end if;

  -- a visit moving to an active/completed state sheds its cancellation note
  update public.site_visits
     set status = (p_status)::public.visit_status,
         cancel_reason = null
   where id = p_visit_id;

  select title into v_title from public.properties where id = v.property_id;

  if v.buyer_id is not null then
    perform public.notify_user(v.buyer_id, 'visit',
      case p_status when 'confirmed' then 'Site visit confirmed'
                    when 'completed' then 'Site visit completed'
                    when 'requested' then 'Site visit reopened'
                    else 'Site visit updated' end,
      coalesce(v_title, 'Your visit') || ' — ' ||
        coalesce(to_char(v.scheduled_at at time zone 'Asia/Kolkata', 'Dy DD Mon'), 'date to be confirmed') ||
        coalesce(' · ' || v.slot_label, ''),
      jsonb_build_object('visit_id', p_visit_id, 'property_id', v.property_id, 'status', p_status));
  end if;

  insert into public.activity_log (user_id, event_type, meta)
  values (v_uid, 'site_visit_status_changed',
          jsonb_build_object('visit_id', p_visit_id, 'status', p_status));
end $$;

revoke execute on function public.set_site_visit_status(uuid, text) from public;
grant  execute on function public.set_site_visit_status(uuid, text) to authenticated;
