-- 0087 — a website site-visit request belongs to the buyer who was signed in.
--
-- BUG: `website_book_visit` (0079) inserted `buyer_id => null` unconditionally.
-- It was written as an ANONYMOUS booking path — the visitor types a name and a
-- mobile number and the row carries them as `guest_name` / `guest_phone` — and
-- that is still right for a signed-out visitor. But the website also offers the
-- same form to a signed-in buyer, and for them the row was orphaned: it exists,
-- the desk is notified, the promoter is notified, and it never appears in the
-- buyer's own /account/visits list, because that list filters on `buyer_id`.
--
-- Reported as "Requested status not displayed in Site Visits". The status chip
-- was never the problem — VisitsView already renders one for every row and
-- already has a gold tone for `requested`. The ROW was missing. Confirmed
-- before changing anything: every `requested` row in the table had
-- `buyer_id IS NULL` (2 of 2), while all three rows the reporter could see were
-- exactly the three that had a buyer.
--
-- `auth.uid()` is null for an anonymous caller, so the anonymous path is
-- byte-for-byte unchanged. SECURITY DEFINER does not affect `auth.uid()` — it
-- reads the caller's JWT claims, not the function owner's — so this attributes
-- the visit to whoever actually submitted it and cannot be spoofed by a
-- parameter.
--
-- ⚠️ Deliberately NOT taking the name/mobile from the profile when signed in.
-- The buyer may be booking on someone else's behalf, and the number they type
-- is the number the desk should ring. `guest_*` stays as typed.

create or replace function public.website_book_visit(
  p_name text,
  p_mobile text,
  p_property uuid,
  p_scheduled_at timestamptz,
  p_slot_label text,
  p_email text default null,
  p_message text default null,
  p_ref text default null,
  p_source_url text default null,
  p_consent boolean default false
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
  v_slot     text := trim(coalesce(p_slot_label, ''));
  v_promoter uuid;
  v_title    text;
  v_owner    uuid;
  v_visit    uuid;
  v_vref     text;
  v_when     text;
  v_notes    text;
  -- The whole change. Null when nobody is signed in.
  v_buyer    uuid := auth.uid();
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

  if v_email is not null and v_email !~ '^[^@\s]+@[^@\s.]+\.[^@\s]+$' then
    return jsonb_build_object('ok', false, 'error', 'That email address does not look right.');
  end if;

  if v_slot not in ('Morning · 9–11 am', 'Midday · 11 am–1 pm',
                    'Afternoon · 2–4 pm', 'Evening · 4–6 pm') then
    return jsonb_build_object('ok', false, 'error', 'Please choose a visiting time.');
  end if;

  if p_scheduled_at is null or p_scheduled_at < now() then
    return jsonb_build_object('ok', false, 'error', 'Please choose a date in the future.');
  end if;
  if p_scheduled_at > now() + interval '90 days' then
    return jsonb_build_object('ok', false, 'error', 'Please choose a date within the next three months.');
  end if;

  select pr.title, pr.promoter_id
    into v_title, v_owner
    from properties pr
   where pr.id = p_property and pr.status in ('available', 'reserved')
   limit 1;

  if v_title is null then
    return jsonb_build_object(
      'ok', false,
      'error', 'That development is not open for visits. Please pick one that is currently selling.');
  end if;

  if exists (
    select 1 from site_visits
     where guest_phone = v_mobile
       and property_id = p_property
       and created_at > now() - interval '10 minutes'
  ) then
    return jsonb_build_object('ok', true, 'note', 'already_received');
  end if;

  if (select count(*) from site_visits
       where guest_phone = v_mobile and created_at > now() - interval '1 hour') >= 4 then
    return jsonb_build_object('ok', true, 'note', 'already_received');
  end if;

  if v_ref is not null then
    select id into v_promoter
      from profiles
     where (role = 'promoter' or partner_status = 'verified')
       and (upper(coalesce(partner_code, '')) = v_ref
         or upper(coalesce(referral_code, '')) = v_ref)
     limit 1;
  end if;
  v_promoter := coalesce(v_promoter, v_owner);

  insert into site_visits (
    property_id, buyer_id, promoter_id, scheduled_at, slot_label,
    status, notes, source, guest_name, guest_phone, guest_email
  ) values (
    p_property, v_buyer, v_promoter, p_scheduled_at, v_slot,
    'requested'::visit_status, nullif(v_message, ''), 'website',
    v_name, v_mobile, v_email
  )
  returning id, visit_ref into v_visit, v_vref;

  v_when := to_char(p_scheduled_at at time zone 'Asia/Kolkata', 'Dy DD Mon') || ' · ' || v_slot;

  v_notes := 'Site visit requested: ' || v_when || ' (' || v_vref || ')'
             || coalesce(E'\n' || nullif(v_message, ''), '');

  insert into leads (
    promoter_id, property_id, source, status, name, phone, email, notes,
    referral_code, source_url, campaign, consent_marketing, consent_at
  ) values (
    v_promoter, p_property, 'website', 'new', v_name, v_mobile, v_email, v_notes,
    v_ref, left(coalesce(p_source_url, ''), 500), 'site-visit',
    coalesce(p_consent, false),
    case when coalesce(p_consent, false) then now() else null end
  );

  perform notify_admins(
    'visit', 'Site visit booked from the website',
    v_name || ' (+91' || v_mobile || ') · ' || v_title || ' — ' || v_when,
    jsonb_build_object('visit_id', v_visit, 'property_id', p_property,
                       'visit_ref', v_vref, 'source', 'website')
  );

  if v_promoter is not null then
    perform notify_user(
      v_promoter, 'visit', 'New site visit request',
      v_name || ' (+91' || v_mobile || ') asked to visit ' || v_title || ' — ' || v_when,
      jsonb_build_object('visit_id', v_visit, 'property_id', p_property,
                         'visit_ref', v_vref, 'source', 'website')
    );
  end if;

  -- ⚠️ `user_id` follows the same rule: null stays null for a guest, so the
  -- activity log keeps matching the row it describes.
  insert into activity_log (user_id, event_type, meta)
  values (v_buyer, 'website_site_visit_booked',
          jsonb_build_object('visit_id', v_visit, 'property_id', p_property,
                             'scheduled_at', p_scheduled_at, 'visit_ref', v_vref));

  return jsonb_build_object('ok', true, 'visit_ref', v_vref, 'when', v_when);
end;
$function$;

-- ── one-off repair of the rows the bug orphaned ────────────────────────────────
--
-- Every website visit booked before this migration has `buyer_id IS NULL`, so
-- none of them has ever appeared in the buyer's own list. Where the number they
-- typed matches EXACTLY ONE profile, the owner is not in doubt and the row is
-- reattached.
--
-- ⚠️ THIS IS A REPAIR, NOT A RULE. Do not turn phone-matching into an ongoing
-- way of assigning visits to accounts: a visitor may legitimately type someone
-- else's number (booking for a parent, a spouse, a client), and matching on it
-- would hand that person's account a booking they never made. Going forward the
-- link comes from `auth.uid()` above, which is the caller proving who they are.
--
-- Scoped three ways: website-sourced rows only, currently unowned only, and
-- only where the match is unique.

update public.site_visits v
   set buyer_id = p.id
  from public.profiles p
 where v.buyer_id is null
   and v.source = 'website'
   and v.guest_phone is not null
   and p.mobile in (v.guest_phone, '91' || v.guest_phone)
   and (select count(*) from public.profiles q
         where q.mobile in (v.guest_phone, '91' || v.guest_phone)) = 1;
