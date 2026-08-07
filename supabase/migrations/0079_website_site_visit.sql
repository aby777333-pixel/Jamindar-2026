-- 0079 — let a website visitor book a site visit with a real date and slot.
--
-- The website's "Book a site visit" button pointed at an enquiry form: two
-- fields and a promise to call back. Everything needed to take an actual
-- booking already exists — `site_visits` has `scheduled_at`, `slot_label`, a
-- `visit_ref` sequence, a status enum and an admin console that works them —
-- but `book_site_visit` (0021) requires `auth.uid()`, so it is unreachable from
-- a public page where nobody is signed in.
--
-- Rather than build a parallel booking table for the website, this teaches
-- `site_visits` about a guest: four nullable columns and one anon-callable RPC
-- shaped exactly like `website_enquiry` (0078). One table, one admin queue,
-- one visit_ref series. The app's own flow is untouched.
--
-- ⚠️ The RPC refuses a property that is not selling. The rule "a sold-out
-- development takes no bookings" lives here, in the database, not only in the
-- button that is currently hidden — a hidden button is a UI state, and UI state
-- is not a constraint.

-- ── guest columns ──────────────────────────────────────────────────────────
-- All nullable and additive. Every existing row keeps buyer_id and reads as
-- source 'app', which is what it was.
alter table public.site_visits
  add column if not exists guest_name  text,
  add column if not exists guest_phone text,
  add column if not exists guest_email text,
  add column if not exists source      text not null default 'app';

comment on column public.site_visits.guest_name is
  'Name given by an unauthenticated website visitor. Null for app bookings, where the name comes from the buyer profile.';
comment on column public.site_visits.source is
  '''app'' for a booking made inside Jamin Bazaar, ''website'' for one taken on the public site.';

-- The desk lives in the Requested queue; this is the index it reads by.
create index if not exists site_visits_source_status_idx
  on public.site_visits (source, status, created_at desc);

-- A guest booking has no buyer to look it up by, so the desk finds it by phone.
create index if not exists site_visits_guest_phone_idx
  on public.site_visits (guest_phone)
  where guest_phone is not null;

-- ── the booking RPC ────────────────────────────────────────────────────────
create or replace function public.website_book_visit(
  p_name         text,
  p_mobile       text,
  p_property     uuid,
  p_scheduled_at timestamptz,
  p_slot_label   text,
  p_email        text default null,
  p_message      text default null,
  p_ref          text default null,
  p_source_url   text default null,
  p_consent      boolean default false
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

  -- Only the slots the website publishes. An arbitrary string here would end up
  -- printed on the desk's list as if it were a real appointment window.
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

  -- ⚠️ Selling stock only, and the set matches `isSellable()` on the website
  -- exactly — available or reserved. A 'sold' development has nothing left to
  -- walk somebody around and nothing they could buy at the end of it, so taking
  -- the booking would only waste their Saturday. Keeping the two definitions
  -- identical matters: if the RPC were stricter than the UI, a page would offer
  -- a form that always fails.
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

  -- ── abuse guards (same shape as website_enquiry) ─────────────────────────
  -- A second submission for the same property within ten minutes is a double
  -- tap. Answer success rather than telling the visitor off for our latency.
  if exists (
    select 1 from site_visits
     where guest_phone = v_mobile
       and property_id = p_property
       and created_at > now() - interval '10 minutes'
  ) then
    return jsonb_build_object('ok', true, 'note', 'already_received');
  end if;

  -- Beyond that, four bookings an hour from one number. Silently accepted so a
  -- scripted flood learns nothing from the response.
  if (select count(*) from site_visits
       where guest_phone = v_mobile and created_at > now() - interval '1 hour') >= 4 then
    return jsonb_build_object('ok', true, 'note', 'already_received');
  end if;

  -- ── attribution (§40) ────────────────────────────────────────────────────
  -- A promoter is someone with the role OR a verified partner — the owner is
  -- the latter with the role super_admin, and a role-only test drops him.
  if v_ref is not null then
    select id into v_promoter
      from profiles
     where (role = 'promoter' or partner_status = 'verified')
       and (upper(coalesce(partner_code, '')) = v_ref
         or upper(coalesce(referral_code, '')) = v_ref)
     limit 1;
  end if;
  v_promoter := coalesce(v_promoter, v_owner);

  -- ── the booking ──────────────────────────────────────────────────────────
  -- buyer_id stays null on purpose. Matching the phone to an existing profile
  -- would let anyone put a visit on a stranger's account by typing their
  -- number; the desk links it when it confirms who called.
  insert into site_visits (
    property_id, buyer_id, promoter_id, scheduled_at, slot_label,
    status, notes, source, guest_name, guest_phone, guest_email
  ) values (
    p_property, null, v_promoter, p_scheduled_at, v_slot,
    'requested'::visit_status, nullif(v_message, ''), 'website',
    v_name, v_mobile, v_email
  )
  returning id, visit_ref into v_visit, v_vref;

  v_when := to_char(p_scheduled_at at time zone 'Asia/Kolkata', 'Dy DD Mon') || ' · ' || v_slot;

  -- ── the same booking as a lead ───────────────────────────────────────────
  -- The desk works one queue. A visit that never appeared in it would be a
  -- second pipeline to reconcile, which is exactly what 0078 avoided.
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

  -- ── who needs to know ────────────────────────────────────────────────────
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

  insert into activity_log (user_id, event_type, meta)
  values (null, 'website_site_visit_booked',
          jsonb_build_object('visit_id', v_visit, 'property_id', p_property,
                             'scheduled_at', p_scheduled_at, 'visit_ref', v_vref));

  -- The reference is returned so the visitor has something to quote on the
  -- phone, and so the confirmation is demonstrably about a real record.
  return jsonb_build_object('ok', true, 'visit_ref', v_vref, 'when', v_when);
end;
$function$;

revoke execute on function public.website_book_visit(text,text,uuid,timestamptz,text,text,text,text,text,boolean) from public;
grant  execute on function public.website_book_visit(text,text,uuid,timestamptz,text,text,text,text,text,boolean) to anon, authenticated;
