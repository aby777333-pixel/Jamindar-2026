-- 0083 — THE VAULT'S GALLERY
--
-- A picture rail at the foot of /vault, filled by an administrator rather than
-- derived from inventory. It exists because the Vault's argument is visual and
-- its inventory may be empty for a long time: the desk can show what it deals
-- in without publishing a single property.
--
-- ⚠️ IT LIVES IN `vault_settings`, NOT IN A TABLE OF ITS OWN. It is page
-- furniture — an ordered list of pictures with optional captions — not a
-- record anything joins to. A table would have bought a foreign key nobody
-- needs and a second admin screen to maintain.
--
-- Shape: { "items": [ { "url": "...", "caption": "..." } ] }
--
-- ⚠️ `url` MUST point at the PUBLIC bucket. The website renders these directly
-- and `next.config.ts` only allows next/image to optimise
-- `zmxqozvivdluuxvvcegs.supabase.co/storage/v1/object/public/**`. A path into
-- the private `vault` bucket would render as a broken image, which is why the
-- console uploads gallery pictures to `property-media` and never to `vault`.
--
-- Seeded EMPTY on purpose. The website reserves the space and draws its own
-- engraved plates until there is something to put there, so an empty gallery
-- reads as a gallery awaiting pictures rather than as a missing section.

insert into vault_settings (key, value, is_public)
values ('gallery', jsonb_build_object('items', jsonb_build_array()), true)
on conflict (key) do nothing;
