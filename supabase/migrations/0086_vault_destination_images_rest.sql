-- 0086 — THE VAULT: the other six destinations.
--
-- 0085 pictured six of twelve and said the rest kept their drawn plates. The
-- owner supplied the remaining six an hour later, so all twelve now carry a
-- photograph and the grid no longer mixes plates with pictures.
--
-- Same `is null` guard as 0085: this fills gaps, it never overwrites a picture
-- an administrator has since set from the console. That is what makes both
-- migrations safe to re-run.

update vault_destinations as d
   set image_url = v.url
  from (values
    ('lonavala',         '/vault/destination/lonavala.webp'),
    ('bengaluru',        '/vault/destination/bengaluru.webp'),
    ('chennai-ecr',      '/vault/destination/chennai-ecr.webp'),
    ('puducherry',       '/vault/destination/puducherry.webp'),
    ('himachal-pradesh', '/vault/destination/himachal-pradesh.webp'),
    ('uttarakhand',      '/vault/destination/uttarakhand.webp')
  ) as v(slug, url)
 where d.slug = v.slug
   and d.image_url is null;
