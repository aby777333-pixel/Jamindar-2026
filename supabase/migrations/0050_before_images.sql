-- 0050: before_images — archived pre-development photos for completed projects.
-- Powers the Before/After gallery toggle on the property detail page.
-- Additive only; existing rows default to an empty list.

alter table public.properties
  add column if not exists before_images jsonb not null default '[]'::jsonb;

comment on column public.properties.before_images is
  'Pre-development photos shown under the "Before" gallery tab on completed projects. images stays the primary (after-completion) gallery.';
