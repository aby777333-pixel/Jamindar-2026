-- 0010_property_experience.sql
-- Buyer-module Increment 4: rich property "experience" fields for the tabbed
-- detail page. Additive & non-breaking — all nullable / defaulted, existing
-- rows keep working (tabs gracefully show "Not available" when empty).

alter table public.properties
  add column if not exists master_plan_url  text,
  add column if not exists plot_layout      jsonb not null default '[]'::jsonb,   -- [{plot_no, status:'available'|'reserved'|'sold'}]
  add column if not exists documents        jsonb not null default '[]'::jsonb,   -- [{label, url, size}]
  add column if not exists drone_videos     jsonb not null default '[]'::jsonb,   -- [url]
  add column if not exists rera_number      text,
  add column if not exists legal            jsonb not null default '{}'::jsonb,   -- {ownership, encumbrance, notes}
  add column if not exists investment       jsonb not null default '{}'::jsonb,   -- {roi, rental_yield, appreciation, price_history:[{label,value}]}
  add column if not exists street_view_url  text,
  add column if not exists google_earth_url text,
  add column if not exists nearby_places    jsonb not null default '[]'::jsonb,   -- [{category, name, distance, duration}]
  add column if not exists tab_config       jsonb not null default '{}'::jsonb;   -- {order:[..], hidden:[..]} — admin tab control
