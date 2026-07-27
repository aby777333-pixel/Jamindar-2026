-- 0034 — New project (owner materials, 27-07-2026). Data only.
--
-- The owner supplied 12 site photos + 4 videos (dated 27/07/2026) showing
-- ground levelling in progress — but NO name, location or plot details yet.
-- Nothing is invented (same rule as 0028): the listing carries only what the
-- material shows, is marked as an upcoming project, and every other field is
-- left for the admin to fill from the console (all provisions exist).
insert into public.properties (
  title, slug, project_name, description, property_type, project_phase,
  listing_type, status, is_featured,
  state,
  images, videos, seo
) values (
  'Jamin — New Project (Details Coming Soon)',
  'jamin-new-project-jul-2026',
  'Jamin New Project',
  'A new Jamin Properties plotted development is taking shape. Ground levelling and site development began in July 2026 — watch the live site photos and videos here. Layout plan, plot schedule, approvals and pricing will be published as they are finalised. Ask Jamindar or contact the Jamin desk to register your interest early.',
  'residential_plot', 'future', 'sale', 'available', true,
  'Tamil Nadu',
  jsonb_build_array(
    'https://zmxqozvivdluuxvvcegs.supabase.co/storage/v1/object/public/property-media/jamin-new-project-2026/photos/site-01.jpg',
    'https://zmxqozvivdluuxvvcegs.supabase.co/storage/v1/object/public/property-media/jamin-new-project-2026/photos/site-02.jpg',
    'https://zmxqozvivdluuxvvcegs.supabase.co/storage/v1/object/public/property-media/jamin-new-project-2026/photos/site-03.jpg',
    'https://zmxqozvivdluuxvvcegs.supabase.co/storage/v1/object/public/property-media/jamin-new-project-2026/photos/site-04.jpg',
    'https://zmxqozvivdluuxvvcegs.supabase.co/storage/v1/object/public/property-media/jamin-new-project-2026/photos/site-05.jpg',
    'https://zmxqozvivdluuxvvcegs.supabase.co/storage/v1/object/public/property-media/jamin-new-project-2026/photos/site-06.jpg',
    'https://zmxqozvivdluuxvvcegs.supabase.co/storage/v1/object/public/property-media/jamin-new-project-2026/photos/site-07.jpg',
    'https://zmxqozvivdluuxvvcegs.supabase.co/storage/v1/object/public/property-media/jamin-new-project-2026/photos/site-08.jpg',
    'https://zmxqozvivdluuxvvcegs.supabase.co/storage/v1/object/public/property-media/jamin-new-project-2026/photos/site-09.jpg',
    'https://zmxqozvivdluuxvvcegs.supabase.co/storage/v1/object/public/property-media/jamin-new-project-2026/photos/site-10.jpg',
    'https://zmxqozvivdluuxvvcegs.supabase.co/storage/v1/object/public/property-media/jamin-new-project-2026/photos/site-11.jpg',
    'https://zmxqozvivdluuxvvcegs.supabase.co/storage/v1/object/public/property-media/jamin-new-project-2026/photos/site-12.jpg'
  ),
  jsonb_build_array(
    'https://zmxqozvivdluuxvvcegs.supabase.co/storage/v1/object/public/property-media/jamin-new-project-2026/video/site-01.mp4',
    'https://zmxqozvivdluuxvvcegs.supabase.co/storage/v1/object/public/property-media/jamin-new-project-2026/video/site-02.mp4',
    'https://zmxqozvivdluuxvvcegs.supabase.co/storage/v1/object/public/property-media/jamin-new-project-2026/video/site-03.mp4',
    'https://zmxqozvivdluuxvvcegs.supabase.co/storage/v1/object/public/property-media/jamin-new-project-2026/video/site-04.mp4'
  ),
  jsonb_build_object(
    'title', 'Jamin Properties — New Plotted Development (Coming Soon)',
    'description', 'A new Jamin Properties project under development in Tamil Nadu. Site work in progress — details to be announced.'
  )
)
on conflict (slug) do nothing;

-- Column defaults put 1/1 in the plot counters, which would read as a real
-- plot schedule — the count is unknown until the layout is approved.
update public.properties set plots_total = null, plots_available = null
 where slug = 'jamin-new-project-jul-2026';
