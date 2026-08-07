-- 0076 — Jamin Journal: the editorial schema behind the Blog CMS.
--
-- The master brief (§115-183) asks for a publishing system, not an "add blog"
-- form: editorial workflow, SEO fields per article, authors and reviewers,
-- categories and tags, content clusters, FAQs, review-due dates, redirects on
-- slug change, and a real link between articles and Jamin inventory so the
-- property data feeds the writing and the writing feeds the properties back.
--
-- Read access is the important half of the security here. The public website
-- reads with the anon key, so the policy has to be exact: an article is
-- visible only when it is published AND its publish time has passed. A draft,
-- an article in review, or one scheduled for next week must not be reachable
-- by guessing its slug.
--
-- Writes are super-admin only, through the same `public.is_super_admin()`
-- helper every other admin surface uses.

-- ── enums ──────────────────────────────────────────────────────────────────
do $$ begin
  create type public.blog_status as enum
    ('draft', 'in_review', 'approved', 'scheduled', 'published', 'unpublished', 'archived');
exception when duplicate_object then null; end $$;

-- ── authors (§133) ─────────────────────────────────────────────────────────
create table if not exists public.blog_authors (
  id          uuid primary key default gen_random_uuid(),
  slug        text unique not null,
  name        text not null,
  title       text,
  bio         text,
  avatar_url  text,
  links       jsonb not null default '{}'::jsonb,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

comment on table public.blog_authors is
  'Bylines for Jamin Journal. "Reviewed by" on legal or financial pieces points here too (§134).';

-- ── categories (§121) ──────────────────────────────────────────────────────
create table if not exists public.blog_categories (
  id          uuid primary key default gen_random_uuid(),
  slug        text unique not null,
  name        text not null,
  description text,
  sort        integer not null default 100,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

comment on table public.blog_categories is
  'Editable from the console — deliberately not a hard-coded list in the app (§121).';

-- ── posts ──────────────────────────────────────────────────────────────────
create table if not exists public.blog_posts (
  id            uuid primary key default gen_random_uuid(),
  slug          text unique not null,
  title         text not null,
  excerpt       text,
  body          text,
  -- Article shape (guide / explainer / location / insight / story / news /
  -- checklist / comparison). Free text rather than an enum so the editorial
  -- team can add a format without a migration (§120).
  kind          text not null default 'guide',

  cover_url     text,
  cover_alt     text,

  category_id   uuid references public.blog_categories(id) on delete set null,
  author_id     uuid references public.blog_authors(id) on delete set null,
  reviewer_id   uuid references public.blog_authors(id) on delete set null,

  status        public.blog_status not null default 'draft',
  published_at  timestamptz,
  reviewed_at   timestamptz,
  -- §156: tax, registration cost and regulation drift. Flag the article for a
  -- second look rather than letting it quietly rot.
  review_due_at timestamptz,

  tags          text[] not null default '{}',

  -- {title, description, canonical, og_image, focus_keyword, noindex}
  seo           jsonb not null default '{}'::jsonb,

  -- §128 / §130: the circular connection the brief asks for. Articles point at
  -- real inventory; the property and location pages surface the articles back.
  related_property_ids uuid[] not null default '{}',
  related_locations    text[] not null default '{}',

  faqs          jsonb not null default '[]'::jsonb,   -- [{q, a}] (§149)
  disclaimer    text,                                 -- §135
  reading_minutes integer,

  is_featured   boolean not null default false,
  -- §131 content clusters: a pillar article, and the posts that support it.
  is_pillar     boolean not null default false,
  pillar_id     uuid references public.blog_posts(id) on delete set null,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on column public.blog_posts.related_property_ids is
  'Real properties this article should offer at the end. Never copy a price into the body — read it from the property row so it cannot go stale (§171).';

create index if not exists blog_posts_live_idx
  on public.blog_posts (published_at desc)
  where status = 'published';
create index if not exists blog_posts_category_idx on public.blog_posts (category_id);
create index if not exists blog_posts_tags_idx     on public.blog_posts using gin (tags);

-- Slug changes must not break an indexed URL (§158).
create table if not exists public.blog_redirects (
  from_slug  text primary key,
  to_slug    text not null,
  created_at timestamptz not null default now()
);

create or replace function public.blog_touch_updated_at()
returns trigger language plpgsql as $fn$
begin
  new.updated_at := now();
  return new;
end $fn$;

drop trigger if exists trg_blog_posts_updated on public.blog_posts;
create trigger trg_blog_posts_updated before update on public.blog_posts
  for each row execute function public.blog_touch_updated_at();

/**
 * Record a redirect automatically whenever a slug changes, so an article that
 * has been indexed under its old address keeps resolving.
 */
create or replace function public.blog_slug_redirect()
returns trigger language plpgsql as $fn$
begin
  if new.slug is distinct from old.slug then
    insert into public.blog_redirects(from_slug, to_slug)
    values (old.slug, new.slug)
    on conflict (from_slug) do update set to_slug = excluded.to_slug;
    -- A chain A→B→C should resolve straight to C.
    update public.blog_redirects set to_slug = new.slug where to_slug = old.slug;
  end if;
  return new;
end $fn$;

drop trigger if exists trg_blog_slug_redirect on public.blog_posts;
create trigger trg_blog_slug_redirect before update of slug on public.blog_posts
  for each row execute function public.blog_slug_redirect();

-- ── RLS ────────────────────────────────────────────────────────────────────
alter table public.blog_authors    enable row level security;
alter table public.blog_categories enable row level security;
alter table public.blog_posts      enable row level security;
alter table public.blog_redirects  enable row level security;

drop policy if exists blog_posts_public_read on public.blog_posts;
create policy blog_posts_public_read on public.blog_posts
  for select to anon, authenticated
  using (status = 'published' and coalesce(published_at, now()) <= now());

drop policy if exists blog_posts_admin_all on public.blog_posts;
create policy blog_posts_admin_all on public.blog_posts
  for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

drop policy if exists blog_authors_public_read on public.blog_authors;
create policy blog_authors_public_read on public.blog_authors
  for select to anon, authenticated using (is_active);

drop policy if exists blog_authors_admin_all on public.blog_authors;
create policy blog_authors_admin_all on public.blog_authors
  for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

drop policy if exists blog_categories_public_read on public.blog_categories;
create policy blog_categories_public_read on public.blog_categories
  for select to anon, authenticated using (is_active);

drop policy if exists blog_categories_admin_all on public.blog_categories;
create policy blog_categories_admin_all on public.blog_categories
  for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

drop policy if exists blog_redirects_public_read on public.blog_redirects;
create policy blog_redirects_public_read on public.blog_redirects
  for select to anon, authenticated using (true);

drop policy if exists blog_redirects_admin_all on public.blog_redirects;
create policy blog_redirects_admin_all on public.blog_redirects
  for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

-- Explicit grants. RLS decides the rows; the grant decides whether the role
-- may ask at all, and the two are separate — see the public-schema grant flip.
grant select on public.blog_posts, public.blog_authors, public.blog_categories,
                public.blog_redirects to anon, authenticated;
grant insert, update, delete on public.blog_posts, public.blog_authors,
                public.blog_categories, public.blog_redirects to authenticated;

-- ── seed: the editorial identity and the starting categories ───────────────
insert into public.blog_authors (slug, name, title, bio)
values ('jamin-editorial-team', 'Jamin Editorial Team', 'Jamin Properties',
        'Written and reviewed by the Jamin Properties team in Erode. We publish what we would want to know before buying land ourselves.')
on conflict (slug) do nothing;

insert into public.blog_categories (slug, name, description, sort) values
  ('buying-land',      'Buying Land',      'What to check, in what order, before money changes hands.', 10),
  ('legal-guides',     'Legal Guides',     'Patta, chitta, encumbrance and approval, in plain language.', 20),
  ('location-guides',  'Location Guides',  'The places Jamin builds, and what surrounds them.', 30),
  ('investment',       'Investment',       'How plotted land behaves as a long-term holding.', 40),
  ('project-stories',  'Project Stories',  'Inside a Jamin development, from land to handover.', 50),
  ('jamin-news',       'Jamin News',       'Announcements from Jamin Properties.', 60)
on conflict (slug) do nothing;
