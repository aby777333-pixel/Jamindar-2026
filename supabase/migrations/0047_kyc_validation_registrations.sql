-- 0047 — Report 28-07:
-- • Server-side KYC validation (PAN 10-char format, Aadhaar exactly 12 digits,
--   nominee PAN/Aadhaar/phone when provided) inside submit_kyc; values are
--   stored normalized (PAN uppercased, Aadhaar/phone digits-only).
-- • admin_registration_details(): the Registration Details table for the
--   admin dashboards (user id, name, registration date, buy status). Buy
--   status is honest: true only when a 'purchase' referral event exists for
--   the user — no purchase concept exists elsewhere in the schema yet.
-- Body of submit_kyc otherwise identical to 0009.

create or replace function public.submit_kyc(p_payload jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid; v_uid uuid := auth.uid();
  v_pan text := upper(trim(coalesce(p_payload->>'pan_number','')));
  v_aadhaar text := regexp_replace(coalesce(p_payload->>'aadhaar_number',''), '\D', '', 'g');
  v_nom_pan text := upper(trim(coalesce(p_payload->>'nominee_pan','')));
  v_nom_aadhaar text := regexp_replace(coalesce(p_payload->>'nominee_aadhaar',''), '\D', '', 'g');
  v_nom_phone text := regexp_replace(coalesce(p_payload->>'nominee_phone',''), '\D', '', 'g');
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  -- validation (mirrors the client rules; the server is the authority)
  if v_pan !~ '^[A-Z]{5}[0-9]{4}[A-Z]$' then
    raise exception 'Enter a valid 10-character PAN (format: ABCDE1234F).';
  end if;
  if v_aadhaar !~ '^[0-9]{12}$' then
    raise exception 'Aadhaar must be exactly 12 digits.';
  end if;
  if coalesce(p_payload->>'nominee_pan','') <> '' and v_nom_pan !~ '^[A-Z]{5}[0-9]{4}[A-Z]$' then
    raise exception 'Nominee PAN must be a valid 10-character PAN (format: ABCDE1234F).';
  end if;
  if coalesce(p_payload->>'nominee_aadhaar','') <> '' and v_nom_aadhaar !~ '^[0-9]{12}$' then
    raise exception 'Nominee Aadhaar must be exactly 12 digits.';
  end if;
  if coalesce(p_payload->>'nominee_phone','') <> '' and v_nom_phone !~ '^[0-9]{10}$' then
    raise exception 'Nominee phone must be exactly 10 digits.';
  end if;

  insert into public.kyc_submissions (
    user_id, status,
    pan_number, aadhaar_number, pan_doc, aadhaar_front, aadhaar_back,
    addr_house, addr_street, addr_landmark, addr_area, addr_city, addr_district, addr_state, addr_country, addr_pincode,
    bank_account_name, bank_account_number, bank_ifsc, bank_name, bank_branch, bank_proof, upi_id,
    nominee_name, nominee_relationship, nominee_phone, nominee_email, nominee_address,
    nominee_pan, nominee_aadhaar, nominee_pan_doc, nominee_aadhaar_front, nominee_aadhaar_back
  ) values (
    v_uid, 'pending',
    v_pan, v_aadhaar, p_payload->>'pan_doc', p_payload->>'aadhaar_front', p_payload->>'aadhaar_back',
    p_payload->>'addr_house', p_payload->>'addr_street', p_payload->>'addr_landmark', p_payload->>'addr_area', p_payload->>'addr_city', p_payload->>'addr_district', p_payload->>'addr_state', coalesce(p_payload->>'addr_country','India'), p_payload->>'addr_pincode',
    p_payload->>'bank_account_name', p_payload->>'bank_account_number', p_payload->>'bank_ifsc', p_payload->>'bank_name', p_payload->>'bank_branch', p_payload->>'bank_proof', p_payload->>'upi_id',
    p_payload->>'nominee_name', p_payload->>'nominee_relationship', nullif(v_nom_phone,''), p_payload->>'nominee_email', p_payload->>'nominee_address',
    nullif(v_nom_pan,''), nullif(v_nom_aadhaar,''), p_payload->>'nominee_pan_doc', p_payload->>'nominee_aadhaar_front', p_payload->>'nominee_aadhaar_back'
  ) returning id into v_id;
  perform set_config('app.allow_protected', 'on', true);
  update public.profiles set kyc_status = 'pending' where id = v_uid;
  insert into public.activity_log(user_id, event_type, meta) values (v_uid, 'kyc_submitted', jsonb_build_object('submission_id', v_id));
  return v_id;
end;
$$;

revoke execute on function public.submit_kyc(jsonb) from public, anon;
grant  execute on function public.submit_kyc(jsonb) to authenticated;

-- Registration Details for the admin dashboards (search/sort/pagination are
-- client-side over this bounded set).
create or replace function public.admin_registration_details(p_limit int default 500)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_out jsonb;
begin
  if not exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin') then
    raise exception 'not authorized';
  end if;
  select coalesce(jsonb_agg(j), '[]'::jsonb) into v_out from (
    select jsonb_build_object(
      'user_id', pr.member_code,
      'name', coalesce(pr.full_name, 'Member'),
      'role', pr.role,
      'mobile', pr.mobile,
      'registered_at', pr.created_at,
      'bought', exists (
        select 1 from public.referral_events e
        where e.referred_id = pr.id and e.event_type = 'purchase')
    ) as j
    from public.profiles pr
    order by pr.created_at desc
    limit least(greatest(coalesce(p_limit, 500), 1), 1000)
  ) q;
  return v_out;
end $$;

revoke execute on function public.admin_registration_details(int) from public, anon;
grant  execute on function public.admin_registration_details(int) to authenticated;
