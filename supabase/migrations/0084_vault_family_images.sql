-- 0084 — THE VAULT: artwork for the asset families.
--
-- The owner supplied one picture per family on 2026-08-11. They could have been
-- hard-coded into the website's `FamilyBlock`, and that would have been wrong
-- for the same reason §19 gives everywhere else on this page: a family is a row
-- in `vault_categories`, adding one is a console action, and its picture has to
-- be changeable by the same person in the same place.
--
-- ⚠️ WHY NOT `vault_categories.image_url`? Because that column is per-CATEGORY
-- and this is a per-FAMILY picture. "Coastal & Waterfront" is eight rows, not
-- one, and there is no row that owns the family. Hanging the family's art off
-- an arbitrary member row would mean deleting that one category silently
-- deletes the family's picture.
--
-- So it is a map, keyed by the slug the website derives from the family name
-- (`familySlug()` — lower-cased, `&` → "and", non-alphanumerics to hyphens).
-- Shape: { "coastal-and-waterfront": "/vault/family/coastal-and-waterfront.webp", … }
--
-- The values are LOCAL PATHS today because the files ship with the site. A URL
-- into the public bucket works identically, so replacing a picture from the
-- console is a matter of pasting one — no deploy, no migration.
--
-- ⚠️ HERITAGE INDIA IS DELIBERATELY ABSENT. Six pictures were supplied for
-- seven families. Heritage does not use `FamilyBlock` at all — it has its own
-- feature band further down /vault — so it keeps its drawn plate until a
-- picture arrives for it. Adding a `heritage-india` key here does nothing; the
-- band reads its own art.

insert into vault_settings (key, value, is_public)
values ('familyImages', jsonb_build_object(
  'coastal-and-waterfront',            '/vault/family/coastal-and-waterfront.webp',
  'mountains-and-nature',              '/vault/family/mountains-and-nature.webp',
  'land-and-agricultural-estates',     '/vault/family/land-and-agricultural-estates.webp',
  'exceptional-residences',            '/vault/family/exceptional-residences.webp',
  'hospitality-and-investment-assets', '/vault/family/hospitality-and-investment-assets.webp',
  'rare-commercial-assets',            '/vault/family/rare-commercial-assets.webp'
), true)
on conflict (key) do nothing;
