-- 0026 — Jamin help desk contact details.
-- Data only; no schema change. 0021 created the `jamin_desk` row with null
-- numbers, which is why every channel in the contact hub rendered as
-- "Not available for this contact".
--
-- Owner-supplied (2026-07-25): one mobile used for both calls and WhatsApp,
-- plus email. There is no landline.
--
-- Stored with the +91 prefix on purpose: `tel:` needs the leading + to dial an
-- international-format number reliably, while lib/comms.ts strips the + again
-- for wa.me links. Kept editable by super admins via the platform_contacts
-- RLS policy, so this is a starting value, not a hardcoded constant.
insert into public.platform_contacts (id, label, mobile, whatsapp, email, is_active, updated_at)
values (
  'jamin_desk',
  'Jamin Properties Help Desk',
  '+919384818895',
  '+919384818895',
  'info@jaminproperties.com',
  true,
  now()
)
on conflict (id) do update
   set label      = excluded.label,
       mobile     = excluded.mobile,
       whatsapp   = excluded.whatsapp,
       email      = excluded.email,
       is_active  = true,
       updated_at = now();
