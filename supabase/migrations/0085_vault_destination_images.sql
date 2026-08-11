-- 0085 — THE VAULT: artwork for the destinations, and for the Heritage band.
--
-- Seven more pictures from the owner on 2026-08-11, named after their region.
--
-- ⚠️ TWO DIFFERENT HOMES, BECAUSE THEY ARE TWO DIFFERENT KINDS OF THING.
--
-- A destination IS a row — `vault_destinations` has one per place and already
-- has an `image_url` column the page reads — so its picture belongs on the row.
-- Delete the place and its picture goes with it, which is correct.
--
-- Heritage India is a FAMILY: many `vault_categories` rows and no row that owns
-- it. That is the case 0084 made for the `familyImages` map, and Heritage joins
-- it now. 0084's note said adding a `heritage-india` key would do nothing
-- because the band drew its own plate; the band now reads the same map as every
-- other family, so that note is superseded and the key is live.
--
-- Values are local paths because the files ship with the site. A public-bucket
-- URL works identically in both places, so swapping a picture from the console
-- needs no deploy and no migration.
--
-- ⚠️ SIX OF TWELVE DESTINATIONS HAVE PICTURES. Lonavala, Bengaluru,
-- Chennai & ECR, Puducherry, Himachal Pradesh and Uttarakhand were not supplied
-- and keep their drawn plates — the card handles both, so the grid stays whole.
-- Never fill a gap by pointing two places at one photograph: these cards sit in
-- one grid, and the same picture under two names reads as a mistake at best and
-- as a claim about somewhere it was not taken at worst.

update vault_destinations as d
   set image_url = v.url
  from (values
    ('goa',       '/vault/destination/goa.webp'),
    ('nilgiris',  '/vault/destination/nilgiris.webp'),
    ('coorg',     '/vault/destination/coorg.webp'),
    ('kerala',    '/vault/destination/kerala.webp'),
    ('rajasthan', '/vault/destination/rajasthan.webp'),
    ('alibaug',   '/vault/destination/alibaug.webp')
  ) as v(slug, url)
 where d.slug = v.slug
   and d.image_url is null;   -- never overwrite a picture set from the console

-- Merged rather than replaced, so the six family pictures 0084 set survive.
update vault_settings
   set value = coalesce(value, '{}'::jsonb)
             || jsonb_build_object('heritage-india', '/vault/family/heritage-india.webp')
 where key = 'familyImages';
